import { create } from 'zustand';
import { API_BASE_URL } from '../lib/api';
import { fetchWithOfflineSync } from '../lib/offlineSync';
import { applyServerStaging } from '../lib/roomQueueSettings';

export interface TokenDisplayData {
  department: string;
  activeTokens: {
    id: string;
    token: string;
    room: string;
    patientName: string;
    uhid: string;
    doctorName?: string;
    calledAt?: number;
    recalledAt?: number;
  }[];
  nextTokens: string[];
  /** Waiting patients already sent to each room, in order (from the database). */
  stagedByRoom?: Record<string, string[]>;
}

interface QueueStore {
  liveQueues: Record<string, TokenDisplayData>; // key: departmentId
  activeInterval: (() => void) | null; // cancels the pending poll tick
  updateQueueData: (departmentId: string, data: TokenDisplayData) => void;
  fetchQueue: (departmentId: string) => Promise<void>;
  initializeWebSocket: (departmentId: string) => void; // Keeping the name to prevent breaking other files
  disconnectWebSocket: () => void;
}

const POLL_INTERVAL_MS = 2500;

/**
 * Upper bound on one live-queue request.
 *
 * The poll loop only schedules its next tick once the current request settles, and every
 * wake-up event joins the request already in flight. So a request that never answers (a
 * dropped Wi-Fi connection the browser still thinks is open, a stalled Neon wake-up)
 * froze the board until someone interacted with it. Aborting it lets the loop carry on.
 */
const FETCH_TIMEOUT_MS = 8000;

/**
 * Timers that keep their pace while the page is hidden.
 *
 * Chrome and Edge throttle main-thread timers on hidden pages, down to once a minute
 * after five minutes for chained timers like the poll loop. Windows can report the TV
 * window as hidden when its display sleeps, the PC locks, or another window covers it.
 * Timers in a dedicated worker are not throttled that way, so the worker keeps the beat
 * and the fetch still runs here on the main thread.
 */
let timerWorker: Worker | null | undefined; // undefined: not tried yet; null: unavailable
let nextTimerId = 0;
const timerCallbacks = new Map<number, () => void>();

function getTimerWorker(): Worker | null {
  if (timerWorker !== undefined) return timerWorker;
  timerWorker = null;
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;

  try {
    const source =
      'const t=new Map();onmessage=(e)=>{const{id,ms}=e.data;' +
      'if(ms<0){clearTimeout(t.get(id));t.delete(id);return;}' +
      't.set(id,setTimeout(()=>{t.delete(id);postMessage(id);},ms));};';
    const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));

    worker.onmessage = (e: MessageEvent<number>) => {
      const callback = timerCallbacks.get(e.data);
      timerCallbacks.delete(e.data);
      callback?.();
    };
    // If the worker cannot start, hand its waiting callbacks to ordinary timers rather
    // than leaving the poll loop waiting for a message that will never come.
    worker.onerror = () => {
      timerWorker = null;
      worker.terminate();
      for (const [id, callback] of timerCallbacks) {
        timerCallbacks.delete(id);
        setTimeout(callback, 0);
      }
    };

    timerWorker = worker;
  } catch {
    timerWorker = null;
  }
  return timerWorker;
}

/** Like setTimeout, but backed by the worker when possible. Returns a cancel function. */
function scheduleTimer(callback: () => void, ms: number): () => void {
  const worker = getTimerWorker();
  if (!worker) {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  }

  const id = ++nextTimerId;
  timerCallbacks.set(id, callback);
  worker.postMessage({ id, ms });
  return () => {
    if (timerCallbacks.delete(id)) worker.postMessage({ id, ms: -1 });
  };
}

/**
 * Signature of the last payload stored per department.
 *
 * The board polls 24 times a minute and the queue is unchanged on nearly all of them —
 * a doctor calls a patient every few minutes, not every few seconds. Storing a fresh
 * object regardless meant a new `liveQueues` reference on every tick, which re-rendered
 * the whole TV tree around the clock for no visible change. Comparing the serialised
 * payload first costs a few microseconds and skips the render entirely when it matches.
 *
 * Kept outside the store so it is never itself a subscribable value.
 */
const lastPayloadByDept = new Map<string, string>();

/**
 * Bumped whenever a poller starts or stops, so an async tick whose request was already
 * in flight can tell that it has been superseded and stop rescheduling itself.
 */
let pollGeneration = 0;

/**
 * The fetch currently in flight per department, so concurrent callers share one request.
 *
 * The wake-up events below can fire several times before any of their requests come
 * back — `visibilitychange`, `focus` and `resize` all land together when a minimised
 * window is restored. Without this each one opened its own connection to ask the same
 * question. Callers still get a promise that resolves when the data has landed, so
 * nothing downstream can tell the difference.
 */
const inFlightByDept = new Map<string, Promise<void>>();

/**
 * Collapses a burst of wake-up events into a single refetch.
 *
 * `resize` is the reason this exists: dragging or un-maximising a TV window emits it at
 * roughly display rate, and each event used to trigger a fetch for every open
 * department — several hundred queue queries over a two-second drag, all returning the
 * same rows. A leading-edge call keeps the restore-instantly behaviour these listeners
 * were added for, and the trailing call guarantees the final size/state is reflected.
 */
const WAKE_COALESCE_MS = 400;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
let lastWakeAt = 0;
let pendingWakeDept: string | undefined;

export const useQueueStore = create<QueueStore>((set, get) => ({
  liveQueues: {},
  activeInterval: null,
  updateQueueData: (departmentId, data) => {
    const signature = JSON.stringify(data);
    if (lastPayloadByDept.get(departmentId) === signature) return; // nothing changed
    lastPayloadByDept.set(departmentId, signature);

    set((state) => ({
      liveQueues: {
        ...state.liveQueues,
        [departmentId]: data,
      }
    }));
  },
  fetchQueue: (departmentId: string) => {
    // No department yet (the list is still loading): there is nothing to ask for, and
    // `/queue/live/` with a blank id is a guaranteed 404.
    if (!departmentId) return Promise.resolve();

    // Join the request already on the wire for this department rather than opening a
    // second one that would return the same rows.
    const existing = inFlightByDept.get(departmentId);
    if (existing) return existing;

    const request = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const startedAt = Date.now();
      try {
        const res = await fetchWithOfflineSync(`${API_BASE_URL}/queue/live/${departmentId}`, {
          signal: controller.signal,
          // A cached copy of this response is by definition an old queue.
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (data && (data.activeTokens || data.nextTokens)) {
            // Only the server's board carries staging; the offline fallback does not.
            if (data.stagedByRoom && typeof data.stagedByRoom === 'object') {
              applyServerStaging(departmentId, data.stagedByRoom, startedAt);
            }
            get().updateQueueData(departmentId, data);
          }
        }
      } catch (err) {
        // TypeError is a network failure and AbortError our own timeout; the next tick retries both.
        if (err instanceof Error && err.name !== 'TypeError' && err.name !== 'AbortError') {
          console.error(`Failed to fetch queue updates from ${API_BASE_URL}/queue/live/${departmentId}`, err);
        }
      } finally {
        clearTimeout(timeout);
        inFlightByDept.delete(departmentId);
      }
    })();

    inFlightByDept.set(departmentId, request);
    return request;
  },
  initializeWebSocket: (departmentId) => {
    // Prevent multiple pollers
    get().disconnectWebSocket();
    // Screens start polling again once their department is known.
    if (!departmentId) return;

    // Poll on a self-rescheduling timer rather than setInterval: the next request is
    // only queued once the previous one has settled. On a fixed interval a slow
    // response — a sleeping Neon instance can take several seconds to wake — let
    // requests stack up faster than they drained, and every queued one still had to be
    // sent and parsed once the backlog cleared.
    const generation = ++pollGeneration;

    const tick = async () => {
      await get().fetchQueue(departmentId);
      // A newer poller started, or disconnect ran, while this request was in flight.
      if (generation !== pollGeneration) return;
      set({ activeInterval: scheduleTimer(tick, POLL_INTERVAL_MS) });
    };

    // Fetch immediately, as the interval version did, then settle into the loop.
    void tick();
  },
  disconnectWebSocket: () => {
    // Retires any in-flight tick: it will see the changed generation and not reschedule.
    pollGeneration++;

    const { activeInterval } = get();
    if (activeInterval) {
      activeInterval();
      set({ activeInterval: null });
    }
  }
}));

function wakeUpAndFetchAll(targetDeptId?: string) {
  const state = useQueueStore.getState();
  if (targetDeptId) {
    void state.fetchQueue(targetDeptId);
  }
  const openDepts = Object.keys(state.liveQueues);
  for (const id of openDepts) {
    if (id !== targetDeptId) {
      void state.fetchQueue(id);
    }
  }
}

/**
 * Refetch the live queue in response to a UI event, at most once per coalescing window.
 *
 * Exported so every burst-prone listener — here and in the TV display — shares one
 * budget instead of each keeping its own.
 */
export function requestQueueWake(targetDeptId?: string) {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastWakeAt >= WAKE_COALESCE_MS) {
    lastWakeAt = now;
    wakeUpAndFetchAll(targetDeptId);
    return;
  }

  // Inside the window: remember the department and fire once when it closes. A wake for
  // a specific department outranks a general one, since it is the more precise request.
  if (targetDeptId) pendingWakeDept = targetDeptId;
  if (wakeTimer) return;

  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    lastWakeAt = Date.now();
    const dept = pendingWakeDept;
    pendingWakeDept = undefined;
    wakeUpAndFetchAll(dept);
  }, WAKE_COALESCE_MS - (now - lastWakeAt));
}

if (typeof window !== 'undefined') {
  // 1. Same-window custom events
  window.addEventListener('opd-queue-updated', ((e: CustomEvent) => {
    const deptId = e.detail?.departmentId;
    wakeUpAndFetchAll(deptId);
  }) as EventListener);

  // 2. Cross-tab and cross-window BroadcastChannel listener (instant real-time updates across separate windows)
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const syncChannel = new BroadcastChannel('opd-queue-sync-channel');
      syncChannel.onmessage = (event) => {
        if (event.data?.type === 'QUEUE_UPDATED') {
          wakeUpAndFetchAll(event.data.departmentId);
        }
      };
    } catch {}
  }

  // 3. Storage event listener (fallback for separate windows and minimized background tabs)
  window.addEventListener('storage', (e) => {
    if (e.key === 'opd_queue_last_updated' || e.key === 'local_tokens_store') {
      wakeUpAndFetchAll();
    }
  });

  // 4. Window focus, visibility, resize, and fullscreen events to immediately update when
  //    restored/unminimized. These are the burst-prone ones — a single un-maximise emits
  //    focus, visibilitychange and a long train of resizes — so they go through the
  //    coalescing path rather than firing a fetch each.
  window.addEventListener('focus', () => requestQueueWake());
  window.addEventListener('resize', () => requestQueueWake());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      requestQueueWake();
    }
  });
  document.addEventListener('fullscreenchange', () => requestQueueWake());
  document.addEventListener('webkitfullscreenchange', () => requestQueueWake());
  document.addEventListener('mozfullscreenchange', () => requestQueueWake());
  document.addEventListener('MSFullscreenChange', () => requestQueueWake());
}
