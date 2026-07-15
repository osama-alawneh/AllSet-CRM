import { describe, it, expect } from 'vitest';
import {
  DOT_STATUSES, dotStatusColor, dotStatusLabel,
  parseConvertLeadForm, parseConvertJobForm, type Dot,
} from '@/lib/dots';
import { buildMapPins, pinColor, visibleMapPins, type MapPin } from '@/lib/mapPins';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('dot status vocab', () => {
  it('covers all five statuses with colors and labels', () => {
    expect(DOT_STATUSES).toEqual(['yes', 'no', 'not_home', 'callback', 'unmarked']);
    for (const s of DOT_STATUSES) {
      expect(dotStatusColor[s]).toMatch(/^var\(--/);
      expect(dotStatusLabel[s].length).toBeGreaterThan(0);
    }
    expect(dotStatusColor.yes).toBe('var(--won)');
    expect(dotStatusColor.no).toBe('var(--lost)');
    expect(dotStatusColor.not_home).toBe('var(--prog)');
    expect(dotStatusColor.callback).toBe('var(--sched)');
    expect(dotStatusColor.unmarked).toBe('var(--new)');
  });
});

describe('buildMapPins with dots', () => {
  const dots: Dot[] = [
    { id: 7, lat: 42.3, lng: -83.0, label: '12 Oak St', notes: '', status: 'callback' },
    { id: 8, lat: 42.4, lng: -83.1, label: '', notes: '', status: 'unmarked' },
  ];
  it('appends dot pins with label fallback and colors by dot status', () => {
    const pins = buildMapPins([], [], new Map(), dots);
    expect(pins).toHaveLength(2);
    expect(pins[0]).toMatchObject({ kind: 'dot', id: 7, status: 'callback', label: '12 Oak St — Callback' });
    expect(pins[1].label).toBe('Dot — Unmarked'); // empty label falls back
    expect(pinColor(pins[0])).toBe('var(--sched)');
  });
  it('omitting dots keeps the old two-arg behavior', () => {
    expect(buildMapPins([], [], new Map())).toEqual([]);
  });
});

describe('visibleMapPins', () => {
  const mk = (kind: MapPin['kind']): MapPin =>
    kind === 'dot'
      ? { kind, id: 1, lat: 0, lng: 0, status: 'yes', label: 'd' }
      : kind === 'job'
        ? { kind, id: 1, lat: 0, lng: 0, status: 'unclaimed', label: 'j' }
        : { kind, id: 1, lat: 0, lng: 0, status: 'new', label: 'l' };
  it('filters each kind by its own toggle (dots no longer bucket under jobs)', () => {
    const pins = [mk('lead'), mk('job'), mk('dot')];
    expect(visibleMapPins(pins, { leads: true, jobs: false, dots: true }).map(p => p.kind)).toEqual(['lead', 'dot']);
    expect(visibleMapPins(pins, { leads: false, jobs: true, dots: false }).map(p => p.kind)).toEqual(['job']);
  });
});

describe('parseConvertLeadForm', () => {
  const base = { dot_id: '7', name: 'Jane', phone: '', address: '12 Oak St', service: 'Window Cleaning', status: 'new', note: '', quote: '' };
  it('parses a full form', () => {
    const r = parseConvertLeadForm(fd({ ...base, phone: '555', note: 'hi', quote: '250' }));
    expect(r).toEqual({ ok: true, value: { dot_id: 7, name: 'Jane', phone: '555', address: '12 Oak St', service: 'Window Cleaning', status: 'new', note: 'hi', quote: 250 } });
  });
  it('falls back name -> address when name blank', () => {
    const r = parseConvertLeadForm(fd({ ...base, name: '' }));
    expect(r.ok && r.value.name).toBe('12 Oak St');
  });
  it('rejects when both name and address blank', () => {
    expect(parseConvertLeadForm(fd({ ...base, name: '', address: '' }))).toEqual({ ok: false, error: 'Name or address is required' });
  });
  it('rejects bad dot id, bad status, missing service, negative quote', () => {
    expect(parseConvertLeadForm(fd({ ...base, dot_id: 'x' })).ok).toBe(false);
    expect(parseConvertLeadForm(fd({ ...base, status: 'meh' })).ok).toBe(false);
    expect(parseConvertLeadForm(fd({ ...base, service: '' })).ok).toBe(false);
    expect(parseConvertLeadForm(fd({ ...base, quote: '-1' })).ok).toBe(false);
  });
});

describe('parseConvertJobForm', () => {
  const base = { dot_id: '7', name: 'Jane', phone: '', address: '12 Oak St', service: 'Window Cleaning', description: '', scheduled_date: '', price: '', cleaner_amount: '' };
  it('parses full and minimal forms', () => {
    const r = parseConvertJobForm(fd({ ...base, description: 'deck', scheduled_date: '2026-08-01T10:00', price: '300', cleaner_amount: '120' }));
    expect(r).toEqual({ ok: true, value: { dot_id: 7, name: 'Jane', phone: null, address: '12 Oak St', service: 'Window Cleaning', description: 'deck', scheduled_date: '2026-08-01T10:00', price: 300, cleaner_amount: 120 } });
    const min = parseConvertJobForm(fd(base));
    expect(min.ok && min.value.scheduled_date).toBe(null);
    expect(min.ok && min.value.price).toBe(null);
  });
  it('rejects malformed date and negative money', () => {
    expect(parseConvertJobForm(fd({ ...base, scheduled_date: 'tomorrow' })).ok).toBe(false);
    expect(parseConvertJobForm(fd({ ...base, price: '-5' })).ok).toBe(false);
  });
});
