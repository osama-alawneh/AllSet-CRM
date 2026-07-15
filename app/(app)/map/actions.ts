'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { parseConvertLeadForm, parseConvertJobForm, type DotStatus } from '@/lib/dots';

// Dot CRUD revalidates the two dot surfaces; converts also touch the pages
// their new records appear on.
const revalidateDots = () => {
  revalidatePath('/map');
  revalidatePath('/dashboard');
};

export async function createDot(lat: number, lng: number): Promise<{ id?: number; error?: string }> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { error: 'Invalid coordinates' };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('create_dot', { p_lat: lat, p_lng: lng });
  if (error) return { error: error.message };
  revalidateDots();
  return { id: data as number };
}

export async function updateDot(id: number, label: string, notes: string, status: DotStatus): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('update_dot', { p_id: id, p_label: label, p_notes: notes, p_status: status });
  if (error) return { error: error.message };
  revalidateDots();
  return {};
}

export async function deleteDot(id: number): Promise<{ error?: string }> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc('delete_dot', { p_id: id });
  if (error) return { error: error.message };
  revalidateDots();
  return {};
}

export async function convertDotToLead(fd: FormData): Promise<{ error?: string }> {
  const parsed = parseConvertLeadForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('convert_dot_to_lead', {
    p_dot_id: v.dot_id, p_name: v.name, p_phone: v.phone, p_address: v.address,
    p_service: v.service, p_status: v.status, p_note: v.note, p_quote: v.quote,
  });
  if (error) return { error: error.message };
  revalidateDots();
  revalidatePath('/leads');
  revalidatePath('/customers');
  redirect(`/map?l=${data}`); // redirect() throws — do not wrap in try/catch
}

export async function convertDotToJob(fd: FormData): Promise<{ error?: string }> {
  const parsed = parseConvertJobForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('convert_dot_to_job', {
    p_dot_id: v.dot_id, p_name: v.name, p_phone: v.phone, p_address: v.address,
    p_service: v.service, p_description: v.description, p_scheduled: v.scheduled_date,
    p_price: v.price, p_cleaner_amount: v.cleaner_amount,
  });
  if (error) return { error: error.message };
  revalidateDots();
  revalidatePath('/jobs');
  revalidatePath('/customers');
  redirect(`/map?j=${data}`);
}
