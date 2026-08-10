'use client';
import { useRouter } from 'next/navigation';
import { type Lead } from '@/lib/leads';
import { toCSV, downloadCSV, leadsCsvTable } from '@/lib/csv';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import type { CalEntry } from '@/lib/calendar';

// Third leads view: same scrhead action set as board/list (consistency rule) over a month
// grid of leads bucketed by created date. Export stays whole-set, not month-scoped — the
// button means the same thing in every view.
export function LeadsCalendarSection({
  leads, month, entries, admin, money, canEdit,
}: {
  leads: Lead[];
  month: string;
  entries: Record<string, CalEntry[]>;
  admin: boolean;
  money: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();

  return (
    <section className="screen">
      <div className="scrhead">
        <ViewToggle view="calendar" base="/leads" />
        <div style={{ display: 'flex', gap: 8 }}>
          {admin && <HistoryToggle base="/leads" active={false} />}
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = leadsCsvTable(leads, money);
              downloadCSV('clearview-leads.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          {canEdit && (
            <button
              className="btn"
              type="button"
              onClick={() => router.push(`/leads?view=calendar&m=${month}&new=1`, { scroll: false })}
            >
              + New lead
            </button>
          )}
        </div>
      </div>
      {/* key={month}: remount on month nav so the day panel doesn't survive into a month it
          doesn't belong to; drawer open/close keeps the same m, so it correctly persists there. */}
      <CalendarGrid key={month} month={month} entries={entries} kind="lead" />
    </section>
  );
}
