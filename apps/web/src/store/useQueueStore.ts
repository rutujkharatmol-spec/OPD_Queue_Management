import { create } from 'zustand';
import { API_BASE_URL } from '../lib/api';
import { fetchWithOfflineSync } from '../lib/offlineSync';

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
}

interface QueueStore {
  liveQueues: Record<string, TokenDisplayData>; // key: departmentId
  activeInterval: NodeJS.Timeout | null;
  updateQueueData: (departmentId: string, data: TokenDisplayData) => void;
  fetchQueue: (departmentId: string) => Promise<void>;
  initializeWebSocket: (departmentId: string) => void; // Keeping the name to prevent breaking other files
  disconnectWebSocket: () => void;
}

const POLL_INTERVAL_MS = 2500;

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
  fetchQueue: async (departmentId: string) => {
    try {
      const res = await fetchWithOfflineSync(`${API_BASE_URL}/queue/live/${departmentId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && (data.activeTokens || data.nextTokens)) {
          get().updateQueueData(departmentId, data);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'TypeError') {
        console.error(`Failed to fetch queue updates from ${API_BASE_URL}/queue/live/${departmentId}`, err);
      }
    }
  },
  initializeWebSocket: (departmentId) => {
    // Prevent multiple pollers
    get().disconnectWebSocket();

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
      set({ activeInterval: setTimeout(tick, POLL_INTERVAL_MS) });
    };

    // Fetch immediately, as the interval version did, then settle into the loop.
    void tick();
  },
  disconnectWebSocket: () => {
    // Retires any in-flight tick: it will see the changed generation and not reschedule.
    pollGeneration++;

    const { activeInterval } = get();
    if (activeInterval) {
      clearTimeout(activeInterval);
      set({ activeInterval: null });
    }
  }
}));
