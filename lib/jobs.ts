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
  created_at: string;
  updated_at: string;
  customer_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

// DB shapes the page fetches: jobs_public view (non-admin) / base jobs projection (admin),
// plus a slim customers projection.
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

// Cleaner sees only claimable + own jobs; admin/rep see everything.
export function visibleJobs(role: Role | null, uid: string, jobs: Job[]): Job[] {
  if (role === 'cleaner') return jobs.filter(j => j.status === 'unclaimed' || j.claimed_by === uid);
  return jobs;
}

// Single source of truth for drag affordances — mirrors the set_job_status RPC rules.
// unclaimed -> claimed is deliberately excluded (that is the Claim button's job, which
// routes through claim_job to preserve first-claim-wins).
export function canTransition(role: Role | null, uid: string, job: Job, to: JobStatus): boolean {
  if (to === job.status) return false;
  if (job.status === 'unclaimed' && to === 'claimed') return false;
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
  return time && time !== '00:00' ? `${date} ${time}` : date;
}

export type JobInput = {
  customer_id: number; service: string; description: string | null;
  scheduled_date: string | null; price: number | null;
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
  if (dateRaw && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(dateRaw)) return { ok: false, error: 'Date must be YYYY-MM-DD' };
  const priceRaw = String(fd.get('price') ?? '').trim();
  const price = priceRaw === '' ? null : Number(priceRaw);
  if (price !== null && !Number.isFinite(price)) return { ok: false, error: 'Invalid number' };
  if (price !== null && price < 0) return { ok: false, error: 'Numbers cannot be negative' };
  return { ok: true, value: { customer_id, service, description, scheduled_date: dateRaw || null, price } };
}
