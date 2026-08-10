'use client';
import { useRouter } from 'next/navigation';
import { type Job } from '@/lib/jobs';
import { toCSV, downloadCSV, jobsCsvTable } from '@/lib/csv';
import { useJobsRealtime } from '@/lib/hooks/useJobsRealtime';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import type { CalEntry } from '@/lib/calendar';

// Third jobs view: month grid of jobs bucketed by scheduled date (unscheduled live on the
// board only). Same scrhead action set as board/list — consistency rule.
export function JobsCalendarSection({
  jobs, month, entries, admin, money,
}: {
  jobs: Job[];
  month: string;
  entries: Record<string, CalEntry[]>;
  admin: boolean;
  money: boolean;
}) {
  const router = useRouter();
  // New-job affordance: admin + rep create jobs (spec: rep = admin on job money); money
  // already means admin-or-rep for job data, so it doubles as the create gate here.
  const canCreate = money;

  // Realtime: same private 'jobs' broadcast subscription as JobsBoard/JobsListSection, so a
  // claim in another window refreshes the grid too. Debounced (250ms) router.refresh().
  useJobsRealtime();

  return (
    <section className="screen">
      <div className="scrhead">
        <ViewToggle view="calendar" base="/jobs" />
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
            <button
              className="btn"
              type="button"
              onClick={() => router.push(`/jobs?view=calendar&m=${month}&new=1`, { scroll: false })}
            >
              + New job
            </button>
          )}
        </div>
      </div>
      {/* key={month}: remount on month nav so the day panel doesn't survive into a month it
          doesn't belong to; drawer open/close keeps the same m, so it correctly persists there. */}
      <CalendarGrid key={month} month={month} entries={entries} kind="job" />
    </section>
  );
}
