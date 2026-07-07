import { describe, expect, it } from 'vitest';
import { blankMoneyToZero } from '@/lib/forms';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('blankMoneyToZero', () => {
  it('blank present field becomes "0"', () => {
    const f = blankMoneyToZero(fd({ quote: '' }), 'quote');
    expect(f.get('quote')).toBe('0');
  });
  it('whitespace-only present field becomes "0"', () => {
    const f = blankMoneyToZero(fd({ price: '   ' }), 'price');
    expect(f.get('price')).toBe('0');
  });
  it('absent field stays absent (rep forms never render the input — RPC must keep ignoring it)', () => {
    const f = blankMoneyToZero(fd({ service: 'x' }), 'quote');
    expect(f.has('quote')).toBe(false);
    expect(f.get('quote')).toBeNull();
  });
  it('non-blank value is untouched', () => {
    expect(blankMoneyToZero(fd({ quote: '350' }), 'quote').get('quote')).toBe('350');
    expect(blankMoneyToZero(fd({ quote: '0' }), 'quote').get('quote')).toBe('0');
  });
  it('parseLeadForm accepts the transformed "0" as a valid zero quote', () => {
    // integration guard: blank -> '0' -> parses to numeric 0 (not null), so update_lead applies it
    const f = blankMoneyToZero(fd({ customer_id: '7', service: 'S', quote: '' }), 'quote');
    expect(f.get('quote')).toBe('0');
  });
});
