'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';

// Mirrors app/(app)/jobs/actions.ts's pattern: same client, same error-string return. The
// add_expense/delete_expense RPCs (0024) are SECURITY DEFINER and enforce role + source
// ('manual' vs 'job_payout') guards server-side regardless of what the client sends.
export async function addExpense(fd: FormData): Promise<{ error?: string }> {
  const label = String(fd.get('label') ?? '').trim();
  if (!label) return { error: 'Label is required' };
  const amount = Number(fd.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be positive' };
  const spentOnRaw = String(fd.get('spent_on') ?? '').trim();
  const spent_on = spentOnRaw || null;
  const jobRaw = String(fd.get('job_id') ?? '').trim();
  const job_id = jobRaw === '' ? null : Number(jobRaw);
  const sb = await supabaseServer();
  const { error } = await sb.rpc('add_expense', {
    p_label: label, p_amount: amount, p_spent_on: spent_on, p_job_id: job_id,
  });
  if (error) return { error: error.message };
  revalidatePath('/expenses');
  revalidatePath('/dashboard');
  return {};
}

export async function deleteExpense(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('delete_expense', { p_id: id });
  if (error) return { error: error.message };
  revalidatePath('/expenses');
  revalidatePath('/dashboard');
  return {};
}
