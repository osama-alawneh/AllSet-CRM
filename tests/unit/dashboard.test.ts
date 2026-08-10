import { describe, it, expect } from 'vitest';
import {
  revenueMTD,
  isOverdue,
  overdueTotal,
  chartBuckets14d,
  jobsThisWeek,
  winRate,
  type RevenueInvoice,
} from '@/lib/dashboard';

const now = '2026-07-02';

describe('revenueMTD', () => {
  const inv: RevenueInvoice[] = [
    { status: 'paid', issue_date: '2026-07-01', total: 100 },
    { status: 'paid', issue_date: '2026-07-31', total: 50 },  // same month, later day
    { status: 'paid', issue_date: '2026-06-30', total: 999 }, // previous month → excluded
    { status: 'sent', issue_date: '2026-07-02', total: 40 },  // not paid → excluded
  ];
  it('sums paid invoices issued in the now-month only', () => {
    expect(revenueMTD(inv, now)).toBe(150);
  });
  it('is 0 when nothing is paid this month', () => {
    expect(revenueMTD([{ status: 'paid', issue_date: '2026-06-01', total: 100 }], now)).toBe(0);
  });
});

describe('isOverdue / overdueTotal (sent > 30d by issue_date)', () => {
  it('is overdue strictly older than 30 days', () => {
    // now = 2026-07-02 → cutoff = 2026-06-02. Older than cutoff = overdue.
    expect(isOverdue({ status: 'sent', issue_date: '2026-05-28', total: 10 }, now)).toBe(true);
    expect(isOverdue({ status: 'sent', issue_date: '2026-06-25', total: 10 }, now)).toBe(false);
  });
  it('the 30-day boundary itself is NOT overdue', () => {
    expect(isOverdue({ status: 'sent', issue_date: '2026-06-02', total: 10 }, now)).toBe(false);
  });
  it('only sent invoices count', () => {
    expect(isOverdue({ status: 'paid', issue_date: '2026-01-01', total: 10 }, now)).toBe(false);
    expect(isOverdue({ status: 'draft', issue_date: '2026-01-01', total: 10 }, now)).toBe(false);
  });
  it('sums overdue totals', () => {
    const inv: RevenueInvoice[] = [
      { status: 'sent', issue_date: '2026-05-28', total: 165 },
      { status: 'sent', issue_date: '2026-06-25', total: 210 }, // not overdue
      { status: 'paid', issue_date: '2026-01-01', total: 999 }, // not sent
    ];
    expect(overdueTotal(inv, now)).toBe(165);
  });
});

describe('chartBuckets14d', () => {
  it('returns 14 daily paid totals with index 13 = today', () => {
    const inv: RevenueInvoice[] = [
      { status: 'paid', issue_date: '2026-07-02', total: 25 }, // today → index 13
      { status: 'paid', issue_date: '2026-06-19', total: 10 }, // 13 days ago → index 0
      { status: 'paid', issue_date: '2026-06-18', total: 99 }, // out of window (14 days ago)
      { status: 'sent', issue_date: '2026-07-02', total: 40 }, // not paid → ignored
    ];
    const out = chartBuckets14d(inv, now);
    expect(out).toHaveLength(14);
    expect(out[13]).toBe(25);
    expect(out[0]).toBe(10);
    expect(out.reduce((s, n) => s + n, 0)).toBe(35); // 99 excluded, 40 excluded
  });
  it('buckets correctly across a month boundary', () => {
    // now = 2026-03-05 → window 2026-02-20 … 2026-03-05
    const inv: RevenueInvoice[] = [
      { status: 'paid', issue_date: '2026-02-28', total: 7 },
      { status: 'paid', issue_date: '2026-03-01', total: 3 },
    ];
    const out = chartBuckets14d(inv, '2026-03-05');
    expect(out[8]).toBe(7);  // 2026-02-28 is 5 days before today's index 13 → 13-5=8
    expect(out[9]).toBe(3);  // 2026-03-01
    expect(out.reduce((s, n) => s + n, 0)).toBe(10);
  });
});

describe('jobsThisWeek', () => {
  it('counts jobs scheduled in the trailing 7-day window (inclusive)', () => {
    // now = 2026-07-02 → window 2026-06-26 … 2026-07-02
    const jobs = [
      { scheduled_date: '2026-07-02' }, // in
      { scheduled_date: '2026-06-26' }, // in (boundary)
      { scheduled_date: '2026-06-25' }, // out (too old)
      { scheduled_date: '2026-07-03' }, // out (future)
      { scheduled_date: null },         // out (unscheduled)
    ];
    expect(jobsThisWeek(jobs, now)).toBe(2);
  });
});

describe('winRate', () => {
  it('divides won by won+lost when there are no No-dots', () => {
    expect(winRate([{ status: 'won' }, { status: 'won' }, { status: 'lost' }, { status: 'follow' }], 0)).toBeCloseTo(2 / 3);
  });
  it('No-dots widen the denominator (doors that said no are losses)', () => {
    expect(winRate([{ status: 'won' }, { status: 'lost' }], 2)).toBeCloseTo(1 / 4);
  });
  it('No-dots alone still yield 0 (nothing won)', () => {
    expect(winRate([], 3)).toBe(0);
  });
  it('returns 0 with no decided leads and no dots', () => {
    expect(winRate([{ status: 'new' }, { status: 'follow' }], 0)).toBe(0);
    expect(winRate([], 0)).toBe(0);
  });
});
