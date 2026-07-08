import { describe, it, expect } from 'vitest';
import { filterCustomers, type CustomerRow } from '@/lib/customers';

const row = (over: Partial<CustomerRow>): CustomerRow => ({
  id: 1, name: 'Sarah Kim', phone: '555-0142', email: null, address: '142 Maple Ave',
  type: 'residential', notes: null, active: true, jobs: 0, invoices: null, ...over,
});

describe('filterCustomers', () => {
  const rows = [
    row({ id: 1, name: 'Sarah Kim', address: '142 Maple Ave' }),
    row({ id: 2, name: 'Alan Webb', address: '900 Market St', phone: '555-0900' }),
    row({ id: 3, name: 'Alicia Cole', address: '401 Rowan Ave', phone: null }),
  ];
  it('empty query returns all', () => {
    expect(filterCustomers(rows, '')).toHaveLength(3);
  });
  it('matches name case-insensitively', () => {
    expect(filterCustomers(rows, 'al').map(r => r.id)).toEqual([2, 3]);
  });
  it('matches address', () => {
    expect(filterCustomers(rows, 'maple').map(r => r.id)).toEqual([1]);
  });
  it('matches phone and tolerates null phone', () => {
    expect(filterCustomers(rows, '0900').map(r => r.id)).toEqual([2]);
  });
});
