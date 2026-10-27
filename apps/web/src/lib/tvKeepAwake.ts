/**
 * Keeps an unattended TV board running at full speed.
 *
 * When Windows reports the TV window as hidden (another window covers it, the PC locks,
 * the display sleeps), Chrome and Edge throttle the page and, after a while, freeze it
 * outright or put the tab to sleep. A frozen page runs nothing — not even the worker
 * timer behind the poll loop — so the board sat on stale tokens until someone touched it.
 *
 * Browsers exempt tabs that are playing sound from freezing and sleeping. This plays a
 * constant 30 Hz tone at about -63 dBFS: well above Chrome's silence threshold (about
 * -72 dBFS), so the tab counts as audible, yet far below anything a TV speaker
 * reproduces at a normal volume.
 *
 * Autoplay rules keep a new AudioContext suspended until the first click or key press
 * on the page, so it retries on every gesture and whenever the page comes back. The TV
 * launcher script passes `--autoplay-policy=no-user-gesture-required`, which lets it
 * start with no click at all.
 */

let ctx: AudioContext | null = null;
let started = false;

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

function resume() {
  if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
}

function onVisibility() {
  if (document.visibilityState === 'visible') resume();
}

export function startTvKeepAwake(): void {
  if (typeof window === 'undefined' || started) return;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 30;
    gain.gain.value = 0.001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    started = true;
  } catch {
    ctx = null;
    return;
  }

  resume();
  for (const ev of GESTURE_EVENTS) window.addEventListener(ev, resume, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
}

export function stopTvKeepAwake(): void {
  if (!started) return;
  for (const ev of GESTURE_EVENTS) window.removeEventListener(ev, resume);
  document.removeEventListener('visibilitychange', onVisibility);
  void ctx?.close().catch(() => {});
  ctx = null;
  started = false;
}
