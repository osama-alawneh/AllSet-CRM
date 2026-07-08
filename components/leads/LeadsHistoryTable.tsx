'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { statusLabel, statusColor, type Lead } from '@/lib/leads';
import { filterLeads } from '@/lib/search';
import { restoreLead } from '@/app/(app)/leads/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

// Admin-only History view (0020): same markup as LeadsListTable (Customer/Service/Status/
// Stories/Panes/Quote), plus Deleted + Restore. Rows are read-only — no drawer click-through,
// since editing/status RPCs are closed to a soft-deleted row until it's restored.
export type DeletedLead = Lead & { deleted_at: string };

export function LeadsHistoryTable({ leads }: { leads: DeletedLead[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const shown = filterLeads(leads, q) as DeletedLead[];

  const restore = (id: number) => {
    setRowError(null);
    startTransition(async () => {
      const res = await restoreLead(id);
      if (res?.error) setRowError({ id, message: res.error });
      else router.refresh();
    });
  };

  return (
    <div className="panel box">
      <input
        placeholder="🔍 filter deleted leads…" style={{ width: 220, marginBottom: 12 }}
        value={q} onChange={e => setQ(e.target.value)} aria-label="Filter deleted leads"
      />
      <div className="tblwrap">
        <table className="tbl" aria-label="Deleted leads">
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">Customer</th><th scope="col">Service</th><th scope="col">Status</th>
              <th scope="col">Stories</th><th scope="col">Panes</th><th scope="col">Quote</th>
              <th scope="col">Deleted</th><th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(l => (
              <tr key={l.id}>
                <td>{l.id}</td>
                <td><b>{l.customer_name}</b><br /><small style={{ color: 'var(--muted)' }}>{l.address ?? '—'}</small></td>
                <td>{l.service ?? 'TBD'}</td>
                <td><span className="badge" style={{ background: 'var(--chip)', color: statusColor[l.status] }}>{statusLabel[l.status]}</span></td>
                <td>{l.stories ?? '—'}</td>
                <td>{l.panes ?? '—'}</td>
                <td style={{ color: 'var(--won)', fontWeight: 700 }}>{l.quote_value ? fmt(l.quote_value) : '—'}</td>
                <td>{day(l.deleted_at)}</td>
                <td>
                  <button className="btn sec" type="button" disabled={pending} onClick={() => restore(l.id)}>
                    ↺ Restore
                  </button>
                  {rowError?.id === l.id && (
                    <p className="form-err" role="alert" style={{ marginTop: 4 }}>{rowError.message}</p>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={9} style={{ color: 'var(--muted)' }}>No deleted leads.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
