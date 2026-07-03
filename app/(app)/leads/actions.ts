'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { LEAD_STATUSES, type LeadStatus } from '@/lib/leads';

// Reps cannot SELECT the base leads table (RLS admin-only for select), so we must NOT
// chain .select(): supabase-js default return=minimal succeeds, and count from the
// Content-Range header confirms a row actually matched the update policy.
export async function setLeadStatus(id: number, status: LeadStatus): Promise<{ error?: string }> {
  if (!LEAD_STATUSES.includes(status)) return { error: 'Invalid status' };
  const sb = await supabaseServer();
  const { count, error } = await sb.from('leads').update({ status }, { count: 'exact' }).eq('id', id);
  if (error) return { error: error.message };
  if (!count) return { error: 'Status change failed: not permitted or lead missing' };
  revalidatePath('/leads');
  revalidatePath('/map');
  return {};
}
