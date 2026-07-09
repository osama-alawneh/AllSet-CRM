import type { Role } from '@/lib/auth';

export type JobStatus = 'unclaimed' | 'claimed' | 'in_progress' | 'done';

export const JOB_STATUSES: JobStatus[] = ['unclaimed', 'claimed', 'in_progress', 'done'];

export const jobStatusLabel: Record<JobStatus, string> = {
  unclaimed: 'Unclaimed', claimed: 'Claimed', in_progress: 'In progress', done: 'Done',
};
export const jobStatusColor: Record<JobStatus, string> = {
  unclaimed: 'var(--new)', claimed: 'var(--sched)', in_progress: 'var(--prog)', done: 'var(--done)',
};

export type Job = {
  id: number;
  customer_id: number;
  lead_id: number | null;
  status: JobStatus;
  claimed_by: string | null;        // uuid of the claimer (or null)
  claimed_by_name: string | null;   // resolved full name (or null)
  scheduled_date: string | null;
  service: string | null;
  description: string | null;
  price: number | null;             // null = not visible (non-admin) or unset — admin-only
  cleaner_amount: number | null;    // the job "pot" — visible to cleaners, unlike price
  done_at: string | null;           // set when the job lands in 'done' — base-table only
  recur_days: number | null;        // repeat interval in days — base-table only (0027), admin/rep-only
  recur_parent_id: number | null;   // the job this one was auto-spawned from — base-table only (0027)
  created_at: string;
  updated_at: string;
  customer_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

// DB shapes the page fetches: jobs_public view (non-admin) / base jobs projection (admin),
// plus a slim customers projection. cleaner_amount/done_at are optional here because not
// every query selects them (e.g. jobs_public has cleaner_amount but not done_at) — buildJobs
// below null-defaults whichever is missing from a given row.
export type JobRow = {
  id: number;
  customer_id: number;
  lead_id: number | null;
  status: JobStatus;
  claimed_by: string | null;
  scheduled_date: string | null;
  service: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  cleaner_amount?: number | null;
  done_at?: string | null;
  recur_days?: number | null;
  recur_parent_id?: number | null;
};
export type JobCustomer = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export function buildJobs(
  rows: JobRow[],
  customers: JobCustomer[],
  priceById: Map<number, number> | null,
  names: Map<string, string>
): Job[] {
  const byId = new Map(customers.map(c => [c.id, c]));
  return rows.map(r => {
    const c = byId.get(r.customer_id);
    return {
      id: r.id,
      customer_id: r.customer_id,
      lead_id: r.lead_id,
      status: r.status,
      claimed_by: r.claimed_by,
      claimed_by_name: r.claimed_by ? (names.get(r.claimed_by) ?? null) : null,
      scheduled_date: r.scheduled_date,
      service: r.service,
      description: r.description,
      price: priceById ? (priceById.get(r.id) ?? null) : null,
      cleaner_amount: r.cleaner_amount ?? null,
      done_at: r.done_at ?? null,
      recur_days: r.recur_days ?? null,
      recur_parent_id: r.recur_parent_id ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      customer_name: c?.name ?? 'Unknown',
      address: c?.address ?? null,
      phone: c?.phone ?? null,
      email: c?.email ?? null,
    };
  });
}

export function groupJobsByStatus(jobs: Job[]): Record<JobStatus, Job[]> {
  const out: Record<JobStatus, Job[]> = { unclaimed: [], claimed: [], in_progress: [], done: [] };
  for (const j of jobs) out[j.status].push(j);
  return out;
}

// Owner decision 2026-07-09: every role sees all non-deleted jobs (soft-deleted rows are
// already filtered upstream by jobs_public / the admin query). Cleaners view foreign
// claimed jobs read-only — the interaction gating (claim/drag/join) lives in canTransition,
// JobColumn, and JobDrawer, not here. Kept as the seam so callers stay stable if the
// visibility rule ever narrows again.
export function visibleJobs(_role: Role | null, _uid: string, jobs: Job[]): Job[] {
  return jobs;
}

// Single source of truth for drag affordances — mirrors the set_job_status RPC rules,
// plus the unclaimed -> claimed drag-claim rule below (routed through claim_job, not
// set_job_status, to preserve first-claim-wins).
export function canTransition(role: Role | null, uid: string, job: Job, to: JobStatus): boolean {
  if (to === job.status) return false;
  // Drag-to-claim (owner 2026-07-09): dropping an unclaimed job on Claimed is a CLAIM
  // for cleaners AND admins (admin does field work too) — the board routes it through
  // the race-safe claimJob action, never set_job_status. Reps stay view-only here.
  if (job.status === 'unclaimed' && to === 'claimed') return role === 'admin' || role === 'cleaner';
  if (role === 'admin') return true;
  if (role === 'cleaner') {
    if (job.claimed_by !== uid) return false; // only own jobs
    if (to === 'unclaimed') return false;      // cleaner may not unclaim
    return true;                               // claimed/in_progress/done
  }
  return false; // rep / roleless: view-only
}

// scheduled_date is timestamptz (0018): jobs carry a time, not just a day. Renders the date
// alone when the time is exactly midnight — migrated rows and bare-date entries alike — so
// they don't all show a misleading "00:00". String-sliced (not Date-parsed), matching the
// existing day() convention elsewhere: no client-timezone conversion of a server-stamped value.
export function dayTime(s: string): string {
  const date = s.slice(0, 10);
  const time = s.slice(11, 16);
  if (!time || time === '00:00') return date;
  const [hh, mm] = time.split(':');
  const h = Number(hh);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${date} ${h12}:${mm} ${period}`;
}

export type JobInput = {
  customer_id: number; service: string; description: string | null;
  scheduled_date: string | null; price: number | null; cleaner_amount: number | null;
  recur_days: number;
};

export function parseJobForm(
  fd: FormData
): { ok: true; value: JobInput } | { ok: false; error: string } {
  const customer_id = Number(fd.get('customer_id'));
  if (!Number.isFinite(customer_id) || customer_id <= 0) return { ok: false, error: 'Customer is required' };
  const service = String(fd.get('service') ?? '').trim();
  if (!service) return { ok: false, error: 'Service is required' };
  const description = String(fd.get('description') ?? '').trim() || null;
  const dateRaw = String(fd.get('scheduled_date') ?? '').trim();
  if (dateRaw && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(dateRaw)) return { ok: false, error: 'Date must be YYYY-MM-DD or YYYY-MM-DDTHH:MM' };
  const priceRaw = String(fd.get('price') ?? '').trim();
  const price = priceRaw === '' ? null : Number(priceRaw);
  if (price !== null && !Number.isFinite(price)) return { ok: false, error: 'Invalid number' };
  if (price !== null && price < 0) return { ok: false, error: 'Numbers cannot be negative' };
  const cleanerAmountRaw = String(fd.get('cleaner_amount') ?? '').trim();
  const cleaner_amount = cleanerAmountRaw === '' ? null : Number(cleanerAmountRaw);
  if (cleaner_amount !== null && !Number.isFinite(cleaner_amount)) return { ok: false, error: 'Invalid number' };
  if (cleaner_amount !== null && cleaner_amount < 0) return { ok: false, error: 'Numbers cannot be negative' };
  // blank -> 0 mirrors blankMoneyToZero's clear convention (lib/forms.ts): 0 is "clear" at
  // the create_job/update_job RPCs (0027), not "leave unchanged" — same form-boundary idiom.
  const recurDaysRaw = String(fd.get('recur_days') ?? '').trim();
  const recur_days = recurDaysRaw === '' ? 0 : Number(recurDaysRaw);
  if (!Number.isInteger(recur_days) || recur_days < 0) return { ok: false, error: 'Repeat days must be a whole number' };
  return { ok: true, value: { customer_id, service, description, scheduled_date: dateRaw || null, price, cleaner_amount, recur_days } };
}

export type JobMember = {
  id: number; job_id: number; cleaner_id: string; cleaner_name: string;
  status: 'pending' | 'approved' | 'rejected'; is_owner: boolean;
};

export function buildMembers(
  rows: Array<Omit<JobMember, 'cleaner_name'>>,
  names: Map<string, string>,
): JobMember[] {
  return rows.map(r => ({ ...r, cleaner_name: names.get(r.cleaner_id) ?? '—' }));
}

// The DB view cleaner_earnings owns the REAL split; this mirrors it for drawer display only.
export function shareOf(pot: number | null, approvedCount: number): number | null {
  if (pot == null || pot <= 0 || approvedCount <= 0) return null;
  return pot / approvedCount;
}
