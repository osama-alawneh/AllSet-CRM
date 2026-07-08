import { redirect } from 'next/navigation';
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logQueryError } from '@/lib/log';
import { UsersPanel, type PanelUser } from '@/components/settings/UsersPanel';

export default async function SettingsPage() {
  const role = await getRole();
  if (role !== 'admin') redirect('/dashboard');
  const me = (await getSession())!;

  const sb = await supabaseServer();
  const { data: profiles, error: profilesError } = await sb
    .from('profiles')
    .select('id,full_name,role,created_at')
    .order('created_at');
  logQueryError('settings.profiles', profilesError);
  // Emails live in auth.users — admin API only. MVP scale: one page of 200 is plenty.
  const { data: list, error: listError } = await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 200 });
  logQueryError('settings.listUsers', listError);
  const emailById = new Map((list?.users ?? []).map(u => [u.id, u.email ?? '—']));

  const users: PanelUser[] = (profiles ?? []).map(p => ({
    id: p.id,
    full_name: p.full_name,
    role: p.role,
    email: emailById.get(p.id) ?? '—',
    created_at: String(p.created_at).slice(0, 10),
  }));

  return <UsersPanel users={users} meId={me.id} />;
}
