'use server';

import { revalidatePath } from 'next/cache';
import { getRole, getSession, normalizeRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { parseNewUserForm } from '@/lib/users';

// Admin creates a login + profile in one go. Service-role client: auth.admin.createUser
// is admin-API-only, and the profiles insert must bypass RLS (no insert policy exists —
// deliberately: only this admin-gated action creates profiles).
export async function createUser(fd: FormData): Promise<{ error?: string }> {
  if ((await getRole()) !== 'admin') return { error: 'Not authorized' };
  const parsed = parseNewUserForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const { email, password, full_name, role } = parsed.value;
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return { error: error.message };
  const { error: pErr } = await admin.from('profiles').insert({ id: data.user.id, full_name, role });
  if (pErr) {
    // Roll back the orphaned auth user — without a profile, getRole() is null for it
    // and retrying the same email would fail at createUser (email already exists).
    const { error: dErr } = await admin.auth.admin.deleteUser(data.user.id);
    if (dErr) {
      return {
        error: `Profile creation failed: ${pErr.message}. Cleanup of the login also failed (${dErr.message}) — the account for ${email} may need manual removal before retrying.`,
      };
    }
    return { error: `Profile creation failed: ${pErr.message}. The login was rolled back — you can retry.` };
  }
  revalidatePath('/settings');
  return {};
}

export async function setUserRole(userId: string, role: string): Promise<{ error?: string }> {
  if ((await getRole()) !== 'admin') return { error: 'Not authorized' };
  const r = normalizeRole(role);
  if (!r) return { error: 'Invalid role' };
  const me = await getSession();
  if (me?.id === userId) return { error: 'You cannot change your own role' };
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('profiles').update({ role: r }).eq('id', userId).select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Profile not found' };
  revalidatePath('/settings');
  return {};
}
