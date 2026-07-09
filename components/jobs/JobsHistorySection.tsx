'use client';
import { useRouter } from 'next/navigation';
import { toCSV, downloadCSV, jobsHistoryCsvTable } from '@/lib/csv';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { JobsHistoryTable, type DeletedJob } from './JobsHistoryTable';

// Admin-only History screen (0020): replaces the board/list body while ?deleted=1 is set.
// Header mirrors the board/list action group (owner request): same toggle/export/new trio,
// with Export CSV scoped to the deleted rows shown here.
export function JobsHistorySection({ jobs }: { jobs: DeletedJob[] }) {
  const router = useRouter();
  return (
    <section className="screen">
      <div className="scrhead">
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          deleted jobs · restore to bring back onto the board
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <HistoryToggle base="/jobs" active />
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = jobsHistoryCsvTable(jobs, true); // history is admin-only
              downloadCSV('clearview-jobs-history.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          <button className="btn" type="button" onClick={() => router.push('/jobs?new=1', { scroll: false })}>
            + New job
          </button>
        </div>
      </div>
      <JobsHistoryTable jobs={jobs} />
    </section>
  );
}
