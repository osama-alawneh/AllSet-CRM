import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase/server';

export type Role = 'admin' | 'rep' | 'cleaner';

export function normalizeRole(r: string | null | undefined): Role | null {
  return r === 'admin' || r === 'rep' || r === 'cleaner' ? r : null;
}

// cache() dedupes per request: layout + page + proxy-refreshed renders previously issued
// ~4 GoTrue round-trips and ~3 profiles queries per navigation (review finding PERF-1).
export const getSession = cache(async () => {
  const sb = await supabaseServer();
  return (await sb.auth.getUser()).data.user;
});

export const getRole = cache(async (): Promise<Role | null> => {
  const u = await getSession();
  if (!u) return null;
  const sb = await supabaseServer();
  const { data, error } = await sb.from('profiles').select('role').eq('id', u.id).single();
  if (error) console.error('[query:profiles.role]', error.message);
  return normalizeRole(data?.role as string | undefined);
});

export function guardDecision(role: Role | null): string | null {
  return role ? null : '/login';
}
