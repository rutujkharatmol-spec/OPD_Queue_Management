import { playHospitalChime, announcePatientCall, stopAudioAnnouncement } from './speechService';
import { t, toAudioLang, type PatientLang } from './patientI18n';

/**
 * Getting a waiting patient's attention when their token is called or recalled.
 *
 * The tracker could always *show* the turn, but only if the patient happened to be looking
 * at the screen — which in an OPD waiting hall they are not. This layers the alert
 * channels a phone actually has (audio keep-alive, wake lock, system notifications,
 * vibration, and media session controls on lock screen) so the page can be opened once,
 * phone locked or pocketed, and the call/recall will still play audio aloud just like TV!
 */
export type AlertCapabilities = {
  /** Web Audio chime and speech. Works everywhere once unlocked by a user gesture. */
  sound: boolean;
  /** `navigator.vibrate`. Present on Android; absent on iOS Safari and on desktop. */
  vibration: boolean;
  /** A system notification that can arrive while the tab is in the background. */
  notifications: boolean;
  /** Notifications exist but the patient (or the browser) has denied them. */
  notificationsBlocked: boolean;
  /**
   * Notifications need a secure context. False here means the page is on plain HTTP —
   * worth telling the patient, since the alert then only works with the screen on.
   */
  secureContext: boolean;
};

const ENABLED_KEY = 'opd_patient_alerts';
const VOICE_KEY = 'opd_patient_alert_voice';

// Silent 1-second audio loop (base64 WAV) to keep the mobile browser's audio pipeline
// active in the background and prevent OS timer throttling when screen is locked/off.
const SILENT_AUDIO_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let backgroundAudioElement: HTMLAudioElement | null = null;
let wakeLockSentinel: any = null;

export async function requestWakeLock(): Promise<void> {
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    } catch {}
  }
}

export function releaseWakeLock(): void {
  if (wakeLockSentinel) {
    try {
      wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }
}

/**
 * Starts continuous background audio keep-alive and requests wake-lock.
 *
 * This marks the browser tab as an active Media Session, ensuring:
 * 1. Mobile browsers do NOT throttle background poll timers when the phone screen is off/locked.
 * 2. Background audio (hospital chime and spoken announcement) can play through the speaker even with phone locked!
 */
export function startBackgroundAudioKeepAlive(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!backgroundAudioElement) {
      const audio = new Audio(SILENT_AUDIO_URI);
      audio.loop = true;
      audio.volume = 0.01;
      backgroundAudioElement = audio;
    }
    backgroundAudioElement.play().catch(() => {});
    void requestWakeLock();
  } catch {}
}

export function stopBackgroundAudioKeepAlive(): void {
  if (backgroundAudioElement) {
    try {
      backgroundAudioElement.pause();
      backgroundAudioElement.currentTime = 0;
    } catch {}
    backgroundAudioElement = null;
  }
  releaseWakeLock();
}

function readFlag(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch {}
  return fallback;
}

function writeFlag(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
  } catch {}
}

export const isAlertsEnabled = () => readFlag(ENABLED_KEY, true);
export const setAlertsEnabled = (value: boolean) => writeFlag(ENABLED_KEY, value);

/** Speaking the call aloud is enabled by default to match TV announcement experience. */
export const isVoiceEnabled = () => readFlag(VOICE_KEY, true);
export const setVoiceEnabled = (value: boolean) => writeFlag(VOICE_KEY, value);

function hasNotificationApi(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** What is available right now, without asking the patient for anything. */
export function probeCapabilities(): AlertCapabilities {
  if (typeof window === 'undefined') {
    return {
      sound: false,
      vibration: false,
      notifications: false,
      notificationsBlocked: false,
      secureContext: false,
    };
  }

  const secureContext = window.isSecureContext === true;
  const permission = hasNotificationApi() ? Notification.permission : 'denied';

  return {
    sound: true,
    vibration: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
    notifications: hasNotificationApi() && secureContext && permission === 'granted',
    notificationsBlocked: hasNotificationApi() && permission === 'denied',
    secureContext,
  };
}

/**
 * Resolves either way after `ms`.
 */
function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

/**
 * Turns alerts on. **Must be called from a user gesture** — both the AudioContext unlock
 * and `Notification.requestPermission` are gated on one.
 */
export async function enableAlerts(): Promise<AlertCapabilities> {
  setAlertsEnabled(true);
  startBackgroundAudioKeepAlive();

  // Playing the chime here resumes the AudioContext inside the gesture,
  // confirming sound works and unlocking browser audio playback permissions.
  await withTimeout(playHospitalChime(), 1_500);

  if (hasNotificationApi() && window.isSecureContext && Notification.permission === 'default') {
    try {
      await withTimeout(Promise.resolve(Notification.requestPermission()), 20_000);
    } catch {}
  }

  return probeCapabilities();
}

export function disableAlerts(): void {
  setAlertsEnabled(false);
  stopBackgroundAudioKeepAlive();
  stopAudioAnnouncement();
}

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

/**
 * Shows a system notification (via Service Worker if active, or Notification API).
 */
async function notify(title: string, body: string, tag: string, sticky: boolean): Promise<void> {
  const caps = probeCapabilities();
  if (!caps.notifications) return;

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          tag,
          icon: '/icons/icon-192x192.svg',
          badge: '/icons/icon-192x192.svg',
          requireInteraction: sticky,
          vibrate: [300, 100, 300, 100, 600],
          data: { url: '/patient' },
        } as any);
        return;
      }
    }

    const notification = new Notification(title, {
      body,
      tag,
      icon: '/icons/icon-192x192.svg',
      badge: '/icons/icon-192x192.svg',
      requireInteraction: sticky,
      vibrate: [300, 100, 300, 100, 600],
    } as any);
    notification.onclick = () => {
      try {
        window.focus();
      } catch {}
      notification.close();
    };
  } catch {}
}

export type TurnAlert = {
  tokenNumber: string;
  roomNumber: string | null;
  lang: PatientLang;
  speak: boolean;
  isRecall?: boolean;
};

/**
 * The patient's token has been called or recalled.
 * Plays hospital chime + speech announcement (just like TV), vibrates device,
 * displays lock-screen media session info, and posts high-priority notification.
 */
export async function notifyTurn({
  tokenNumber,
  roomNumber,
  lang,
  speak = true,
  isRecall = false,
}: TurnAlert): Promise<void> {
  // Heavy vibration pattern to wake up phone in pocket: [300ms, 100ms, 300ms, 100ms, 600ms]
  vibrate([300, 100, 300, 100, 600]);

  const title = isRecall
    ? t(lang, 'notifRecallTitle', { token: tokenNumber })
    : t(lang, 'notifTurnTitle', { token: tokenNumber });

  const body = roomNumber
    ? isRecall
      ? t(lang, 'notifRecallBody', { room: roomNumber })
      : t(lang, 'notifTurnBody', { room: roomNumber })
    : isRecall
      ? t(lang, 'notifRecallBodyNoRoom')
      : t(lang, 'notifTurnBodyNoRoom');

  // 1. Show notification on phone
  void notify(title, body, `opd-turn-${tokenNumber}-${isRecall ? Date.now() : 'call'}`, true);

  // 2. Set Lock Screen Media Metadata so the turn shows on phone lock screen
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: isRecall ? `🔔 RECALL: Token ${tokenNumber}` : `🔔 YOUR TURN: Token ${tokenNumber}`,
        artist: roomNumber ? `Proceed to Room ${roomNumber}` : `AIIMS Kalyani OPD`,
        album: `AIIMS Kalyani OPD Queue Tracker`,
        artwork: [
          { src: '/icons/icon-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icons/icon-512x512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      });
    } catch {}
  }

  // 3. Play Hospital Chime + Speech Announcement (just like TV)
  try {
    await announcePatientCall({
      tokenNumber,
      roomNumber: roomNumber || '',
      lang: toAudioLang(lang),
    });
  } catch (err) {
    console.error('Audio announcement failed, falling back to hospital chime:', err);
    try {
      await playHospitalChime();
    } catch {}
  }
}

/** Two or fewer people left in front — heads-up to walk back to waiting area. */
export async function notifyAlmostThere(
  tokenNumber: string,
  patientsAhead: number,
  lang: PatientLang,
): Promise<void> {
  vibrate([150, 100, 150]);

  void notify(
    t(lang, 'notifSoonTitle', { token: tokenNumber }),
    t(lang, 'notifSoonBody', { n: patientsAhead }),
    `opd-soon-${tokenNumber}`,
    false,
  );

  try {
    await playHospitalChime();
  } catch {}
}

/** Lets the patient test audio and vibration. */
export async function testAlert(lang: PatientLang): Promise<void> {
  vibrate([200, 100, 200]);
  void notify(t(lang, 'alertsOn'), t(lang, 'alertsBody'), 'opd-test', false);
  try {
    await announcePatientCall({
      tokenNumber: 'A-001',
      roomNumber: '101',
      lang: toAudioLang(lang),
    });
  } catch {
    await playHospitalChime();
  }
}
