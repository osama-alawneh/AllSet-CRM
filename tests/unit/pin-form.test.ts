import { describe, it, expect } from 'vitest';
import { parsePinForm } from '@/lib/leads';

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe('parsePinForm', () => {
  it('accepts a valid pin', () => {
    const r = parsePinForm(fd({ name: '12 Oak', address: '12 Oak St', lat: '42.33', lng: '-83.04', status: 'won' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ name: '12 Oak', address: '12 Oak St', lat: 42.33, lng: -83.04, status: 'won' });
    }
  });
  it('requires a name', () => {
    const r = parsePinForm(fd({ name: '  ', lat: '42.33', lng: '-83.04', status: 'won' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/i);
  });
  it('rejects non-numeric coordinates', () => {
    const r = parsePinForm(fd({ name: 'X', lat: 'abc', lng: '-83.04', status: 'won' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/coordinate/i);
  });
  it('rejects an unknown status', () => {
    const r = parsePinForm(fd({ name: 'X', lat: '42.33', lng: '-83.04', status: 'sold' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/status/i);
  });
});
