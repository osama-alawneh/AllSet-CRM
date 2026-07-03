'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { parsePinForm } from '@/lib/leads';

export async function createLeadFromPin(fd: FormData): Promise<{ error?: string }> {
  const parsed = parsePinForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc('create_lead_from_pin', {
    p_name: parsed.value.name,
    p_address: parsed.value.address,
    p_lat: parsed.value.lat,
    p_lng: parsed.value.lng,
    p_status: parsed.value.status,
  });
  if (error) return { error: error.message };
  revalidatePath('/map');
  revalidatePath('/leads');
  revalidatePath('/customers');
  redirect(`/map?l=${data}`); // redirect() throws — do not wrap in try/catch
}
