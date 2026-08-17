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

  try {
    const voiceMap = NEURAL_VOICES[lang] || NEURAL_VOICES['en-in'];
    const voiceName = (gender === 'male' ? voiceMap.male : voiceMap.female) || 'en-IN-NeerjaNeural';

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = await tts.toStream(text);

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      audioStream.on('end', () => resolve());
      audioStream.on('error', (err: any) => reject(err));
    });

    const audioBuffer = Buffer.concat(chunks);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Content-Length': String(audioBuffer.byteLength),
      },
    });
  } catch (error) {
    console.error('[Edge TTS] Synthesis error:', error);

    // Fallback to Google TTS if Edge network has an issue
    try {
      const googleLang = lang.startsWith('hi') ? 'hi' : lang.startsWith('bn') ? 'bn' : 'en-IN';
      const fallbackUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${googleLang}&client=tw-ob`;
      const fallbackRes = await fetch(fallbackUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://translate.google.com/',
        },
      });

      if (fallbackRes.ok) {
        const fallbackBuffer = await fallbackRes.arrayBuffer();
        return new NextResponse(fallbackBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }
    } catch {}

    return new NextResponse('Failed to synthesize speech audio', { status: 500 });
  }
}
