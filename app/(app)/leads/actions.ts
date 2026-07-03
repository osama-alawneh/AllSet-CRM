'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { LEAD_STATUSES, type LeadStatus } from '@/lib/leads';

// Reps cannot SELECT the base leads table (RLS admin-only for select, to protect
// quote_value), so a plain .update().eq() can never match a row for them: Postgres
// requires SELECT-visibility to evaluate UPDATE ... WHERE, regardless of the update
// policy. Route through the set_lead_status SECURITY DEFINER RPC (0007) instead,
// which performs the update under definer rights and raises on 0 rows affected.
export async function setLeadStatus(id: number, status: LeadStatus): Promise<{ error?: string }> {
  if (!LEAD_STATUSES.includes(status)) return { error: 'Invalid status' };
  const sb = await supabaseServer();
  const { error } = await sb.rpc('set_lead_status', { p_lead_id: id, p_status: status });
  if (error) return { error: error.message };
  revalidatePath('/leads');
  revalidatePath('/map');
  return {};
}
