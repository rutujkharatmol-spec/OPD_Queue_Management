// src/components/NetworkProvider.tsx
'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getOfflineQueue, processOfflineQueue } from '../lib/offlineSync';
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

interface NetworkContextType {
  isOffline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncMessage: string | null;
  triggerManualSync: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType>({
  isOffline: false,
  pendingCount: 0,
  isSyncing: false,
  syncMessage: null,
  triggerManualSync: async () => {},
});

export const useNetwork = () => useContext(NetworkContext);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Refresh current queue length
  const updatePendingCount = useCallback(() => {
    const queue = getOfflineQueue();
    setPendingCount(queue.length);
  }, []);

  const handleSync = useCallback(async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    setSyncMessage(`Syncing ${queue.length} pending offline actions...`);

    try {
      const result = await processOfflineQueue();
      updatePendingCount();

      if (result.succeeded > 0) {
        setSyncMessage(`Synced ${result.succeeded} offline change${result.succeeded > 1 ? 's' : ''}!`);
      } else if (result.remaining > 0) {
        setSyncMessage(`${result.remaining} item(s) could not sync. Will retry.`);
      }
    } catch (err) {
      console.error('[NetworkProvider] Sync error:', err);
      setSyncMessage('Sync failed. Will retry automatically.');
    } finally {
      setIsSyncing(false);
      // Auto-hide success message after 4 seconds
      setTimeout(() => {
        setSyncMessage(null);
      }, 4000);
    }
  }, [updatePendingCount]);

  useEffect(() => {
    // Initial status
    setIsOffline(!navigator.onLine);
    updatePendingCount();

    const handleOnline = () => {
      setIsOffline(false);
      handleSync();
    };

    const handleOffline = () => {
      setIsOffline(true);
      updatePendingCount();
    };

    const handleQueueChange = () => {
      updatePendingCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-queue-updated', handleQueueChange);
    window.addEventListener('storage', handleQueueChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-queue-updated', handleQueueChange);
      window.removeEventListener('storage', handleQueueChange);
    };
  }, [handleSync, updatePendingCount]);

  return (
    <NetworkContext.Provider
      value={{
        isOffline,
        pendingCount,
        isSyncing,
        syncMessage,
        triggerManualSync: handleSync,
      }}
    >
      {/* Floating Status Banner */}
      <div className="fixed top-4 left-0 right-0 z-50 pointer-events-none flex justify-center px-4">
        {isOffline && (
          <div className="pointer-events-auto flex items-center gap-2.5 bg-amber-500 text-slate-950 font-semibold px-4 py-2 rounded-full shadow-xl backdrop-blur-md border border-amber-300/80 text-sm transition-all duration-300 animate-bounce-short">
            <WifiOff className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            <span>
              📡 You are offline. Data saved locally.
              {pendingCount > 0 && <span className="ml-1 font-bold underline">({pendingCount} pending)</span>}
            </span>
          </div>
        )}

        {!isOffline && syncMessage && (
          <div
            className={`pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full shadow-xl backdrop-blur-md text-sm font-medium transition-all duration-300 ${
              isSyncing
                ? 'bg-blue-600/95 text-white border border-blue-400'
                : 'bg-emerald-600/95 text-white border border-emerald-400'
            }`}
          >
            {isSyncing ? (
              <RefreshCw className="w-4 h-4 text-white animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-white" />
            )}
            <span>{syncMessage}</span>
          </div>
        )}
      </div>

      {children}
    </NetworkContext.Provider>
  );
}
