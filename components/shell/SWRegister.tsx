'use client';
import { useEffect } from 'react';

// Registers /sw.js only in production builds. updateViaCache:'none' makes the browser always
// re-fetch sw.js so updates are picked up. Outside production, skipping registration is NOT
// enough: a worker registered by an earlier production run on this origin stays active and
// serves /_next/static/ cache-first, and Turbopack dev chunk URLs are path-derived (not
// content-hashed) — so after any code change a normal reload gets fresh HTML + stale JS,
// which surfaces as hydration mismatches. Dev must actively evict the old worker and caches.
export function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      // Cache deletion takes effect immediately (unregister only applies from the next
      // navigation), so the very next reload already fetches fresh chunks.
      if ('caches' in window) {
        caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
      }
      return;
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  }, []);
  return null;
}
