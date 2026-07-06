'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtMoney, invoiceTotal, invoiceStatusColor, type Invoice } from '@/lib/invoices';
import { toCSV, downloadCSV, invoicesCsvTable } from '@/lib/csv';
import { filterInvoices } from '@/lib/search';

export function InvoicesTable({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const shown = filterInvoices(invoices, q);
  const open = (id: number) => router.push(`/invoices?i=${id}`, { scroll: false });
  return (
    <section className="screen">
      <div className="scrhead">
        <input placeholder="🔍 filter invoices…" style={{ width: 220 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Filter invoices" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = invoicesCsvTable(invoices);
              downloadCSV('clearview-invoices.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          <button className="btn" type="button" onClick={() => router.push('/invoices?new=1', { scroll: false })}>
            + New invoice
          </button>
        </div>
      </div>
      <div className="panel box">
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {shown.map(inv => (
                <tr
                  key={inv.id}
                  data-click=""
                  tabIndex={0}
                  onClick={() => open(inv.id)}
                  onKeyDown={e => {
                    const t = e.target as HTMLElement;
                    if (t.closest('button, a, input, select, textarea')) return;
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(inv.id); }
                  }}
                >
                  <td><b>{inv.number}</b></td>
                  <td>{inv.customer_name}</td>
                  <td>{inv.issue_date}</td>
                  <td>{fmtMoney(invoiceTotal(inv.items, inv.tax, inv.deposit))}</td>
                  <td>
                    <span className="badge" style={{ background: 'var(--chip)', color: invoiceStatusColor[inv.status] }}>
                      {inv.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn sec" type="button" onClick={e => { e.stopPropagation(); open(inv.id); }}>
                      🖨 PDF
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={6} className="cap" style={{ color: 'var(--muted)' }}>No invoices match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
