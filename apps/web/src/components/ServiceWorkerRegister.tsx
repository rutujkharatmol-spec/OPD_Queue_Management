// src/components/ServiceWorkerRegister.tsx
'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const register = () => {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .then((registration) => {
            console.log('[SW] ServiceWorker successfully registered with scope:', registration.scope);
            // Check for updates periodically
            registration.update().catch(() => {});
          })
          .catch((err) => {
            console.error('[SW] ServiceWorker registration failed:', err);
          });
      };

      // Register immediately if page is already loaded, otherwise listen for load
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        register();
      } else {
        window.addEventListener('load', register);
        return () => window.removeEventListener('load', register);
      }
    }
  }, []);

  return null;
}
