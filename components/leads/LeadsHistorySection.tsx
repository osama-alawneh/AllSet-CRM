'use client';
import { useRouter } from 'next/navigation';
import { toCSV, downloadCSV, leadsHistoryCsvTable } from '@/lib/csv';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { LeadsHistoryTable, type DeletedLead } from './LeadsHistoryTable';

// Admin-only History screen (0020): replaces the board/list body while ?deleted=1 is set.
// Header mirrors the board/list action group (owner request): same toggle/export/new trio,
// with Export CSV scoped to the deleted rows shown here.
export function LeadsHistorySection({ leads }: { leads: DeletedLead[] }) {
  const router = useRouter();
  return (
    <section className="screen">
      <div className="scrhead">
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          deleted leads · restore to bring back onto the board
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <HistoryToggle base="/leads" active />
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = leadsHistoryCsvTable(leads, true); // history is admin-only
              downloadCSV('clearview-leads-history.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          <button className="btn" type="button" onClick={() => router.push('/leads?new=1', { scroll: false })}>
            + New lead
          </button>
        </div>
      </div>
      <LeadsHistoryTable leads={leads} />
    </section>
  );
}
