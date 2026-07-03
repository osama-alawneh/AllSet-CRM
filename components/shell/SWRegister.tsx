'use client';
import { useEffect } from 'react';

// Registers /sw.js only in production builds (next dev is excluded so a stale SW never shadows
// HMR). updateViaCache:'none' makes the browser always re-fetch sw.js so updates are picked up.
export function SWRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);
  return null;
}
