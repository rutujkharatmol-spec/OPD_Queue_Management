/**
 * AIIMS Kalyani OPD Ultra-Realistic Speech & Announcement Engine
 *
 * Architecture:
 * 1. Online HD Natural Voice Audio (Direct server-side MP3 streaming from /api/v1/tts with Edge Neural AI Voices)
 * 2. Offline Fallback (Local Web Speech API with strict Male/Female voice separation)
 * 3. 2-Tone Melodic Hospital Chime (Web Audio API)
 */

export type VoiceGender = 'female' | 'male';
export type AudioLang = 'dual' | 'en' | 'hi' | 'bn';
export type VoiceEngineMode = 'online' | 'offline';

export interface AnnouncementOptions {
  tokenNumber: string;
  roomNumber: string;
  isEmergency?: boolean;
  lang?: AudioLang;
  gender?: VoiceGender;
  engineMode?: VoiceEngineMode;
}

const VOICE_ENGINE_KEY = 'opd_voice_engine_mode';

export function getVoiceEngineMode(): VoiceEngineMode {
  if (typeof window === 'undefined') return 'online';
  try {
    const saved = localStorage.getItem(VOICE_ENGINE_KEY);
    if (saved === 'offline' || saved === 'online') return saved;
  } catch {}
  return 'online';
}

export function setVoiceEngineMode(mode: VoiceEngineMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VOICE_ENGINE_KEY, mode);
  } catch {}
}

let activeAudioElement: HTMLAudioElement | null = null;
let audioContextInstance: AudioContext | null = null;

/**
 * Plays the 2-tone melodic hospital chime
 */
export function playHospitalChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        resolve();
        return;
      }

      if (!audioContextInstance || audioContextInstance.state === 'suspended') {
        audioContextInstance = new AudioCtx();
        if (audioContextInstance.state === 'suspended') {
          audioContextInstance.resume();
        }
      }

      const ctx = audioContextInstance;
      const now = ctx.currentTime;

      // Tone 1: High bell chime (E5 - 659.25Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.35, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.7);

      // Tone 2: Harmonizing lower chime (C5 - 523.25Hz) after 160ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(523.25, now + 0.16);
      gain2.gain.setValueAtTime(0, now + 0.16);
      gain2.gain.linearRampToValueAtTime(0.4, now + 0.21);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.16);
      osc2.stop(now + 1.2);

      setTimeout(resolve, 750);
    } catch {
      resolve();
    }
  });
}

/**
 * Plays ultra-realistic MP3 audio from the server TTS route
 */
function playServerAudio(text: string, lang: string, gender: VoiceGender): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      resolve(false);
      return;
    }

    try {
      stopAudioAnnouncement();

      const url = `/api/v1/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}&gender=${encodeURIComponent(gender)}`;
      const audio = new Audio(url);
      activeAudioElement = audio;

      let resolved = false;

      // 8s timeout safety
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { audio.pause(); } catch {}
          activeAudioElement = null;
          resolve(false);
        }
      }, 8000);

      audio.onended = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          activeAudioElement = null;
          resolve(true);
        }
      };

      audio.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          activeAudioElement = null;
          resolve(false);
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            activeAudioElement = null;
            resolve(false);
          }
        });
      }
    } catch {
      resolve(false);
    }
  });
}

/**
 * Finds the best offline voice matching the language and gender,
 * strictly differentiating Male vs Female voices.
 */
// Preference order, most natural first. Hoisted to module scope: these are constant,
// but were rebuilt as two fresh arrays on every announcement.
const MALE_VOICE_NAMES = [
  'prabhat', 'madhur', 'ravi', 'david', 'george', 'daniel',
  'mark', 'guy', 'christopher', 'male', 'man', 'google us english'
];

const FEMALE_VOICE_NAMES = [
  'neerja', 'swara', 'heera', 'zira', 'samantha', 'victoria',
  'karen', 'jenny', 'aria', 'female', 'woman', 'google uk english female', 'google हिन्दी'
];

function getBestNaturalOfflineVoice(langCode: string, gender: VoiceGender): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const langPrefix = langCode.split('-')[0].toLowerCase();
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  const pool = langVoices.length > 0 ? langVoices : voices;

  const targetNames = gender === 'male' ? MALE_VOICE_NAMES : FEMALE_VOICE_NAMES;

  // Each candidate name previously rescanned the pool and lowercased every voice name
  // again — up to 13 × pool passes. Lowercasing once up front keeps the same preference
  // order (first matching name in the list wins) at a fraction of the work.
  const lowerNames = pool.map((v) => v.name.toLowerCase());

  for (const name of targetNames) {
    const index = lowerNames.findIndex((voiceName) => voiceName.includes(name));
    if (index !== -1) return pool[index];
  }

  // Fallback to any voice for this language
  return pool[0] || voices[0] || null;
}

/**
 * Offline Speech Synthesis Playback
 */
function speakOfflineSpeech(text: string, langCode: string, gender: VoiceGender): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.lang = langCode;

      const bestVoice = getBestNaturalOfflineVoice(langCode, gender);
      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      // Explicit pitch calibration
      utterance.pitch = gender === 'male' ? 0.82 : 1.08;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

/**
 * Speaks text using online HD MP3 audio stream first; falls back to offline speech on network error
 */
async function speakWithNaturalFallback(text: string, langCode: string, gender: VoiceGender): Promise<void> {
  const onlineSuccess = await playServerAudio(text, langCode, gender);
  if (!onlineSuccess) {
    await speakOfflineSpeech(text, langCode, gender);
  }
}

/**
 * Speaks text using the specified engine mode
 */
async function speakAccordingToMode(
  text: string,
  langCode: string,
  gender: VoiceGender,
  mode: VoiceEngineMode
): Promise<void> {
  if (mode === 'offline') {
    await speakOfflineSpeech(text, langCode, gender);
  } else {
    await speakWithNaturalFallback(text, langCode, gender);
  }
}

/**
 * Formats token string for crystal-clear spoken pronunciation
 * Removes any department prefix (e.g. "ENT-001" -> "1", "MED-042" -> "42", "101" -> "101")
 */
function formatTokenForSpeech(token: string): string {
  const clean = token.replace('🚨', '').trim();
  // Strip any letters and optional hyphen (e.g., "ENT-001" -> "001", "MED-1" -> "1")
  const stripped = clean.replace(/^[A-Za-z]+-?/, '').trim();
  const numericOnly = stripped.replace(/^0+/, '') || stripped || clean;
  return numericOnly;
}

/**
 * Main announcement entry point
 */
export async function announcePatientCall({
  tokenNumber,
  roomNumber,
  isEmergency = false,
  lang = 'dual',
  gender = 'female',
  engineMode,
}: AnnouncementOptions): Promise<void> {
  const mode = engineMode || getVoiceEngineMode();
  const spokenToken = formatTokenForSpeech(tokenNumber);
  const cleanToken = spokenToken;

  // 1. Stop any ongoing audio/speech first
  stopAudioAnnouncement();

  // 2. Play Hospital Chime
  await playHospitalChime();

  // 3. Announce according to selected language and mode
  if (lang === 'dual') {
    // English announcement
    const enText = isEmergency
      ? `Emergency! Token number ${spokenToken}, please proceed to Room ${roomNumber}.`
      : `Token number ${spokenToken}, please proceed to Room ${roomNumber}.`;

    await speakAccordingToMode(enText, 'en-in', gender, mode);

    // Pause between languages
    await new Promise((r) => setTimeout(r, 450));

    // Hindi announcement
    const hiText = isEmergency
      ? `इमरजेंसी! टोकन नंबर ${cleanToken}, कृपया कमरा नंबर ${roomNumber} में जाएं।`
      : `टोकन नंबर ${cleanToken}, कृपया कमरा नंबर ${roomNumber} में जाएं।`;

    await speakAccordingToMode(hiText, 'hi', gender, mode);
  } else if (lang === 'hi') {
    const hiText = isEmergency
      ? `इमरजेंसी! टोकन नंबर ${cleanToken}, कृपया कमरा नंबर ${roomNumber} में जाएं।`
      : `टोकन नंबर ${cleanToken}, कृपया कमरा नंबर ${roomNumber} में जाएं।`;

    await speakAccordingToMode(hiText, 'hi', gender, mode);
  } else if (lang === 'bn') {
    const bnText = isEmergency
      ? `জরুরী! টোকেন নম্বর ${cleanToken}, অনুগ্রহ করে রুম নম্বর ${roomNumber} এ যান।`
      : `টোকেন নম্বর ${cleanToken}, অনুগ্রহ করে রুম নম্বর ${roomNumber} এ যান।`;

    await speakAccordingToMode(bnText, 'bn', gender, mode);
  } else {
    // English Only
    const enText = isEmergency
      ? `Emergency! Token number ${spokenToken}, please proceed to Room ${roomNumber}.`
      : `Token number ${spokenToken}, please proceed to Room ${roomNumber}.`;

    await speakAccordingToMode(enText, 'en-in', gender, mode);
  }
}

/**
 * Stops any ongoing audio or speech
 */
export function stopAudioAnnouncement(): void {
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {}
    activeAudioElement = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}
