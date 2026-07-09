'use client';
import { useRouter } from 'next/navigation';
import { type Job } from '@/lib/jobs';
import { toCSV, downloadCSV, jobsCsvTable } from '@/lib/csv';
import { useJobsRealtime } from '@/lib/hooks/useJobsRealtime';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { JobsListTable } from './JobsListTable';

export function JobsListSection({
  jobs, admin, money,
}: {
  jobs: Job[];
  admin: boolean;
  money: boolean;
}) {
  const router = useRouter();
  const open = (id: number) => router.push(`/jobs?view=list&j=${id}`, { scroll: false });
  // New-job affordance: admin + rep create jobs (spec: rep = admin on job money); money
  // already means admin-or-rep for job data, so it doubles as the create gate here.
  const canCreate = money;

  // Realtime: same private 'jobs' broadcast subscription as JobsBoard, so a claim in
  // another window refreshes the list view too. Debounced (250ms) router.refresh().
  useJobsRealtime();

  return (
    <section className="screen">
      <div className="scrhead">
        <ViewToggle view="list" base="/jobs" />
        <div style={{ display: 'flex', gap: 8 }}>
          {admin && <HistoryToggle base="/jobs" active={false} />}
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = jobsCsvTable(jobs, money);
              downloadCSV('clearview-jobs.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          {canCreate && (
            <button className="btn" type="button" onClick={() => router.push('/jobs?view=list&new=1', { scroll: false })}>
              + New job
            </button>
          )}
        </div>
      </div>
      <JobsListTable jobs={jobs} money={money} onOpen={open} />
    </section>
  );
}
