import { NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const dynamic = 'force-dynamic';

// Normalized lowercase language-to-voice mapping
const NEURAL_VOICES: Record<string, { female: string; male: string }> = {
  'en-in': {
    female: 'en-IN-NeerjaNeural',
    male: 'en-IN-PrabhatNeural',
  },
  'en': {
    female: 'en-IN-NeerjaNeural',
    male: 'en-IN-PrabhatNeural',
  },
  'en-us': {
    female: 'en-US-JennyNeural',
    male: 'en-US-GuyNeural',
  },
  'en-gb': {
    female: 'en-GB-SoniaNeural',
    male: 'en-GB-RyanNeural',
  },
  'hi': {
    female: 'hi-IN-SwaraNeural',
    male: 'hi-IN-MadhurNeural',
  },
  'hi-in': {
    female: 'hi-IN-SwaraNeural',
    male: 'hi-IN-MadhurNeural',
  },
  'bn': {
    female: 'bn-IN-TanishaaNeural',
    male: 'bn-IN-BashkarNeural',
  },
  'bn-in': {
    female: 'bn-IN-TanishaaNeural',
    male: 'bn-IN-BashkarNeural',
  },
};

/**
 * Announcement audio, made once per sentence instead of once per TV.
 *
 * Every TV in a department announces the same call at the same moment ("Token 12,
 * Room 5"), and a recall repeats it. Each one used to make its own round trip to the
 * speech service (0.5–2 s), plus, when that failed, another to the fallback. The
 * on-site server has no CDN in front of it, so every TV paid for every announcement.
 *
 * - Requests for a sentence already being made wait for that one (in-flight sharing).
 * - Finished audio is kept in memory, bounded by bytes, oldest-used out first (a Map
 *   keeps insertion order; a hit is re-inserted). A sentence is about 20–45 KB of MP3,
 *   so 8 MB holds a few hundred: a morning's announcements, for every TV and recall.
 * - Fallback (Google) audio is kept for 10 minutes only, so the better Edge voice is
 *   tried again soon for the same sentence if the Edge service comes back.
 *
 * Trade-off: up to 8 MB of server memory for one fewer network round trip per TV per
 * announcement. Each server instance (Vercel may run several) keeps its own cache.
 */
const AUDIO_CACHE_MAX_BYTES = 8 * 1024 * 1024;
const FALLBACK_KEEP_MS = 10 * 60_000;

type Spoken = { audio: Buffer; source: 'edge' | 'google' };
const audioCache = new Map<string, Spoken & { expiresAt: number }>();
let audioCacheBytes = 0;
const inFlight = new Map<string, Promise<Spoken | null>>();

function forget(key: string) {
  const entry = audioCache.get(key);
  if (!entry) return;
  audioCache.delete(key);
  audioCacheBytes -= entry.audio.byteLength;
}

function remember(key: string, spoken: Spoken) {
  // Empty audio is a failed synthesis: don't keep serving it; the next request tries again.
  const size = spoken.audio.byteLength;
  if (size === 0 || size > AUDIO_CACHE_MAX_BYTES) return;
  forget(key);
  audioCache.set(key, { ...spoken, expiresAt: spoken.source === 'edge' ? Infinity : Date.now() + FALLBACK_KEEP_MS });
  audioCacheBytes += size;
  for (const oldKey of audioCache.keys()) {
    if (audioCacheBytes <= AUDIO_CACHE_MAX_BYTES) break;
    forget(oldKey);
  }
}

function cachedSpeech(key: string): Spoken | null {
  const entry = audioCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    forget(key);
    return null;
  }
  audioCache.delete(key); // most recently used goes to the end
  audioCache.set(key, entry);
  return entry;
}

/** Microsoft Edge neural voice. Throws when the service refuses or fails. */
async function edgeSpeech(text: string, voiceName: string): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(text);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      audioStream.on('end', () => resolve());
      audioStream.on('error', (err: any) => reject(err));
    });
    return Buffer.concat(chunks);
  } finally {
    // Each instance holds a WebSocket to the speech service. It was never closed, so
    // every announcement left one open until the service dropped it.
    try {
      tts.close();
    } catch {}
  }
}

/** Google Translate voice, the fallback. Null when it fails too. */
async function googleSpeech(text: string, googleLang: string): Promise<Buffer | null> {
  try {
    const fallbackUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${googleLang}&client=tw-ob`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://translate.google.com/',
      },
    });
    return fallbackRes.ok ? Buffer.from(await fallbackRes.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** Edge first, then Google, exactly as before; shared and cached as described above. */
function announcementAudio(text: string, voiceName: string, googleLang: string): Promise<Spoken | null> {
  const key = `${voiceName}|${googleLang}|${text}`;
  const cached = cachedSpeech(key);
  if (cached) return Promise.resolve(cached);
  const running = inFlight.get(key);
  if (running) return running;

  const job = (async (): Promise<Spoken | null> => {
    try {
      return { audio: await edgeSpeech(text, voiceName), source: 'edge' as const };
    } catch (error) {
      console.error('[Edge TTS] Synthesis error:', error);
    }
    const audio = await googleSpeech(text, googleLang);
    return audio ? { audio, source: 'google' as const } : null;
  })()
    .then((spoken) => {
      if (spoken) remember(key, spoken);
      return spoken;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

/**
 * High-Definition Microsoft Edge Neural Text-To-Speech Route
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text')?.trim();
  const lang = (searchParams.get('lang')?.trim() || 'en-in').toLowerCase();
  const gender = (searchParams.get('gender')?.trim() || 'female').toLowerCase();

  if (!text) {
    return new NextResponse('Text is required', { status: 400 });
  }
  // Announcements are one short sentence. The route needs no login (the TV boards use
  // it), so cap the length to stop it being used as a free text-to-speech service.
  if (text.length > 300) {
    return new NextResponse('Text is too long', { status: 400 });
  }

  const voiceMap = NEURAL_VOICES[lang] || NEURAL_VOICES['en-in'];
  const voiceName = (gender === 'male' ? voiceMap.male : voiceMap.female) || 'en-IN-NeerjaNeural';
  const googleLang = lang.startsWith('hi') ? 'hi' : lang.startsWith('bn') ? 'bn' : 'en-IN';

  const spoken = await announcementAudio(text, voiceName, googleLang);
  if (!spoken) {
    return new NextResponse('Failed to synthesize speech audio', { status: 500 });
  }

  // A copy per response: the cached buffer is shared, and a response may take
  // ownership of the bytes it is given.
  const body = new Uint8Array(spoken.audio);
  if (spoken.source === 'google') {
    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' },
    });
  }
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      // s-maxage lets a CDN (Vercel) answer the other TVs too; max-age is the browser.
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      'Content-Length': String(spoken.audio.byteLength),
    },
  });
}
