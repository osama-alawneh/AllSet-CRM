import { describe, it, expect } from 'vitest';
import {
  LEAD_STATUSES,
  statusLabel,
  statusColor,
  groupByStatus,
  buildLeads,
  type Lead,
  type LeadPublicRow,
  type CustomerGeo,
} from '@/lib/leads';

const lead = (over: Partial<Lead>): Lead => ({
  id: 1, customer_id: 1, status: 'new', service: 'TBD', stories: 2, panes: 12,
  note: null, quote_value: null, customer_name: 'X', address: null, phone: null,
  email: null, lat: null, lng: null, ...over,
});

describe('status maps', () => {
  it('lists the four statuses in pipeline order', () => {
    expect(LEAD_STATUSES).toEqual(['new', 'follow', 'won', 'lost']);
  });
  it('has a label and a color for every status', () => {
    for (const s of LEAD_STATUSES) {
      expect(statusLabel[s]).toBeTruthy();
      expect(statusColor[s]).toMatch(/^var\(--/);
    }
  });
});

describe('groupByStatus', () => {
  it('buckets leads and always returns all four keys', () => {
    const g = groupByStatus([lead({ id: 1, status: 'won' }), lead({ id: 2, status: 'won' }), lead({ id: 3, status: 'lost' })]);
    expect(g.won.map(l => l.id)).toEqual([1, 2]);
    expect(g.lost.map(l => l.id)).toEqual([3]);
    expect(g.new).toEqual([]);
    expect(g.follow).toEqual([]);
  });
});

describe('buildLeads', () => {
  const rows: LeadPublicRow[] = [
    { id: 10, customer_id: 1, status: 'won', service: 'In + out', stories: 2, panes: 18, note: 'Booked.' },
    { id: 11, customer_id: 2, status: 'new', service: null, stories: null, panes: null, note: null },
  ];
  const customers: CustomerGeo[] = [
    { id: 1, name: 'Sarah Kim', address: '142 Maple Ave', phone: '555-0142', email: 's@k.io', lat: 42.331, lng: -83.045 },
  ];
  it('joins customer fields and derives coords', () => {
    const out = buildLeads(rows, customers, null);
    expect(out[0].customer_name).toBe('Sarah Kim');
    expect(out[0].address).toBe('142 Maple Ave');
    expect(out[0].lat).toBe(42.331);
    expect(out[1].customer_name).toBe('Unknown'); // customer 2 absent
    expect(out[1].lat).toBeNull();
  });
  it('exposes quote only when a quote map is supplied (admin)', () => {
    const q = new Map<number, number>([[10, 180]]);
    const admin = buildLeads(rows, customers, q);
    expect(admin[0].quote_value).toBe(180);
    expect(admin[1].quote_value).toBeNull();
    const nonAdmin = buildLeads(rows, customers, null);
    expect(nonAdmin[0].quote_value).toBeNull();
  });
});
