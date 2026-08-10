import { describe, it, expect } from 'vitest';
import {
  resolveMonth, addMonths, monthLabel, monthGrid, bucketByDay,
} from '@/lib/calendar';
import type { Job } from '@/lib/jobs';
import type { Lead } from '@/lib/leads';

describe('resolveMonth', () => {
  const now = '2026-07-14T12:00:00Z';
  it('passes a valid ?m= through', () => expect(resolveMonth('2026-03', now)).toBe('2026-03'));
  it.each([undefined, '', 'garbage', '2026-13', '2026-00', '26-01'])('falls back to the current month for %j', m => {
    expect(resolveMonth(m as string | undefined, now)).toBe('2026-07');
  });
});

describe('addMonths', () => {
  it('steps forward and back across year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-07', 0)).toBe('2026-07');
  });
});

describe('monthLabel', () => {
  it('renders a human month', () => expect(monthLabel('2026-07')).toBe('July 2026'));
});

describe('monthGrid', () => {
  it('lists every day and the leading weekday blanks (Sunday start)', () => {
    const g = monthGrid('2026-07'); // 2026-07-01 is a Wednesday
    expect(g.days).toHaveLength(31);
    expect(g.days[0]).toBe('2026-07-01');
    expect(g.days[30]).toBe('2026-07-31');
    expect(g.leadingBlanks).toBe(3);
  });
  it('handles leap February', () => {
    expect(monthGrid('2028-02').days).toHaveLength(29);
  });
});

describe('bucketByDay', () => {
  const job = (id: number, sched: string | null): Job => ({
    id, customer_id: 1, lead_id: null, status: 'unclaimed', claimed_by: null,
    scheduled_date: sched, service: 'Window Cleaning', description: null,
    created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    customer_name: `Cust ${id}`, address: null, phone: null, email: null,
    price: null, claimed_by_name: null, cleaner_amount: null, done_at: null,
    recur_days: null, recur_parent_id: null,
  } as unknown as Job);
  const lead = (id: number, created: string): Lead => ({
    id, customer_id: 1, status: 'new', service: null, description: null,
    stories: null, panes: null, note: null, quote_value: null,
    created_at: created, updated_at: created, customer_name: `Lead ${id}`,
    address: null, phone: null, email: null, lat: null, lng: null,
    rep_id: null, rep_name: null,
  });
  it('buckets jobs by scheduled day and leads by created day, with colors', () => {
    const map = bucketByDay(
      [job(1, '2026-07-14T09:00:00Z'), job(2, null)],
      [lead(9, '2026-07-14T20:00:00Z'), lead(10, '2026-07-02T00:00:00Z')]
    );
    const d14 = map.get('2026-07-14')!;
    expect(d14).toHaveLength(2);
    expect(d14[0]).toMatchObject({ kind: 'job', id: 1, label: 'Cust 1' });
    expect(d14[0].color).toBe('var(--new)'); // unclaimed token from jobStatusColor (lib/jobs.ts:11)
    expect(d14[1]).toMatchObject({ kind: 'lead', id: 9, color: 'var(--new)' });
    expect(map.get('2026-07-02')![0].id).toBe(10);
    expect([...map.values()].flat().some(e => e.kind === 'job' && e.id === 2)).toBe(false); // unscheduled absent
  });
  it('passes claimed job color through jobStatusColor', () => {
    const j = { ...job(3, '2026-07-05T00:00:00Z'), status: 'claimed' } as Job;
    const map = bucketByDay([j], []);
    expect(map.get('2026-07-05')![0].color).toBe('var(--sched)');
  });
  it('buckets leads only when the jobs side is empty', () => {
    const map = bucketByDay([], [lead(9, '2026-07-14T20:00:00Z')]);
    expect(map.get('2026-07-14')).toEqual([
      { kind: 'lead', id: 9, label: 'Lead 9', color: 'var(--new)' },
    ]);
  });
  it('buckets jobs only when the leads side is empty', () => {
    const map = bucketByDay([job(1, '2026-07-14T09:00:00Z')], []);
    expect(map.get('2026-07-14')!.every(e => e.kind === 'job')).toBe(true);
  });
});
