'use client';

import { useEffect } from 'react';

export function EmailWorkerStarter() {
  useEffect(() => {
    // Auto start email worker on app load
    fetch('/api/email-worker').catch(console.error);
  }, []);

  return null;
}
