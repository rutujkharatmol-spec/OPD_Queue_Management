import type { AudioLang } from './speechService';

/**
 * Translations for the public patient tracker.
 *
 * `/patient` is the only screen an actual patient reads, and at AIIMS Kalyani that patient
 * is far more likely to read Bengali or Hindi than English. Everything else in the app is
 * staff-facing and stays in English, so this is a deliberately local dictionary rather
 * than a project-wide i18n framework — no dependency, no route restructuring, and the
 * string set stays small enough to keep honest.
 *
 * The announcement engine already had a language concept ({@link AudioLang}); this shares
 * it via {@link toAudioLang} so the spoken call matches what is on screen.
 */
export type PatientLang = 'en' | 'hi' | 'bn';

const STORAGE_KEY = 'opd_patient_lang';

/** `AudioLang` also has 'dual'; the patient page always speaks one language at a time. */
export function toAudioLang(lang: PatientLang): AudioLang {
  return lang;
}

/** Locale used for dates and clock times in each language. */
const DATE_LOCALE: Record<PatientLang, string> = {
  en: 'en-GB',
  hi: 'hi-IN',
  bn: 'bn-IN',
};

export const LANG_LABELS: Record<PatientLang, string> = {
  en: 'EN',
  hi: 'हिं',
  bn: 'বাং',
};

/** Full name of each language, written in that language, for the toggle's accessible name. */
export const LANG_NAMES: Record<PatientLang, string> = {
  en: 'English',
  hi: 'हिन्दी',
  bn: 'বাংলা',
};

const EN = {
  brand: 'AIIMS Kalyani OPD',
  title: 'Patient Queue Tracker',
  subtitle: 'Check your live queue position and estimated waiting time',
  languageLabel: 'Language',

  tokenLabel: 'Token Number',
  tokenPlaceholder: 'e.g. MED-001 or OP-045',
  dateLabel: 'Service Date',
  resetToday: 'Reset to Today',
  today: 'Today',
  dateHint: 'Tokens reset daily at 00:00. Select the exact date your token was issued.',
  searching: 'Searching Live Queue...',
  trackButton: 'Track Token Status',
  notFound:
    'Token "{token}" not found for {date}. Please verify your token number or select the date when your token was generated.',

  yourToken: 'Your Token',
  statusWaiting: 'In Queue (Waiting)',
  statusCalled: 'Currently Serving',
  statusCompleted: 'Consultation Completed',
  statusAbsent: 'Marked Absent',
  statusSkipped: 'Skipped',

  department: 'Department',
  room: 'Room {room}',
  servingNow: 'Serving Now',
  none: 'None',

  patientAhead: 'Patient Ahead',
  patientsAhead: 'Patients Ahead',
  estimatedMins: 'Estimated Mins',
  etaBasis: '{rooms} rooms running · about {mins} min per patient today',
  etaBasisOne: '1 room running · about {mins} min per patient today',
  etaUnreliable:
    'Rough guide only — not enough consultations have finished today to work out an accurate average.',
  waitNotice:
    'Estimated wait time is an approximation. Please stay near the {dept} waiting area as consultation times vary.',

  queueHeading: 'Queue ahead of you',
  youLabel: 'You',
  nowServing: 'Now serving',
  awaitingCall: 'Waiting to be called',

  yourTurn: "It's your turn now!",
  proceedTo: 'Please proceed immediately to Room {room}.',
  proceedToUnassigned: 'Please proceed immediately to the assigned OPD room.',
  completedTitle: 'Consultation Completed',
  completedBody: 'This token consultation has been concluded for {date}.',
  missedTitle: 'Token Missed / On Hold',
  missedBody:
    'Your token was called and was marked {status}. Please contact the registration counter or nursing desk.',

  alertsTitle: "Get alerted when it's your turn",
  alertsBody: 'Keep this page open and we will chime and buzz when your token is called.',
  alertsKeepOpen: 'Most reliable while this page stays open with the screen on.',
  alertsEnable: 'Turn on alerts',
  alertsOn: 'Alerts are on',
  alertsFull: 'Sound, vibration and notifications',
  alertsSoundNotif: 'Sound and notifications',
  alertsSoundVibe: 'Sound and vibration',
  alertsSoundOnly: 'Sound only on this connection',
  alertsBlocked: 'Notifications are blocked in your browser settings',
  alertsTest: 'Test',
  alertsDisable: 'Turn off',
  voiceLabel: 'Also announce out loud',

  notifTurnTitle: "It's your turn — {token}",
  notifTurnBody: 'Please proceed to Room {room}',
  notifTurnBodyNoRoom: 'Please proceed to the OPD room',
  notifRecallTitle: 'Recall: Token {token}',
  notifRecallBody: 'Doctor in Room {room} is recalling your token. Please proceed immediately.',
  notifRecallBodyNoRoom: 'Doctor is recalling your token. Please proceed to the room immediately.',
  recalledBanner: 'Doctor is recalling your token now!',
  notifSoonTitle: "You're almost up — {token}",
  notifSoonBody: '{n} ahead of you. Please come to the waiting area.',

  updatedAt: 'Updated {time}',
  liveTracking: 'Live tracking active',
  refresh: 'Refresh',
  refreshing: 'Refreshing...',
  offlineNotice: 'Offline — showing the last known status',
  staleNotice: 'Last updated {mins} min ago',

  footerSystem: 'AIIMS Kalyani OPD Automated Queue System',
  footerHelp: 'For queue queries or assistance, please visit the central OPD reception.',
} as const;

export type StringKey = keyof typeof EN;

// Typed as Record<StringKey, string>, so dropping a key here is a build error rather than
// an English string surfacing in a Hindi or Bengali page.
const HI: Record<StringKey, string> = {
  brand: 'एम्स कल्याणी ओपीडी',
  title: 'मरीज़ कतार ट्रैकर',
  subtitle: 'अपनी कतार की स्थिति और अनुमानित प्रतीक्षा समय देखें',
  languageLabel: 'भाषा',

  tokenLabel: 'टोकन नंबर',
  tokenPlaceholder: 'जैसे MED-001 या OP-045',
  dateLabel: 'सेवा तिथि',
  resetToday: 'आज पर लौटें',
  today: 'आज',
  dateHint: 'टोकन हर दिन 00:00 बजे रीसेट होते हैं। वही तिथि चुनें जिस दिन आपका टोकन बना था।',
  searching: 'कतार खोजी जा रही है...',
  trackButton: 'टोकन की स्थिति देखें',
  notFound:
    '{date} के लिए टोकन "{token}" नहीं मिला। कृपया अपना टोकन नंबर जाँचें या वह तिथि चुनें जिस दिन टोकन बना था।',

  yourToken: 'आपका टोकन',
  statusWaiting: 'कतार में (प्रतीक्षारत)',
  statusCalled: 'अभी बुलाया गया',
  statusCompleted: 'परामर्श पूरा हुआ',
  statusAbsent: 'अनुपस्थित दर्ज',
  statusSkipped: 'छोड़ा गया',

  department: 'विभाग',
  room: 'कमरा {room}',
  servingNow: 'अभी चल रहा है',
  none: 'कोई नहीं',

  patientAhead: 'मरीज़ आगे',
  patientsAhead: 'मरीज़ आगे',
  estimatedMins: 'अनुमानित मिनट',
  etaBasis: '{rooms} कमरे चालू · आज लगभग {mins} मिनट प्रति मरीज़',
  etaBasisOne: '1 कमरा चालू · आज लगभग {mins} मिनट प्रति मरीज़',
  etaUnreliable:
    'यह केवल मोटा अनुमान है — आज अभी इतने परामर्श पूरे नहीं हुए कि सटीक औसत निकाला जा सके।',
  waitNotice:
    'अनुमानित समय केवल एक अनुमान है। परामर्श का समय बदलता रहता है, इसलिए कृपया {dept} प्रतीक्षा क्षेत्र के पास ही रहें।',

  queueHeading: 'आपसे आगे की कतार',
  youLabel: 'आप',
  nowServing: 'अभी चल रहा है',
  awaitingCall: 'बुलाए जाने की प्रतीक्षा',

  yourTurn: 'अब आपकी बारी है!',
  proceedTo: 'कृपया तुरंत कमरा {room} में जाएँ।',
  proceedToUnassigned: 'कृपया तुरंत निर्धारित ओपीडी कमरे में जाएँ।',
  completedTitle: 'परामर्श पूरा हुआ',
  completedBody: '{date} के लिए इस टोकन का परामर्श समाप्त हो चुका है।',
  missedTitle: 'टोकन छूट गया / रोका गया',
  missedBody:
    'आपका टोकन बुलाया गया था और उसे {status} दर्ज किया गया। कृपया पंजीकरण काउंटर या नर्सिंग डेस्क से संपर्क करें।',

  alertsTitle: 'अपनी बारी आने पर सूचना पाएँ',
  alertsBody: 'इस पेज को खुला रखें — आपका टोकन बुलाए जाने पर हम घंटी बजाएँगे और फ़ोन कंपित करेंगे।',
  alertsKeepOpen: 'यह पेज खुला और स्क्रीन चालू रहने पर सबसे भरोसेमंद।',
  alertsEnable: 'सूचना चालू करें',
  alertsOn: 'सूचनाएँ चालू हैं',
  alertsFull: 'ध्वनि, कंपन और नोटिफ़िकेशन',
  alertsSoundNotif: 'ध्वनि और नोटिफ़िकेशन',
  alertsSoundVibe: 'ध्वनि और कंपन',
  alertsSoundOnly: 'इस कनेक्शन पर केवल ध्वनि',
  alertsBlocked: 'आपके ब्राउज़र में नोटिफ़िकेशन बंद हैं',
  alertsTest: 'जाँचें',
  alertsDisable: 'बंद करें',
  voiceLabel: 'आवाज़ में घोषणा भी करें',

  notifTurnTitle: 'आपकी बारी आ गई — {token}',
  notifTurnBody: 'कृपया कमरा {room} में जाएँ',
  notifTurnBodyNoRoom: 'कृपया ओपीडी कमरे में जाएँ',
  notifRecallTitle: 'रीकॉल: टोकन {token}',
  notifRecallBody: 'कमरा नंबर {room} के डॉक्टर आपको दोबारा बुला रहे हैं। कृपया तुरंत जाएँ।',
  notifRecallBodyNoRoom: 'डॉक्टर आपको दोबारा बुला रहे हैं। कृपया तुरंत ओपीडी कमरे में जाएँ।',
  recalledBanner: 'डॉक्टर आपको दोबारा बुला रहे हैं! कृपया तुरंत जाएँ।',
  notifSoonTitle: 'आपकी बारी पास है — {token}',
  notifSoonBody: 'आपसे आगे {n} मरीज़। कृपया प्रतीक्षा क्षेत्र में आ जाएँ।',

  updatedAt: '{time} पर अपडेट',
  liveTracking: 'लाइव ट्रैकिंग चालू',
  refresh: 'रिफ़्रेश',
  refreshing: 'रिफ़्रेश हो रहा है...',
  offlineNotice: 'ऑफ़लाइन — अंतिम ज्ञात स्थिति दिखाई जा रही है',
  staleNotice: '{mins} मिनट पहले अपडेट',

  footerSystem: 'एम्स कल्याणी ओपीडी स्वचालित कतार प्रणाली',
  footerHelp: 'कतार संबंधी सहायता के लिए कृपया मुख्य ओपीडी रिसेप्शन पर जाएँ।',
};

const BN: Record<StringKey, string> = {
  brand: 'এইমস কল্যাণী ওপিডি',
  title: 'রোগী সারি ট্র্যাকার',
  subtitle: 'আপনার সারির অবস্থান ও আনুমানিক অপেক্ষার সময় দেখুন',
  languageLabel: 'ভাষা',

  tokenLabel: 'টোকেন নম্বর',
  tokenPlaceholder: 'যেমন MED-001 বা OP-045',
  dateLabel: 'পরিষেবার তারিখ',
  resetToday: 'আজকের তারিখে ফিরুন',
  today: 'আজ',
  dateHint: 'টোকেন প্রতিদিন ০০:০০টায় রিসেট হয়। আপনার টোকেন যে দিন তৈরি হয়েছিল সেই তারিখ বেছে নিন।',
  searching: 'সারি খোঁজা হচ্ছে...',
  trackButton: 'টোকেনের অবস্থা দেখুন',
  notFound:
    '{date} তারিখে "{token}" টোকেনটি পাওয়া যায়নি। অনুগ্রহ করে টোকেন নম্বরটি যাচাই করুন বা টোকেন তৈরির তারিখ বেছে নিন।',

  yourToken: 'আপনার টোকেন',
  statusWaiting: 'সারিতে (অপেক্ষমাণ)',
  statusCalled: 'এখন ডাকা হয়েছে',
  statusCompleted: 'পরামর্শ সম্পন্ন',
  statusAbsent: 'অনুপস্থিত হিসেবে চিহ্নিত',
  statusSkipped: 'বাদ দেওয়া হয়েছে',

  department: 'বিভাগ',
  room: 'রুম {room}',
  servingNow: 'এখন চলছে',
  none: 'কেউ নেই',

  patientAhead: 'জন আপনার আগে',
  patientsAhead: 'জন আপনার আগে',
  estimatedMins: 'আনুমানিক মিনিট',
  etaBasis: '{rooms}টি রুম চালু · আজ রোগীপ্রতি প্রায় {mins} মিনিট',
  etaBasisOne: '১টি রুম চালু · আজ রোগীপ্রতি প্রায় {mins} মিনিট',
  etaUnreliable:
    'এটি কেবল আনুমানিক — সঠিক গড় বের করার মতো যথেষ্ট পরামর্শ আজ এখনও শেষ হয়নি।',
  waitNotice:
    'আনুমানিক সময়টি কেবল একটি ধারণা। পরামর্শের সময় বদলায়, তাই অনুগ্রহ করে {dept} অপেক্ষা এলাকার কাছেই থাকুন।',

  queueHeading: 'আপনার আগে যাঁরা আছেন',
  youLabel: 'আপনি',
  nowServing: 'এখন চলছে',
  awaitingCall: 'ডাকার অপেক্ষায়',

  yourTurn: 'এখন আপনার পালা!',
  proceedTo: 'অনুগ্রহ করে এখনই রুম {room}-এ যান।',
  proceedToUnassigned: 'অনুগ্রহ করে এখনই নির্ধারিত ওপিডি রুমে যান।',
  completedTitle: 'পরামর্শ সম্পন্ন',
  completedBody: '{date} তারিখের জন্য এই টোকেনের পরামর্শ শেষ হয়েছে।',
  missedTitle: 'টোকেন বাদ পড়েছে / স্থগিত',
  missedBody:
    'আপনার টোকেন ডাকা হয়েছিল এবং {status} হিসেবে চিহ্নিত হয়েছে। অনুগ্রহ করে রেজিস্ট্রেশন কাউন্টার বা নার্সিং ডেস্কে যোগাযোগ করুন।',

  alertsTitle: 'আপনার পালা এলে জানিয়ে দেব',
  alertsBody: 'এই পৃষ্ঠাটি খোলা রাখুন — আপনার টোকেন ডাকা হলে আমরা ঘণ্টা বাজাব ও ফোন কাঁপাব।',
  alertsKeepOpen: 'এই পৃষ্ঠা খোলা ও স্ক্রিন চালু থাকলে সবচেয়ে নির্ভরযোগ্য।',
  alertsEnable: 'সতর্কতা চালু করুন',
  alertsOn: 'সতর্কতা চালু আছে',
  alertsFull: 'শব্দ, কম্পন ও নোটিফিকেশন',
  alertsSoundNotif: 'শব্দ ও নোটিফিকেশন',
  alertsSoundVibe: 'শব্দ ও কম্পন',
  alertsSoundOnly: 'এই সংযোগে কেবল শব্দ',
  alertsBlocked: 'আপনার ব্রাউজারে নোটিফিকেশন বন্ধ আছে',
  alertsTest: 'পরীক্ষা',
  alertsDisable: 'বন্ধ করুন',
  voiceLabel: 'মুখেও ঘোষণা করুন',

  notifTurnTitle: 'আপনার পালা — {token}',
  notifTurnBody: 'অনুগ্রহ করে রুম {room}-এ যান',
  notifTurnBodyNoRoom: 'অনুগ্রহ করে ওপিডি রুমে যান',
  notifRecallTitle: 'রিকল: টোকেন {token}',
  notifRecallBody: 'রুম নম্বর {room}-এর ডাক্তার আপনাকে পুনরায় ডাকছেন। অনুগ্রহ করে অবিলম্বে যান।',
  notifRecallBodyNoRoom: 'ডাক্তার আপনাকে পুনরায় ডাকছেন। অনুগ্রহ করে অবিলম্বে যান।',
  recalledBanner: 'ডাক্তার আপনাকে পুনরায় ডাকছেন! অনুগ্রহ করে অবিলম্বে যান।',
  notifSoonTitle: 'প্রায় আপনার পালা — {token}',
  notifSoonBody: 'আপনার আগে {n} জন। অনুগ্রহ করে অপেক্ষা এলাকায় আসুন।',

  updatedAt: '{time}-এ আপডেট',
  liveTracking: 'লাইভ ট্র্যাকিং চালু',
  refresh: 'রিফ্রেশ',
  refreshing: 'রিফ্রেশ হচ্ছে...',
  offlineNotice: 'অফলাইন — সর্বশেষ জানা অবস্থা দেখানো হচ্ছে',
  staleNotice: '{mins} মিনিট আগে আপডেট',

  footerSystem: 'এইমস কল্যাণী ওপিডি স্বয়ংক্রিয় সারি ব্যবস্থা',
  footerHelp: 'সারি সংক্রান্ত সহায়তার জন্য অনুগ্রহ করে কেন্দ্রীয় ওপিডি অভ্যর্থনায় যোগাযোগ করুন।',
};

const STRINGS: Record<PatientLang, Record<StringKey, string>> = { en: EN, hi: HI, bn: BN };

export const PATIENT_LANGS: PatientLang[] = ['en', 'hi', 'bn'];

export function isPatientLang(value: unknown): value is PatientLang {
  return value === 'en' || value === 'hi' || value === 'bn';
}

/** Looks up a string and substitutes `{name}` placeholders. Falls back to English. */
export function t(
  lang: PatientLang,
  key: StringKey,
  params?: Record<string, string | number>,
): string {
  const template = STRINGS[lang]?.[key] ?? EN[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Best guess from the device before the patient has chosen anything. */
function detectLang(): PatientLang {
  if (typeof navigator === 'undefined') return 'en';
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = (tag || '').toLowerCase().split('-')[0];
    if (base === 'bn') return 'bn';
    if (base === 'hi') return 'hi';
    if (base === 'en') return 'en';
  }
  return 'en';
}

export function getPatientLang(): PatientLang {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isPatientLang(saved)) return saved;
  } catch {}
  return detectLang();
}

export function setPatientLang(lang: PatientLang): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

/** `YYYY-MM-DD` in the device's own timezone — the form's date input speaks this. */
export function getTodayString(): string {
  try {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * A service date rendered for reading. Parsed as UTC because that is how the column is
 * stored — treating it as local would shift the date by one in IST.
 */
export function formatDateDisplay(dateStr: string, lang: PatientLang = 'en'): string {
  try {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const formatted = dateObj.toLocaleDateString(DATE_LOCALE[lang], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return dateStr === getTodayString() ? `${t(lang, 'today')} (${formatted})` : formatted;
  } catch {
    return dateStr;
  }
}

export function formatTimeDisplay(date: Date, lang: PatientLang = 'en'): string {
  try {
    return date.toLocaleTimeString(DATE_LOCALE[lang], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return date.toISOString().slice(11, 19);
  }
}
