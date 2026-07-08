'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { LEAD_STATUSES, parseLeadForm, type LeadStatus } from '@/lib/leads';

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

// All three route through the SECURITY DEFINER CRUD RPCs (0014): reps cannot touch the
// base leads table directly (money columns), and the RPCs are where role rules live.
export async function createLead(fd: FormData): Promise<{ error?: string }> {
  const parsed = parseLeadForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('create_lead', {
    p_customer_id: v.customer_id, p_service: v.service, p_description: v.description,
    p_stories: v.stories, p_panes: v.panes, p_note: v.note, p_quote: v.quote,
  });
  if (error) return { error: error.message };
  revalidatePath('/leads'); revalidatePath('/map'); revalidatePath('/customers'); revalidatePath('/dashboard');
  redirect(`/leads?l=${data}`); // redirect() throws — do not wrap in try/catch
}

export async function updateLead(id: number, fd: FormData): Promise<{ error?: string }> {
  const parsed = parseLeadForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const sb = await supabaseServer();
  const { error } = await sb.rpc('update_lead', {
    p_lead_id: id, p_service: v.service, p_description: v.description,
    p_stories: v.stories, p_panes: v.panes, p_note: v.note, p_quote: v.quote,
  });
  if (error) return { error: error.message };
  revalidatePath('/leads'); revalidatePath('/map'); revalidatePath('/customers'); revalidatePath('/dashboard');
  return {};
}

// 0020: soft delete — delete_lead now flips leads.deleted_at instead of removing the row,
// so the lead survives in History and can be brought back with restoreLead below.
export async function deleteLead(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('delete_lead', { p_lead_id: id });
  if (error) return { error: error.message };
  revalidatePath('/leads'); revalidatePath('/map'); revalidatePath('/customers'); revalidatePath('/dashboard');
  return {};
}

// Admin-only History view restore (0020): mirrors deleteLead's pattern. restore_lead
// raises for non-admins and for an already-active lead, surfaced here as {error}.
export async function restoreLead(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('restore_lead', { p_lead_id: id });
  if (error) return { error: error.message };
  revalidatePath('/leads'); revalidatePath('/map'); revalidatePath('/customers'); revalidatePath('/dashboard');
  return {};
}
