'use client';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { LeadsHistoryTable, type DeletedLead } from './LeadsHistoryTable';

// Admin-only History screen (0020): replaces the board/list body while ?deleted=1 is set.
export function LeadsHistorySection({ leads }: { leads: DeletedLead[] }) {
  return (
    <section className="screen">
      <div className="scrhead">
        <HistoryToggle base="/leads" active />
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          deleted leads · restore to bring back onto the board
        </span>
      </div>
      <LeadsHistoryTable leads={leads} />
    </section>
  );
}
