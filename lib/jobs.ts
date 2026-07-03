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
  price: number | null;             // null = not visible (non-admin) or unset — admin-only
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
      price: priceById ? (priceById.get(r.id) ?? null) : null,
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
