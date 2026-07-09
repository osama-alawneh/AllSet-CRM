import { describe, it, expect } from 'vitest';
import {
  LEAD_STATUSES,
  statusLabel,
  statusColor,
  groupByStatus,
  buildLeads,
  parseLeadForm,
  SERVICE_TYPES,
  type Lead,
  type LeadPublicRow,
  type CustomerGeo,
} from '@/lib/leads';

const lead = (over: Partial<Lead>): Lead => ({
  id: 1, customer_id: 1, status: 'new', service: 'TBD', description: null, stories: 2, panes: 12,
  note: null, quote_value: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  customer_name: 'X', address: null, phone: null, email: null, lat: null, lng: null,
  rep_id: null, rep_name: null, ...over,
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

describe('SERVICE_TYPES', () => {
  it('has exactly the four owner-defined service options', () => {
    expect(SERVICE_TYPES).toHaveLength(4);
    expect(SERVICE_TYPES).toEqual(['Window Cleaning', 'Car Detailing', 'Pressure Washing', 'Snow Plow']);
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
    { id: 10, customer_id: 1, status: 'won', service: 'In + out', description: null, stories: 2, panes: 18, note: 'Booked.', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', rep_id: 'rep-1' },
    { id: 11, customer_id: 2, status: 'new', service: null, description: null, stories: null, panes: null, note: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z', rep_id: null },
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
  it('passes rep_id through and resolves rep_name from the names map', () => {
    const names = new Map([['rep-1', 'Rep Crud']]);
    const out = buildLeads(rows, customers, null, names);
    expect(out[0].rep_id).toBe('rep-1');
    expect(out[0].rep_name).toBe('Rep Crud');
    expect(out[1].rep_id).toBeNull();
    expect(out[1].rep_name).toBeNull(); // no rep_id -> no lookup
  });
  it('rep_name is null when rep_id has no match in the names map', () => {
    const out = buildLeads(rows, customers, null); // default empty names map
    expect(out[0].rep_id).toBe('rep-1');
    expect(out[0].rep_name).toBeNull();
  });
});

describe('parseLeadForm rep_id', () => {
  const base = () => {
    const fd = new FormData();
    fd.set('customer_id', '1');
    fd.set('service', 'Window Cleaning');
    return fd;
  };
  it('passes rep_id through when present', () => {
    const fd = base();
    fd.set('rep_id', '90000000-0000-0000-0000-000000000031');
    const res = parseLeadForm(fd);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.rep_id).toBe('90000000-0000-0000-0000-000000000031');
  });
  it('omits (nulls) rep_id when blank', () => {
    const fd = base();
    fd.set('rep_id', '');
    const res = parseLeadForm(fd);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.rep_id).toBeNull();
  });
  it('omits (nulls) rep_id when absent entirely', () => {
    const fd = base();
    const res = parseLeadForm(fd);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.rep_id).toBeNull();
  });
});
