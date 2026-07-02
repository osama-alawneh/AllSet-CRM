import { describe, it, expect } from 'vitest';
import { buildOrFilter } from '@/lib/search';

describe('buildOrFilter', () => {
  it('builds ilike or-filter across name/phone/address', () => {
    expect(buildOrFilter('sarah')).toBe(
      'name.ilike.%sarah%,phone.ilike.%sarah%,address.ilike.%sarah%'
    );
  });
  it('returns null for empty/whitespace', () => {
    expect(buildOrFilter('')).toBeNull();
    expect(buildOrFilter('   ')).toBeNull();
  });
  it('strips PostgREST-reserved chars (commas, parens, %, _) so the or() stays valid', () => {
    expect(buildOrFilter('a,b(c)%_d')).toBe(
      'name.ilike.%a b c d%,phone.ilike.%a b c d%,address.ilike.%a b c d%'
    );
  });
  it('collapses whitespace', () => {
    expect(buildOrFilter('  555   0142 ')).toBe(
      'name.ilike.%555 0142%,phone.ilike.%555 0142%,address.ilike.%555 0142%'
    );
  });
});
