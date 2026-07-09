import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRole, guardDecision, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
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
  // Unclaimed-jobs nav badge: admin + cleaner only (rep gets null, i.e. no badge) — a parallel
  // head-count alongside the profile fetch so it doesn't add a network round trip.
  const [{ data: profile }, unclaimedCount] = await Promise.all([
    sb.from('profiles').select('full_name').eq('id', user!.id).single(),
    role === 'admin' || role === 'cleaner'
      ? sb.from('jobs_public').select('id', { count: 'exact', head: true }).eq('status', 'unclaimed')
          .then(({ count, error }) => {
            logQueryError('jobs_public.unclaimed_count', error);
            return error ? null : count;
          })
      : Promise.resolve(null),
  ]);
  // Same cookie RootLayout reads for the <html data-theme> attribute — keeps ThemeToggle's
  // initial render in sync with the server-rendered theme (no client-side sniffing/flash).
  const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to content</a>
      <Sidebar role={role} name={profile?.full_name ?? 'Unknown'} unclaimedCount={unclaimedCount} />
      <main className="main" id="main">
        <Topbar
          search={<GlobalSearch role={role} />}
          nav={<Sidebar role={role} name={profile?.full_name ?? 'Unknown'} unclaimedCount={unclaimedCount} />}
          theme={theme}
        />
        {children}
      </main>
    </div>
  );
}
