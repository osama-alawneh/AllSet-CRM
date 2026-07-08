import { redirect } from 'next/navigation';
import { getRole, guardDecision, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { GlobalSearch } from '@/components/search/GlobalSearch';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  const to = guardDecision(role);
  if (to || !role) {
    redirect(to ?? '/login');
  }
  const user = await getSession();
  const sb = await supabaseServer();
  const { data: profile } = await sb.from('profiles').select('full_name').eq('id', user!.id).single();
  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar role={role} name={profile?.full_name ?? 'Unknown'} />
      <main className="main" id="main">
        <Topbar search={<GlobalSearch role={role} />} nav={<Sidebar role={role} name={profile?.full_name ?? 'Unknown'} />} />
        {children}
      </main>
    </div>
  );
}
