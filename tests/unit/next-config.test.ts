import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

describe('next config', () => {
  // Guards the client router cache: at the 0s default, revisiting a page always costs a
  // server round trip, which is half of what backlog item 10 measured.
  it('gives the client router cache a non-zero TTL for dynamic routes', () => {
    expect(nextConfig.experimental?.staleTimes?.dynamic).toBe(30);
    expect(nextConfig.experimental?.staleTimes?.static).toBe(180);
  });
});
