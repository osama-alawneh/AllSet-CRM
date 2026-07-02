'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { parseCustomerForm } from '@/lib/customers';

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
