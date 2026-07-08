import { describe, it, expect } from 'vitest';
import { filterCustomers, type CustomerOption } from '@/lib/customerLookup';

const cs: CustomerOption[] = [
  { id: 1, name: 'Ahmad One', phone: '555-0101', address: '1 First St' },
  { id: 2, name: 'Ahmad Two', phone: '555-0202', address: '2 Second St' },
  { id: 3, name: 'Zoe', phone: null, address: null },
];

describe('filterCustomers', () => {
  it('matches name case-insensitively', () => {
    expect(filterCustomers('ahmad', cs)).toHaveLength(2);
  });
  it('disambiguates duplicate names by phone and address', () => {
    expect(filterCustomers('0202', cs).map(c => c.id)).toEqual([2]);
    expect(filterCustomers('first st', cs).map(c => c.id)).toEqual([1]);
  });
  it('handles null phone/address without throwing', () => {
    expect(filterCustomers('zoe', cs).map(c => c.id)).toEqual([3]);
  });
  it('returns [] for empty query and caps at 8 hits', () => {
    expect(filterCustomers('', cs)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Bob ${i}`, phone: null, address: null }));
    expect(filterCustomers('bob', many)).toHaveLength(8);
  });
});
