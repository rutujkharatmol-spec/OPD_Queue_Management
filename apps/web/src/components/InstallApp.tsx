'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { INSTALLED_KEY } from '../lib/installPrompt';

/**
 * "Download App": installs this web app on the phone or computer (home-screen icon, opens
 * full screen like an app). Chrome, Edge and Samsung Internet offer their own install
 * prompt; Safari and Firefox don't, so for those we show the steps instead.
 *
 * The browser fires `beforeinstallprompt` once, often before React has loaded, so the
 * layout catches it early (lib/installPrompt.ts) and keeps it on window.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    __opdInstallPrompt?: InstallPromptEvent | null;
  }
}

/** Already opened from the home-screen icon / installed app window. */
function runningAsApp() {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** Installed on this device: opened as the app now, or installed earlier from this browser. */
function isInstalled() {
  if (runningAsApp()) {
    try { localStorage.setItem(INSTALLED_KEY, '1'); } catch {}
    return true;
  }
  try {
    return localStorage.getItem(INSTALLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function useInstallApp() {
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const sync = () => setInstalled(isInstalled());
    sync();
    window.addEventListener('opd:install-ready', sync);
    return () => window.removeEventListener('opd:install-ready', sync);
  }, []);

  const install = useCallback(async () => {
    const promptEvent = window.__opdInstallPrompt;
    if (!promptEvent) {
      setHelpOpen(true);
      return;
    }
    // Each prompt can be shown once; the browser sends a fresh one if it is dismissed.
    window.__opdInstallPrompt = null;
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {
      setHelpOpen(true);
    }
  }, []);

  const closeHelp = useCallback(() => setHelpOpen(false), []);

  return { installed, install, helpOpen, closeHelp };
}

type Platform = 'ios' | 'android' | 'desktop';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but with a touch screen.
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

const STEPS: Record<Platform, { title: string; steps: React.ReactNode[] }> = {
  ios: {
    title: 'iPhone / iPad (Safari)',
    steps: [
      <>Open this page in <strong>Safari</strong>.</>,
      <>Tap the <strong>Share</strong> button (square with an arrow up).</>,
      <>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</>,
    ],
  },
  android: {
    title: 'Android (Chrome)',
    steps: [
      <>Open this page in <strong>Chrome</strong>.</>,
      <>Tap the <strong>⋮</strong> menu at the top right.</>,
      <>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</>,
    ],
  },
  desktop: {
    title: 'Computer (Chrome or Edge)',
    steps: [
      <>Open this page in <strong>Chrome</strong> or <strong>Edge</strong>.</>,
      <>Click the <strong>install icon</strong> at the right end of the address bar, or the <strong>⋮ / …</strong> menu.</>,
      <>Choose <strong>Install OPD Queue</strong> (Edge: <strong>Apps → Install this site as an app</strong>).</>,
    ],
  },
};

export function InstallAppHelp({ onClose }: { onClose: () => void }) {
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!platform) return null;
  const others = (Object.keys(STEPS) as Platform[]).filter((p) => p !== platform);

  // Portal: the navbar's backdrop blur would otherwise trap this fixed overlay inside it.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-app-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-6 text-white"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
              <Download size={20} />
            </div>
            <div>
              <h2 id="install-app-title" className="text-lg font-black">Download the app</h2>
              <p className="text-xs text-slate-400">Adds OPD Queue to your home screen. Nothing to download from a store.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <StepList {...STEPS[platform]} highlight />

        <details className="mt-4 group">
          <summary className="cursor-pointer text-sm font-bold text-slate-300 hover:text-white">Other devices</summary>
          {others.map((p) => (
            <StepList key={p} {...STEPS[p]} />
          ))}
        </details>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full min-h-12 rounded-2xl bg-blue-600 hover:bg-blue-500 text-base font-black"
        >
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}

function StepList({ title, steps, highlight }: { title: string; steps: React.ReactNode[]; highlight?: boolean }) {
  return (
    <div className={`mt-4 rounded-2xl p-4 ${highlight ? 'bg-slate-950/80 border border-blue-500/40' : 'bg-slate-950/50 border border-slate-800'}`}>
      <p className="text-sm font-black text-slate-100">{title}</p>
      <ol className="mt-2 space-y-1.5 text-sm text-slate-300 list-decimal list-inside">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
