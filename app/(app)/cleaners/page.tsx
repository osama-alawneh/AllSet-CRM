import { getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { leaderboard, monthKey, type EarningRow } from '@/lib/earnings';
import { Leaderboard, type LeaderRow } from '@/components/dashboard/Leaderboard';

// Task 7: transparent leaderboard tab, visible to every role (admin/rep/cleaner) — same owner
// call as the dashboard's Leaderboard. cleaner_earnings has no role gate (unlike
// company_revenue, which self-gates to []), so there is nothing to branch on here and no
// redirect: the app-layout auth guard already ensures a signed-in, role-having user reached
// this page. Split math lives ONLY in the view; this page never touches revenue.
export default async function CleanersPage() {
  const user = await getSession();
  const uid = user?.id ?? '';
  const sb = await supabaseServer();

  const [ceRes, psRes] = await Promise.all([
    sb.from('cleaner_earnings').select('cleaner_id,job_id,done_at,share'),
    sb.from('profiles').select('id,full_name,role'),
  ]);
  logQueryError('cleaners.page.cleanerEarnings', ceRes.error);
  logQueryError('cleaners.page.profiles', psRes.error);

  const profiles = (psRes.data ?? []) as Array<{ id: string; full_name: string; role: string }>;
  const names = new Map(profiles.map(p => [p.id, p.full_name]));
  const earningRows = (ceRes.data ?? []) as EarningRow[];

  const curMonth = monthKey(new Date().toISOString());
  const month = leaderboard(earningRows, names, curMonth);
  const allTime = leaderboard(earningRows, names);

  // Zero-rows append: cleaner-role profiles with no earnings in a given board don't appear in
  // that leaderboard() output (it only ever sees cleaner_earnings rows) — add them explicitly
  // so every cleaner on the roster shows up, even at 0 jobs / $0. Computed per board (spec):
  // a cleaner with past-month earnings but none this month still needs a $0 row on the month
  // board, so each board's zero-set is derived from its own dataset, not all-time's.
  const zeroRowsFor = (board: LeaderRow[]): LeaderRow[] => {
    const seen = new Set(board.map(r => r.cleaner_id));
    return profiles
      .filter(p => p.role === 'cleaner' && !seen.has(p.id))
      .map(p => ({ cleaner_id: p.id, name: p.full_name, jobsDone: 0, earnings: 0 }));
  };

  const monthBoard = [...month, ...zeroRowsFor(month)];
  const allBoard = [...allTime, ...zeroRowsFor(allTime)];

  return (
    <section className="screen">
      <Leaderboard month={monthBoard} allTime={allBoard} uid={uid} />
    </section>
  );
}
