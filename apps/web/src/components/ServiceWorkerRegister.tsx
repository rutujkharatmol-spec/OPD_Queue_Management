// src/components/ServiceWorkerRegister.tsx
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Sparkles, RefreshCw, X, ArrowUpCircle } from 'lucide-react';

declare global {
  interface Window {
    __checkAppUpdate?: () => Promise<boolean>;
    __applyAppUpdate?: () => Promise<void>;
  }
}

export function ServiceWorkerRegister() {
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Apply update: post SKIP_WAITING to waiting worker or clear caches and reload
  const applyUpdate = useCallback(async () => {
    setIsUpdating(true);
    try {
      if (swRegistration?.waiting) {
        swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else if ('caches' in window) {
        // Force refresh all cache keys
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn('[SW] Update failed, forcing reload:', e);
    } finally {
      // Reload page to get fresh assets
      setTimeout(() => {
        window.location.reload();
      }, 300);
    }
  }, [swRegistration]);

  // Check for updates manually
  const checkForUpdate = useCallback(async (): Promise<boolean> => {
    if (!swRegistration) {
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            const hasWaiting = Boolean(reg.waiting);
            if (hasWaiting) setUpdateAvailable(true);
            return hasWaiting;
          }
        } catch {}
      }
      return false;
    }
    try {
      await swRegistration.update();
      const hasWaiting = Boolean(swRegistration.waiting);
      if (hasWaiting) setUpdateAvailable(true);
      return hasWaiting;
    } catch {
      return false;
    }
  }, [swRegistration]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    window.__checkAppUpdate = checkForUpdate;
    window.__applyAppUpdate = applyUpdate;

    let refreshing = false;
    // Reload when the new service worker takes over
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    const register = async () => {
      // In development mode, avoid SW caching to prevent conflicts with Turbopack Fast Refresh
      if (process.env.NODE_ENV === 'development') {
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        setSwRegistration(registration);

        // Check if there is already a waiting worker
        if (registration.waiting) {
          setUpdateAvailable(true);
          window.dispatchEvent(new CustomEvent('app-update-available'));
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
              window.dispatchEvent(new CustomEvent('app-update-available'));
            }
          });
        });

        // Periodic check for updates every 15 minutes
        const interval = setInterval(() => {
          registration.update().catch(() => {});
        }, 15 * 60 * 1000);

        return () => clearInterval(interval);
      } catch (err) {
        console.warn('[SW] ServiceWorker registration notice:', err);
      }
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      register();
    } else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, [applyUpdate, checkForUpdate]);

  if (!updateAvailable || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in fade-in slide-in-from-bottom-5 duration-300 p-4">
      <div className="bg-slate-900/95 border-2 border-blue-500/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl text-white flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/30 shrink-0">
              <Sparkles className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">App Update Available</h4>
              <p className="text-xs text-slate-300">A new version of AIIMS OPD Queue is ready.</p>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={applyUpdate}
            disabled={isUpdating}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Updating Web App...</span>
              </>
            ) : (
              <>
                <ArrowUpCircle className="w-3.5 h-3.5" />
                <span>Update Now</span>
              </>
            )}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
