import { describe, it, expect } from 'vitest';
import { buildMapPins, pinColor, pinKey, type MapPin } from '@/lib/mapPins';
import type { Lead } from '@/lib/leads';
import type { Job } from '@/lib/jobs';

const lead = (over: Partial<Lead>): Lead => ({
  id: 1, customer_id: 10, status: 'new', service: null, description: null,
  stories: null, panes: null, note: null, quote_value: null,
  created_at: '2026-01-01', updated_at: '2026-01-01',
  customer_name: 'Ann', address: null, phone: null, email: null,
  lat: 41.66, lng: -91.53, rep_id: null, rep_name: null, ...over,
});

const job = (over: Partial<Job>): Job => ({
  id: 1, customer_id: 10, lead_id: null, status: 'unclaimed',
  claimed_by: null, claimed_by_name: null, scheduled_date: null,
  service: null, description: null, price: null,
  cleaner_amount: null, done_at: null,
  created_at: '2026-01-01', updated_at: '2026-01-01',
  customer_name: 'Ann', address: null, phone: null, email: null, ...over,
});

const geo = new Map([[10, { lat: 41.66, lng: -91.53 }], [11, { lat: null, lng: null }]]);

describe('buildMapPins', () => {
  it('excludes lost leads and done jobs', () => {
    const pins = buildMapPins(
      [lead({ id: 1 }), lead({ id: 2, status: 'lost' })],
      [job({ id: 1 }), job({ id: 2, status: 'done' })],
      geo,
    );
    expect(pins).toHaveLength(2);
    expect(pins.find(p => p.kind === 'lead')?.id).toBe(1);
    expect(pins.find(p => p.kind === 'job')?.id).toBe(1);
  });

  it('skips leads without coords and jobs whose customer has no coords', () => {
    const pins = buildMapPins(
      [lead({ id: 1, lat: null, lng: null })],
      [job({ id: 1, customer_id: 11 }), job({ id: 2, customer_id: 99 })],
      geo,
    );
    expect(pins).toHaveLength(0);
  });

  it('builds labels: lead "name — Status", job "name — Job: Status"', () => {
    const pins = buildMapPins([lead({ status: 'follow' })], [job({ status: 'in_progress' })], geo);
    expect(pins[0].label).toBe('Ann — Follow-up');
    expect(pins[1].label).toBe('Ann — Job: In progress');
  });

  it('takes job coords from the customer geo map', () => {
    const pins = buildMapPins([], [job({})], geo);
    expect(pins[0].lat).toBe(41.66);
    expect(pins[0].lng).toBe(-91.53);
  });
});

describe('pinColor / pinKey', () => {
  const lp: MapPin = { kind: 'lead', id: 3, lat: 0, lng: 0, status: 'won', label: '' };
  const jp: MapPin = { kind: 'job', id: 3, lat: 0, lng: 0, status: 'claimed', label: '' };
  it('maps lead pins to lead status colors and job pins to job status colors', () => {
    expect(pinColor(lp)).toBe('var(--won)');
    expect(pinColor(jp)).toBe('var(--sched)');
  });
  it('produces distinct keys for same-id lead and job', () => {
    expect(pinKey(lp)).toBe('lead-3');
    expect(pinKey(jp)).toBe('job-3');
    expect(pinKey(lp)).not.toBe(pinKey(jp));
  });
});
