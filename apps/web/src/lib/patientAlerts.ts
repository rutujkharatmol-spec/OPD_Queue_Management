import { playHospitalChime, announcePatientCall, stopAudioAnnouncement } from './speechService';
import { t, toAudioLang, type PatientLang } from './patientI18n';

/**
 * Getting a waiting patient's attention when their token is called.
 *
 * The tracker could always *show* the turn, but only if the patient happened to be looking
 * at the screen — which in an OPD waiting hall they are not. This layers the alert
 * channels a phone actually has on top of the existing announcement engine, so the page
 * can be opened once and pocketed.
 *
 * Every channel is optional and probed rather than assumed: this system is often served
 * over plain HTTP on a hospital LAN, where notifications are unavailable outright.
 */
export type AlertCapabilities = {
  /** Web Audio chime. Works everywhere once unlocked by a user gesture. */
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

export const isAlertsEnabled = () => readFlag(ENABLED_KEY, false);
export const setAlertsEnabled = (value: boolean) => writeFlag(ENABLED_KEY, value);

/** Speaking the call aloud is off by default — a waiting hall is not the place for surprise audio. */
export const isVoiceEnabled = () => readFlag(VOICE_KEY, false);
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
 *
 * Both steps of enabling can stall indefinitely through no fault of ours: an
 * AudioContext on a device with no output, and a permission prompt the patient simply
 * never answers. Neither may be allowed to leave the button hanging.
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
 * and `Notification.requestPermission` are gated on one, and a browser that has never seen
 * a tap will silently refuse to play the chime later.
 *
 * The preference is committed *before* either step, so the UI can switch over immediately;
 * the returned capabilities describe what actually ended up working, so the page can
 * describe real behaviour rather than promise a notification that will never arrive.
 */
export async function enableAlerts(): Promise<AlertCapabilities> {
  setAlertsEnabled(true);

  // Playing the chime here does double duty: it resumes the suspended AudioContext inside
  // the gesture, and it confirms to the patient that sound works.
  await withTimeout(playHospitalChime(), 1_500);

  if (hasNotificationApi() && window.isSecureContext && Notification.permission === 'default') {
    try {
      // An unanswered prompt must not block the result. The patient can leave it sitting
      // there; capabilities are re-probed on the next enable or page load.
      await withTimeout(Promise.resolve(Notification.requestPermission()), 20_000);
    } catch {}
  }

  return probeCapabilities();
}

export function disableAlerts(): void {
  setAlertsEnabled(false);
  stopAudioAnnouncement();
}

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

/**
 * Shows a system notification, if one is possible.
 *
 * `tag` collapses repeats: a poll that re-reports the same call replaces the existing
 * notification rather than stacking a second one.
 */
function notify(title: string, body: string, tag: string, sticky: boolean): void {
  const caps = probeCapabilities();
  if (!caps.notifications) return;

  try {
    const notification = new Notification(title, {
      body,
      tag,
      icon: '/icons/icon-192x192.svg',
      badge: '/icons/icon-192x192.svg',
      requireInteraction: sticky,
    });
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
};

/** The patient's token has just been called. The loudest alert the device allows. */
export async function notifyTurn({ tokenNumber, roomNumber, lang, speak }: TurnAlert): Promise<void> {
  vibrate([200, 100, 200, 100, 400]);

  notify(
    t(lang, 'notifTurnTitle', { token: tokenNumber }),
    roomNumber
      ? t(lang, 'notifTurnBody', { room: roomNumber })
      : t(lang, 'notifTurnBodyNoRoom'),
    `opd-turn-${tokenNumber}`,
    true,
  );

  try {
    if (speak) {
      // announcePatientCall opens with the same chime, so this is not a missing sound.
      await announcePatientCall({
        tokenNumber,
        roomNumber: roomNumber || '',
        lang: toAudioLang(lang),
      });
    } else {
      await playHospitalChime();
    }
  } catch {}
}

/** Two or fewer people left in front — time to walk back to the waiting area. */
export async function notifyAlmostThere(
  tokenNumber: string,
  patientsAhead: number,
  lang: PatientLang,
): Promise<void> {
  vibrate([120, 80, 120]);

  notify(
    t(lang, 'notifSoonTitle', { token: tokenNumber }),
    t(lang, 'notifSoonBody', { n: patientsAhead }),
    `opd-soon-${tokenNumber}`,
    false,
  );

  try {
    await playHospitalChime();
  } catch {}
}

/** Lets the patient confirm, before it matters, that they will actually notice the alert. */
export async function testAlert(lang: PatientLang): Promise<void> {
  vibrate([200, 100, 200]);
  notify(t(lang, 'alertsOn'), t(lang, 'alertsBody'), 'opd-test', false);
  try {
    await playHospitalChime();
  } catch {}
}
