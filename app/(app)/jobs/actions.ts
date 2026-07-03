'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { JOB_STATUSES, type JobStatus } from '@/lib/jobs';

// First-claim-wins is enforced atomically inside claim_job (0009): the loser's UPDATE
// matches no row and the RPC raises 'Job already claimed', surfaced here as {error}.
export async function claimJob(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('claim_job', { p_job_id: id });
  if (error) return { error: error.message };
  revalidatePath('/jobs');
  return {};
}

// Cleaners lack UPDATE/SELECT on base jobs, so route through the set_job_status definer
// RPC (0010), which enforces admin-any / cleaner-own and raises on 0 rows affected.
export async function setJobStatus(id: number, status: JobStatus): Promise<{ error?: string }> {
  if (!JOB_STATUSES.includes(status)) return { error: 'Invalid status' };
  const sb = await supabaseServer();
  const { error } = await sb.rpc('set_job_status', { p_job_id: id, p_status: status });
  if (error) return { error: error.message };
  revalidatePath('/jobs');
  return {};
}
