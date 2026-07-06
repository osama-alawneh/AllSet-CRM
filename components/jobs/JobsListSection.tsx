'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { type Job } from '@/lib/jobs';
import { supabaseBrowser } from '@/lib/supabase/client';
import { toCSV, downloadCSV, jobsCsvTable } from '@/lib/csv';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { JobsListTable } from './JobsListTable';

export function JobsListSection({
  jobs, admin,
}: {
  jobs: Job[];
  admin: boolean;
}) {
  const router = useRouter();
  const open = (id: number) => router.push(`/jobs?view=list&j=${id}`, { scroll: false });

  // Realtime: same private 'jobs' broadcast subscription as JobsBoard, so a claim in
  // another window refreshes the list view too. Debounced (250ms) router.refresh().
  useEffect(() => {
    const sb = supabaseBrowser();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    (async () => {
      await sb.realtime.setAuth();
      if (cancelled) return;
      channel = sb
        .channel('jobs', { config: { private: true } })
        .on('broadcast', { event: 'change' }, refresh)
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) sb.removeChannel(channel);
    };
  }, [router]);

  return (
    <section className="screen">
      <div className="scrhead">
        <ViewToggle view="list" base="/jobs" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = jobsCsvTable(jobs, admin);
              downloadCSV('clearview-jobs.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          {admin && (
            <button className="btn" type="button" onClick={() => router.push('/jobs?view=list&new=1', { scroll: false })}>
              + New job
            </button>
          )}
        </div>
      </div>
      <JobsListTable jobs={jobs} admin={admin} onOpen={open} />
    </section>
  );
}
