'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { parseCustomerForm } from '@/lib/customers';
import { getRole } from '@/lib/auth';

export async function saveCustomer(id: number, fd: FormData): Promise<{ error?: string }> {
  const parsed = parseCustomerForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const sb = await supabaseServer();
  const { data, error } = await sb.from('customers').update(parsed.value).eq('id', id).select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Save failed: not permitted or customer not found' };
  revalidatePath('/customers');
  return {};
}

export async function createCustomer(fd: FormData): Promise<{ error?: string }> {
  const parsed = parseCustomerForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from('customers')
    .insert(parsed.value)
    .select('id')
    .single();
  if (error) return { error: error.message };
  revalidatePath('/customers');
  redirect(`/customers?c=${data.id}`);
}

// Owner request 2026-07-08 (#3, soft deactivation): admin-only toggle. RLS (customers_update,
// 0005) would also allow a rep to write this column, but the UI only exposes the button to
// admins — this check is defence in depth, same pattern as settings/actions.ts setUserRole.
export async function setCustomerActive(id: number, active: boolean): Promise<{ error?: string }> {
  if ((await getRole()) !== 'admin') return { error: 'Not authorized' };
  const sb = await supabaseServer();
  const { data, error } = await sb.from('customers').update({ active }).eq('id', id).select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Update failed: not permitted or customer not found' };
  revalidatePath('/customers');
  return {};
}
