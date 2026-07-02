import { supabaseServer } from '@/lib/supabase/server';

export type Role = 'admin' | 'rep' | 'cleaner';

export function normalizeRole(r: string | null | undefined): Role | null {
  return r === 'admin' || r === 'rep' || r === 'cleaner' ? r : null;
}

export async function getSession() {
  const sb = await supabaseServer();
  return (await sb.auth.getUser()).data.user;
}

export async function getRole(): Promise<Role | null> {
  const u = await getSession();
  if (!u) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from('profiles').select('role').eq('id', u.id).single();
  return normalizeRole(data?.role as string | undefined);
}

export function guardDecision(role: Role | null): string | null {
  return role ? null : '/login';
}
