import { describe, it, expect } from 'vitest';
import {
  JOB_STATUSES,
  jobStatusLabel,
  jobStatusColor,
  buildJobs,
  groupJobsByStatus,
  visibleJobs,
  canTransition,
  dayTime,
  type Job,
  type JobRow,
  type JobCustomer,
} from '@/lib/jobs';

const job = (over: Partial<Job>): Job => ({
  id: 1, customer_id: 1, lead_id: 5, status: 'unclaimed', claimed_by: null,
  claimed_by_name: null, scheduled_date: null, service: 'In + out', description: null, price: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  customer_name: 'X', address: null, phone: null, email: null, ...over,
});

describe('status maps', () => {
  it('lists the four job statuses in board order', () => {
    expect(JOB_STATUSES).toEqual(['unclaimed', 'claimed', 'in_progress', 'done']);
  });
  it('has a label and a CSS-var color for every status', () => {
    for (const s of JOB_STATUSES) {
      expect(jobStatusLabel[s]).toBeTruthy();
      expect(jobStatusColor[s]).toMatch(/^var\(--/);
    }
    expect(jobStatusColor.unclaimed).toBe('var(--new)');
    expect(jobStatusColor.claimed).toBe('var(--sched)');
    expect(jobStatusColor.in_progress).toBe('var(--prog)');
    expect(jobStatusColor.done).toBe('var(--done)');
  });
});

describe('buildJobs', () => {
  const rows: JobRow[] = [
    { id: 10, customer_id: 1, lead_id: 5, status: 'claimed', claimed_by: 'u-1', scheduled_date: '2026-07-03', service: 'In + out', description: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
    { id: 11, customer_id: 2, lead_id: null, status: 'unclaimed', claimed_by: null, scheduled_date: null, service: null, description: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
  ];
  const customers: JobCustomer[] = [
    { id: 1, name: 'Sarah Kim', address: '142 Maple Ave', phone: '555-0142', email: 's@k.io' },
  ];
  const names = new Map<string, string>([['u-1', 'Dylan Cruz']]);

  it('joins customer fields and resolves the claimer name', () => {
    const out = buildJobs(rows, customers, null, names);
    expect(out[0].customer_name).toBe('Sarah Kim');
    expect(out[0].address).toBe('142 Maple Ave');
    expect(out[0].claimed_by_name).toBe('Dylan Cruz');
    expect(out[1].customer_name).toBe('Unknown'); // customer 2 absent
    expect(out[1].claimed_by_name).toBeNull();
  });
  it('exposes price only when a price map is supplied (admin)', () => {
    const p = new Map<number, number>([[10, 180]]);
    const admin = buildJobs(rows, customers, p, names);
    expect(admin[0].price).toBe(180);
    expect(admin[1].price).toBeNull();
    const nonAdmin = buildJobs(rows, customers, null, names);
    expect(nonAdmin[0].price).toBeNull();
  });
});

describe('groupJobsByStatus', () => {
  it('buckets jobs and always returns all four keys', () => {
    const g = groupJobsByStatus([
      job({ id: 1, status: 'done' }),
      job({ id: 2, status: 'done' }),
      job({ id: 3, status: 'claimed' }),
    ]);
    expect(g.done.map(j => j.id)).toEqual([1, 2]);
    expect(g.claimed.map(j => j.id)).toEqual([3]);
    expect(g.unclaimed).toEqual([]);
    expect(g.in_progress).toEqual([]);
  });
});

describe('visibleJobs', () => {
  const jobs = [
    job({ id: 1, status: 'unclaimed', claimed_by: null }),
    job({ id: 2, status: 'claimed', claimed_by: 'me' }),
    job({ id: 3, status: 'in_progress', claimed_by: 'other' }),
  ];
  it('cleaner sees unclaimed + own only', () => {
    expect(visibleJobs('cleaner', 'me', jobs).map(j => j.id)).toEqual([1, 2]);
  });
  it('admin and rep see everything', () => {
    expect(visibleJobs('admin', 'me', jobs).map(j => j.id)).toEqual([1, 2, 3]);
    expect(visibleJobs('rep', 'me', jobs).map(j => j.id)).toEqual([1, 2, 3]);
  });
});

describe('dayTime', () => {
  it('appends HH:MM when the timestamp carries a non-midnight time', () => {
    expect(dayTime('2026-07-08T14:30:00+00:00')).toBe('2026-07-08 14:30');
  });
  it('renders date-only when the time is exactly midnight (migrated / bare-date rows)', () => {
    expect(dayTime('2026-07-08T00:00:00+00:00')).toBe('2026-07-08');
  });
  it('renders date-only for a bare YYYY-MM-DD value with no time component at all', () => {
    expect(dayTime('2026-07-08')).toBe('2026-07-08');
  });
});

describe('canTransition', () => {
  const unclaimed = job({ status: 'unclaimed', claimed_by: null });
  const mineClaimed = job({ status: 'claimed', claimed_by: 'me' });
  const theirsClaimed = job({ status: 'claimed', claimed_by: 'other' });

  it('never allows a no-op (to === current status)', () => {
    expect(canTransition('admin', 'me', mineClaimed, 'claimed')).toBe(false);
  });
  it('never allows dragging unclaimed -> claimed (claim button only) for anyone', () => {
    expect(canTransition('admin', 'me', unclaimed, 'claimed')).toBe(false);
    expect(canTransition('cleaner', 'me', unclaimed, 'claimed')).toBe(false);
  });
  it('admin may make any other transition, including unclaim', () => {
    expect(canTransition('admin', 'me', mineClaimed, 'in_progress')).toBe(true);
    expect(canTransition('admin', 'me', mineClaimed, 'unclaimed')).toBe(true);
    expect(canTransition('admin', 'me', unclaimed, 'in_progress')).toBe(true);
  });
  it('cleaner may advance only their own job and may not unclaim', () => {
    expect(canTransition('cleaner', 'me', mineClaimed, 'in_progress')).toBe(true);
    expect(canTransition('cleaner', 'me', mineClaimed, 'done')).toBe(true);
    expect(canTransition('cleaner', 'me', mineClaimed, 'unclaimed')).toBe(false); // cannot unclaim
    expect(canTransition('cleaner', 'me', theirsClaimed, 'in_progress')).toBe(false); // not owner
    expect(canTransition('cleaner', 'me', unclaimed, 'in_progress')).toBe(false); // not owner (null)
  });
  it('rep and roleless may never transition', () => {
    expect(canTransition('rep', 'me', mineClaimed, 'in_progress')).toBe(false);
    expect(canTransition('rep', 'me', unclaimed, 'claimed')).toBe(false);
    expect(canTransition(null, 'me', mineClaimed, 'done')).toBe(false);
  });
});
