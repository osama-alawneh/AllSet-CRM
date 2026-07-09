import { describe, it, expect } from 'vitest';
import { monthKey, leaderboard, type EarningRow } from '@/lib/earnings';

describe('monthKey', () => {
  it('extracts YYYY-MM from the ISO timestamp (UTC string-slice, same convention as dayTime)', () => {
    expect(monthKey('2026-07-08T14:30:00+00:00')).toBe('2026-07');
  });
});

describe('leaderboard', () => {
  const rows: EarningRow[] = [
    { cleaner_id: 'u-1', job_id: 1, done_at: '2026-07-01T00:00:00+00:00', share: 30 },
    { cleaner_id: 'u-1', job_id: 2, done_at: '2026-07-05T00:00:00+00:00', share: 50 },
    { cleaner_id: 'u-2', job_id: 3, done_at: '2026-07-06T00:00:00+00:00', share: 50 },
    { cleaner_id: 'u-3', job_id: 4, done_at: '2026-06-15T00:00:00+00:00', share: 999 },
  ];
  const names = new Map<string, string>([['u-1', 'Dylan Cruz'], ['u-2', 'Cal Cleaner']]);

  it('sums shares and counts distinct jobs per cleaner, sorted by earnings desc', () => {
    const out = leaderboard(rows, names, '2026-07');
    expect(out).toEqual([
      { cleaner_id: 'u-1', name: 'Dylan Cruz', jobsDone: 2, earnings: 80 },
      { cleaner_id: 'u-2', name: 'Cal Cleaner', jobsDone: 1, earnings: 50 },
    ]);
  });
  it('drops out-of-month rows entirely when a month filter is given', () => {
    const out = leaderboard(rows, names, '2026-07');
    expect(out.find(r => r.cleaner_id === 'u-3')).toBeUndefined();
  });
  it('falls back to — for an unknown cleaner name', () => {
    const out = leaderboard(rows, names); // no month filter -> includes u-3
    expect(out.find(r => r.cleaner_id === 'u-3')?.name).toBe('—');
  });
});
