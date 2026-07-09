// @vitest-environment jsdom
//
// A service worker registered by an earlier PRODUCTION run on this origin outlives it: the
// dev gate in SWRegister only skips NEW registrations, it never removes the old worker. That
// worker serves /_next/static/ cache-first, and Turbopack dev chunk URLs are path-derived
// (NOT content-hashed), so after any code change a normal reload gets fresh HTML + stale JS —
// a hydration mismatch (observed live: pre-badge NavLink chunk vs badge-ful HTML). Dev must
// therefore actively evict: unregister every registration AND drop all CacheStorage caches.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { SWRegister } from '@/components/shell/SWRegister';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function stubSW() {
  const unregister = vi.fn().mockResolvedValue(true);
  const register = vi.fn().mockResolvedValue({});
  const getRegistrations = vi.fn().mockResolvedValue([{ unregister }, { unregister }]);
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: { register, getRegistrations },
  });
  const cacheDelete = vi.fn().mockResolvedValue(true);
  Object.defineProperty(window, 'caches', {
    configurable: true,
    value: { keys: vi.fn().mockResolvedValue(['clearview-v2']), delete: cacheDelete },
  });
  return { unregister, register, getRegistrations, cacheDelete };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('SWRegister', () => {
  it('outside production: unregisters every existing service worker and drops caches, registers nothing', async () => {
    const sw = stubSW();
    render(<SWRegister />); // vitest NODE_ENV is 'test'
    await flush();
    expect(sw.register).not.toHaveBeenCalled();
    expect(sw.getRegistrations).toHaveBeenCalled();
    expect(sw.unregister).toHaveBeenCalledTimes(2);
    expect(sw.cacheDelete).toHaveBeenCalledWith('clearview-v2');
  });

  it('in production: registers /sw.js and does not unregister', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const sw = stubSW();
    render(<SWRegister />);
    await flush();
    expect(sw.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
    expect(sw.unregister).not.toHaveBeenCalled();
  });
});
