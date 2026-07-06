'use client';
import { useState } from 'react';
import { statusLabel, statusColor, type Lead } from '@/lib/leads';
import { filterLeads } from '@/lib/search';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

export function LeadsListTable({ leads, admin, onOpen }: { leads: Lead[]; admin: boolean; onOpen: (id: number) => void }) {
  const [q, setQ] = useState('');
  const shown = filterLeads(leads, q);
  return (
    <div className="panel box">
      <input placeholder="🔍 filter leads…" style={{ width: 220, marginBottom: 12 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Filter leads" />
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th><th>Customer</th><th>Service</th><th>Status</th>
              <th>Stories</th><th>Panes</th><th>Created</th>{admin && <th>Quote</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map(l => (
              <tr
                key={l.id} data-click="" tabIndex={0}
                onClick={() => onOpen(l.id)}
                onKeyDown={e => {
                  const t = e.target as HTMLElement;
                  if (t.closest('button, a, input, select, textarea')) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(l.id); }
                }}
              >
                <td>{l.id}</td>
                <td><b>{l.customer_name}</b><br /><small style={{ color: 'var(--muted)' }}>{l.address ?? '—'}</small></td>
                <td>{l.service ?? 'TBD'}</td>
                <td><span className="badge" style={{ background: 'var(--chip)', color: statusColor[l.status] }}>{statusLabel[l.status]}</span></td>
                <td>{l.stories ?? '—'}</td>
                <td>{l.panes ?? '—'}</td>
                <td>{day(l.created_at)}</td>
                {admin && <td style={{ color: 'var(--won)', fontWeight: 700 }}>{l.quote_value ? fmt(l.quote_value) : '—'}</td>}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={admin ? 8 : 7} style={{ color: 'var(--muted)' }}>No leads match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
