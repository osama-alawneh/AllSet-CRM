// Phase timing for hunting production latency. Silent unless PERF_LOG=1, so the hot
// path pays one env read and nothing else when it is off. Deliberately not importing
// `server-only`: proxy.ts runs outside the RSC module graph and would fail that guard.
const enabled = () => process.env.PERF_LOG === '1';

// PostgREST query builders are thenables rather than real Promises, so the callback is
// typed PromiseLike and awaited rather than returned directly.
export async function timed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  if (!enabled()) return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`PERF ${label} ${Math.round(performance.now() - t0)}ms`);
  }
}

export function mark(label: string, sinceMs: number): void {
  if (enabled()) console.log(`PERF ${label} ${Math.round(performance.now() - sinceMs)}ms`);
}
