import type { Job } from '@/lib/jobs';
import { jobStatusColor } from '@/lib/jobs';
import type { Lead } from '@/lib/leads';
import { statusColor } from '@/lib/leads';

// Month math on 'YYYY-MM' strings; day bucketing on the app-wide slice(0,10)
// string convention (lib/dashboard.ts) — timestamps are compared as UTC ISO
// strings end to end, no Date-local parsing anywhere.

export type CalEntry = { kind: 'job' | 'lead'; id: number; label: string; color: string };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function resolveMonth(m: string | undefined, now: Date | string): string {
  if (m && MONTH_RE.test(m)) return m;
  const iso = typeof now === 'string' ? now : now.toISOString();
  return iso.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, mo] = month.split('-').map(Number);
  const idx = y * 12 + (mo - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12 + 12) % 12 + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthLabel(month: string): string {
  const [y, mo] = month.split('-').map(Number);
  return `${MONTH_NAMES[mo - 1]} ${y}`;
}

export function monthGrid(month: string): { days: string[]; leadingBlanks: number } {
  const [y, mo] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // day 0 of next month = last day of this
  const days = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const leadingBlanks = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(); // 0 = Sunday
  return { days, leadingBlanks };
}

export function bucketByDay(jobs: Job[], leads: Lead[]): Map<string, CalEntry[]> {
  const map = new Map<string, CalEntry[]>();
  const push = (day: string, e: CalEntry) => {
    const list = map.get(day);
    if (list) list.push(e); else map.set(day, [e]);
  };
  for (const j of jobs) {
    if (j.scheduled_date == null) continue; // board covers unscheduled
    push(j.scheduled_date.slice(0, 10), {
      kind: 'job', id: j.id, label: j.customer_name, color: jobStatusColor[j.status],
    });
  }
  for (const l of leads) {
    push(l.created_at.slice(0, 10), {
      kind: 'lead', id: l.id, label: l.customer_name, color: statusColor[l.status],
    });
  }
  return map;
}
