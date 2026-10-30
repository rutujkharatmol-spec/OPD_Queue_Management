'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';

/**
 * Reads a barcode with the device camera: the CRN on a patient's booklet, at registration
 * and at the Doctor Desk, for desks and phones without a handheld scanner.
 *
 * Uses the browser's own barcode reader where there is one (Chrome on Android, Macs), and
 * otherwise the ZXing reader (Windows PCs, iPhones), loaded only when the camera opens. It
 * is bundled with the app, not fetched from the internet, so it also works on the on-site
 * server.
 *
 * Browsers only allow the camera on a secure link: https, or localhost on the same
 * computer. On a plain http:// address (a server on the hospital network) it says so.
 */

// The AIIMS Kalyani OPD booklet prints the CR No (15 digits) as a small, dense 1-D barcode
// on a thermal sticker, most likely Code 39. The other common 1-D types are kept in case
// the sticker printer changes. QR stays so a queue slip's QR can be recognised and turned
// away. Fewer types means more attempts per second on a slow phone.
const NATIVE_FORMATS = ['code_39', 'codabar', 'code_128', 'code_93', 'itf', 'ean_13', 'ean_8', 'upc_a', 'qr_code'];

const SCAN_EVERY_MS = 150;

/**
 * Small printed barcodes need sharp focus and enough pixels across each thin bar (about
 * two at the very least). Ask for a high-resolution picture and continuous autofocus, and
 * on phones zoom in a little, so the booklet can be held where the camera still focuses.
 * Each step is skipped quietly on cameras that can't do it.
 */
async function tuneCamera(track: MediaStreamTrack | undefined) {
  if (!track?.getCapabilities) return;
  const caps = track.getCapabilities() as MediaTrackCapabilities & {
    focusMode?: string[];
    zoom?: { min: number; max: number };
  };
  const advanced: Record<string, unknown>[] = [];
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  const onPhone = window.matchMedia?.('(pointer: coarse)').matches;
  if (onPhone && caps.zoom && caps.zoom.max >= 1.5) advanced.push({ zoom: Math.min(2, caps.zoom.max) });
  for (const c of advanced) {
    try {
      await track.applyConstraints({ advanced: [c as MediaTrackConstraintSet] });
    } catch {}
  }
}

function cameraErrorText(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera permission is turned off. Allow the camera for this site in the browser settings, or type the CRN.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera found on this device. Use the handheld scanner, or type the CRN.';
  }
  if (name === 'NotReadableError') {
    return 'The camera is being used by another app. Close it and try again.';
  }
  return 'Could not open the camera. Type the CRN instead.';
}

/**
 * Whether to offer the camera button. Hidden on computers with no camera (a desk with
 * only a handheld scanner), and shown as soon as one is plugged in. On a plain http://
 * link the browser hides the camera list, so phones still get the button, which then
 * explains why the camera can't open.
 */
export function useCameraAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const devices = navigator.mediaDevices;
    if (!window.isSecureContext || !devices?.enumerateDevices) {
      setAvailable(touch);
      return;
    }
    const check = () =>
      devices
        .enumerateDevices()
        .then((list) => !cancelled && setAvailable(list.some((d) => d.kind === 'videoinput')))
        .catch(() => !cancelled && setAvailable(touch));
    void check();
    devices.addEventListener?.('devicechange', check);
    return () => {
      cancelled = true;
      devices.removeEventListener?.('devicechange', check);
    };
  }, []);
  return available;
}

/** The QR code on the queue slip is a web link, not a CRN. */
export function isSlipQrCode(code: string): boolean {
  return /^https?:\/\//i.test(code.trim());
}

export default function BarcodeScanner({
  onDetected,
  onClose,
  title = 'Scan booklet barcode',
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [message, setMessage] = useState('');

  // The latest callbacks, without restarting the camera each time the parent re-renders.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let stopDecoding: (() => void) | null = null;
    let timer: number | undefined;

    const cleanup = () => {
      if (timer) window.clearTimeout(timer);
      try {
        stopDecoding?.();
      } catch {}
      stream?.getTracks().forEach((t) => t.stop());
    };

    const found = (code: string) => {
      if (stopped || !code) return;
      stopped = true;
      cleanup();
      try {
        navigator.vibrate?.(80);
      } catch {}
      onDetectedRef.current(code);
    };

    const fail = (text: string) => {
      if (stopped) return;
      setStatus('error');
      setMessage(text);
    };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        fail('The camera only works over a secure (https) link. Use the handheld scanner, or type the CRN.');
        return;
      }
      try {
        // The back camera on phones; the only camera on most computers.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (e) {
        fail(cameraErrorText(e));
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      await tuneCamera(stream.getVideoTracks()[0]);
      if (stopped) return;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (stopped) return;
      setStatus('scanning');

      // 1. The browser's own reader, if it reads the formats we need.
      const Native = (window as unknown as { BarcodeDetector?: any }).BarcodeDetector;
      let formats: string[] = [];
      if (Native?.getSupportedFormats) {
        try {
          const supported: string[] = await Native.getSupportedFormats();
          formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
        } catch {}
      }
      if (formats.length > 0) {
        const detector = new Native({ formats });
        const tick = async () => {
          if (stopped) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              const code = codes?.[0]?.rawValue?.trim();
              if (code) return found(code);
            }
          } catch {}
          timer = window.setTimeout(tick, SCAN_EVERY_MS);
        };
        void tick();
        return;
      }

      // 2. ZXing. "Try harder" reads small or slightly blurred 1-D barcodes better.
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (stopped) return;
        const hints = new Map<any, any>([
          [DecodeHintType.TRY_HARDER, true],
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [
              BarcodeFormat.CODE_39, BarcodeFormat.CODABAR, BarcodeFormat.CODE_128, BarcodeFormat.CODE_93,
              BarcodeFormat.ITF, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.QR_CODE,
            ],
          ],
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: SCAN_EVERY_MS });
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          const code = result?.getText()?.trim();
          if (code) found(code);
        });
        stopDecoding = () => controls.stop();
        if (stopped) controls.stop();
      } catch {
        fail('Could not start the barcode reader. Type the CRN instead.');
      }
    })();

    return () => {
      stopped = true;
      cleanup();
    };
  }, []);

  // Escape closes; the page behind doesn't scroll while the camera is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] bg-slate-950/90 flex items-center justify-center p-4 print:hidden"
    >
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between gap-3 text-white mb-3">
          <p className="font-black text-lg flex items-center gap-2">
            <Camera size={20} /> {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative w-full aspect-[3/4] sm:aspect-video bg-black rounded-2xl overflow-hidden">
          {/* playsInline: iPhones would otherwise open the video full screen */}
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
          {status === 'scanning' && (
            // Where to hold the barcode; the rest of the picture is dimmed.
            // Wide and short, the shape of the CR No barcode on the booklet sticker.
            <div
              aria-hidden
              className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-1/4 rounded-xl border-4 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            />
          )}
          {status === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
              <Loader2 className="animate-spin" size={28} />
              <span className="text-sm font-semibold">Opening the camera…</span>
            </div>
          )}
          {status === 'error' && (
            <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-white font-semibold">
              {message}
            </p>
          )}
        </div>

        {status !== 'error' && (
          <p className="mt-3 text-center text-sm text-slate-300">
            Point at the barcode next to <strong className="text-white">CR No</strong> on the booklet. Move closer until
            it fills the green box and looks sharp. It is read by itself.
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full min-h-12 rounded-2xl bg-white text-slate-900 text-base font-black hover:bg-slate-100"
        >
          {status === 'error' ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
