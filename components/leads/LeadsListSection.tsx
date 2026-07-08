'use client';
import { useRouter } from 'next/navigation';
import { type Lead } from '@/lib/leads';
import { toCSV, downloadCSV, leadsCsvTable } from '@/lib/csv';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { LeadsListTable } from './LeadsListTable';

export function LeadsListSection({
  leads, admin, canEdit,
}: {
  leads: Lead[];
  admin: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const open = (id: number) => router.push(`/leads?view=list&l=${id}`, { scroll: false });

  return (
    <section className="screen">
      <div className="scrhead">
        <ViewToggle view="list" base="/leads" />
        {admin && <HistoryToggle base="/leads" active={false} />}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = leadsCsvTable(leads, admin);
              downloadCSV('clearview-leads.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          {canEdit && (
            <button className="btn" type="button" onClick={() => router.push('/leads?view=list&new=1', { scroll: false })}>
              + New lead
            </button>
          )}
        </div>
      </div>
      <LeadsListTable leads={leads} admin={admin} onOpen={open} />
    </section>
  );
}
