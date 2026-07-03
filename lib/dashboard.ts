// Pure dashboard metrics. All date logic is YYYY-MM-DD string comparison, normalized through
// UTC so there is no timezone drift. Revenue is attributed by invoices.issue_date — there is
// NO paid_at column and one must NOT be added.

export type RevenueInvoice = { status: string; issue_date: string; total: number };
export type WeekJob = { scheduled_date: string | null };
export type WinLead = { status: string };

function toYMD(now: Date | string): string {
  return (typeof now === 'string' ? now : now.toISOString()).slice(0, 10);
}
function addDaysYMD(ymd: string, days: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
}

// Sum of paid invoices issued in the same calendar month as `now`.
export function revenueMTD(invoices: RevenueInvoice[], now: Date | string): number {
  const month = toYMD(now).slice(0, 7); // YYYY-MM
  return invoices
    .filter(i => i.status === 'paid' && i.issue_date.slice(0, 7) === month)
    .reduce((s, i) => s + i.total, 0);
}

// A 'sent' invoice is overdue when it was issued strictly more than 30 days before `now`.
export function isOverdue(inv: RevenueInvoice, now: Date | string): boolean {
  if (inv.status !== 'sent') return false;
  const cutoff = addDaysYMD(toYMD(now), -30);
  return inv.issue_date.slice(0, 10) < cutoff;
}

export function overdueTotal(invoices: RevenueInvoice[], now: Date | string): number {
  return invoices.filter(i => isOverdue(i, now)).reduce((s, i) => s + i.total, 0);
}

// 14 daily paid-revenue totals for the window ending today: index 0 = 13 days ago, 13 = today.
export function chartBuckets14d(invoices: RevenueInvoice[], now: Date | string): number[] {
  const today = toYMD(now);
  const idx = new Map<string, number>();
  for (let i = 0; i < 14; i++) idx.set(addDaysYMD(today, i - 13), i);
  const out = new Array(14).fill(0);
  for (const inv of invoices) {
    if (inv.status !== 'paid') continue;
    const i = idx.get(inv.issue_date.slice(0, 10));
    if (i !== undefined) out[i] += inv.total;
  }
  return out;
}

// Jobs scheduled in the trailing 7-day window [now-6, now] (inclusive). Unscheduled jobs
// (null scheduled_date) do not count.
export function jobsThisWeek(jobs: WeekJob[], now: Date | string): number {
  const today = toYMD(now);
  const start = addDaysYMD(today, -6);
  return jobs.filter(
    j => j.scheduled_date != null && j.scheduled_date.slice(0, 10) >= start && j.scheduled_date.slice(0, 10) <= today
  ).length;
}

// won / (won + lost); 0 when the denominator is 0 (convention: no decided leads → 0%).
export function winRate(leads: WinLead[]): number {
  const won = leads.filter(l => l.status === 'won').length;
  const lost = leads.filter(l => l.status === 'lost').length;
  const denom = won + lost;
  return denom === 0 ? 0 : won / denom;
}
