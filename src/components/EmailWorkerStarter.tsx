'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

export function EmailWorkerStarter() {
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    // Immediate heartbeat trigger
    const pingServer = () => {
      fetch('/api/health', { cache: 'no-store' }).catch(() => {});
      fetch('/api/email-worker', { cache: 'no-store' }).catch(() => {});
    };

    pingServer();

    // 1. Periodic 45-second heartbeat to keep Render server awake and email sync active
    const heartbeatTimer = setInterval(pingServer, 45 * 1000);

    // 2. Event listeners for tab focus, phone wake-up, and online recovery
    const handleActivity = () => {
      if (document.visibilityState === 'visible') {
        pingServer();
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      pingServer();
      setTimeout(() => setShowReconnected(false), 4000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine);
      window.addEventListener('visibilitychange', handleActivity);
      window.addEventListener('focus', pingServer);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      clearInterval(heartbeatTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('visibilitychange', handleActivity);
        window.removeEventListener('focus', pingServer);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  return (
    <>
      {/* Offline Toast Banner */}
      {!isOnline && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 bg-red-600/95 text-white rounded-2xl shadow-2xl backdrop-blur-md border border-red-400/40 text-xs font-semibold animate-bounce">
          <WifiOff size={16} className="shrink-0" />
          <span>Internet Connection Lost — Retrying...</span>
        </div>
      )}

      {/* Reconnected Toast Banner */}
      {showReconnected && isOnline && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 bg-emerald-600/95 text-white rounded-2xl shadow-2xl backdrop-blur-md border border-emerald-400/40 text-xs font-semibold animate-fade-in">
          <Wifi size={16} className="shrink-0" />
          <span>Online & Synced with Database</span>
        </div>
      )}
    </>
  );
}
