'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { filterCustomers, type CustomerRow } from '@/lib/customers';
import { toCSV, downloadCSV, customersCsvTable } from '@/lib/csv';

export function CustomersTable({
  rows, admin, canCreate, showInactive,
}: {
  rows: CustomerRow[];
  admin: boolean;
  canCreate: boolean;
  showInactive: boolean;
}) {
  const [q, setQ] = useState('');
  const router = useRouter();
  const shown = filterCustomers(rows, q);
  // Preserve the toggle across row/drawer navigation: the page's customers query is
  // scoped by ?inactive=1, so dropping it mid-list would make the drawer 404 (row
  // resolved from the wrong list — see app/(app)/customers/page.tsx).
  const openHref = (id: number) => `/customers?c=${id}${showInactive ? '&inactive=1' : ''}`;
  return (
    <section className="screen">
      <div className="scrhead">
        <input
          placeholder="🔍 filter customers…"
          style={{ width: 240 }}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {admin && (
            <button
              className="btn sec"
              type="button"
              onClick={() => router.push(showInactive ? '/customers' : '/customers?inactive=1', { scroll: false })}
            >
              {showInactive ? '← Active customers' : 'Show inactive'}
            </button>
          )}
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              // Export ALL rows, not the search-filtered `shown` subset.
              const t = customersCsvTable(rows, admin);
              downloadCSV('clearview-customers.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          {canCreate && (
            <button className="btn" onClick={() => router.push('/customers?new=1', { scroll: false })}>
              + New customer
            </button>
          )}
        </div>
      </div>
      <div className="panel box">
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Address</th>
                <th>Type</th>
                <th>Jobs</th>
                {admin && <th>Invoices</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map(c => (
                <tr
                  key={c.id}
                  data-click=""
                  tabIndex={0}
                  onClick={() => router.push(openHref(c.id), { scroll: false })}
                  onKeyDown={e => {
                    const t = e.target as HTMLElement;
                    if (t.closest('button, a, input, select, textarea')) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(openHref(c.id), { scroll: false });
                    }
                  }}
                >
                  <td>
                    <b>{c.name}</b>
                    <br />
                    <small style={{ color: 'var(--muted)' }}>{c.phone ?? '—'}</small>
                  </td>
                  <td>{c.address ?? '—'}</td>
                  <td>
                    <span className="badge" style={{ background: 'var(--chip)', color: 'var(--muted)' }}>
                      {c.type}
                    </span>
                  </td>
                  <td>{c.jobs} jobs</td>
                  {admin && <td>{c.invoices ?? 0} inv</td>}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={admin ? 5 : 4} style={{ color: 'var(--muted)' }}>
                    {q ? 'No customers match.' : 'No customers yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
