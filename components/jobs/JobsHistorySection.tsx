'use client';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { JobsHistoryTable, type DeletedJob } from './JobsHistoryTable';

// Admin-only History screen (0020): replaces the board/list body while ?deleted=1 is set.
export function JobsHistorySection({ jobs }: { jobs: DeletedJob[] }) {
  return (
    <section className="screen">
      <div className="scrhead">
        <HistoryToggle base="/jobs" active />
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          deleted jobs · restore to bring back onto the board
        </span>
      </div>
      <JobsHistoryTable jobs={jobs} />
    </section>
  );
}
