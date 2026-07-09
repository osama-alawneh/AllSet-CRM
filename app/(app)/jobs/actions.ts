'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { JOB_STATUSES, parseJobForm, type JobStatus } from '@/lib/jobs';

// First-claim-wins is enforced atomically inside claim_job (0009): the loser's UPDATE
// matches no row and the RPC raises 'Job already claimed', surfaced here as {error}.
export async function claimJob(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('claim_job', { p_job_id: id });
  if (error) return { error: error.message };
  revalidatePath('/jobs');
  revalidatePath('/dashboard');
  return {};
}

// Multi-cleaner join requests (0023/0024): a cleaner asks to join an already-claimed job's
// pot, an admin/owner approves or rejects. Both route through SECURITY DEFINER RPCs and
// mirror claimJob's shape exactly — same client, same error-string return.
export async function requestJoin(jobId: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('request_join', { p_job_id: jobId });
  if (error) return { error: error.message };
  revalidatePath('/jobs');
  revalidatePath('/map');
  return {};
}

export async function decideJoin(memberId: number, approve: boolean): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('decide_join', { p_member_id: memberId, p_approve: approve });
  if (error) return { error: error.message };
  revalidatePath('/jobs');
  revalidatePath('/map');
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
  revalidatePath('/dashboard');
  revalidatePath('/expenses'); // payout rows (source: job_payout) track job status (0026)
  return {};
}

// CRUD routes through the SECURITY DEFINER RPCs (0014): admin-only, money (price) enforced
// both here (parser keeps it out for non-admins) and in the DB.
export async function createJob(fd: FormData): Promise<{ error?: string }> {
  const parsed = parseJobForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('create_job', {
    p_customer_id: v.customer_id, p_service: v.service, p_description: v.description,
    p_scheduled_date: v.scheduled_date, p_price: v.price, p_cleaner_amount: v.cleaner_amount,
    p_recur_days: v.recur_days,
  });
  if (error) return { error: error.message };
  revalidatePath('/jobs'); revalidatePath('/dashboard'); revalidatePath('/customers');
  redirect(`/jobs?j=${data}`);
}

export async function updateJob(id: number, fd: FormData): Promise<{ error?: string }> {
  const parsed = parseJobForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const sb = await supabaseServer();
  const { error } = await sb.rpc('update_job', {
    p_job_id: id, p_service: v.service, p_description: v.description,
    p_scheduled_date: v.scheduled_date, p_price: v.price, p_cleaner_amount: v.cleaner_amount,
    p_recur_days: v.recur_days,
  });
  if (error) return { error: error.message };
  revalidatePath('/jobs'); revalidatePath('/dashboard'); revalidatePath('/customers');
  return {};
}

// 0020: soft delete — delete_job now flips jobs.deleted_at instead of removing the row, so
// the job survives in History and can be brought back with restoreJob below.
export async function deleteJob(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('delete_job', { p_job_id: id });
  if (error) return { error: error.message };
  revalidatePath('/jobs'); revalidatePath('/dashboard'); revalidatePath('/customers'); revalidatePath('/invoices');
  return {};
}

// Admin-only History view restore (0020): mirrors deleteJob's pattern. restore_job raises
// for non-admins and for an already-active job, surfaced here as {error}.
export async function restoreJob(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('restore_job', { p_job_id: id });
  if (error) return { error: error.message };
  revalidatePath('/jobs'); revalidatePath('/dashboard'); revalidatePath('/customers'); revalidatePath('/invoices');
  return {};
}
