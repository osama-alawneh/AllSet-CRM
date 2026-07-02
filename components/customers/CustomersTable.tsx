'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { filterCustomers, type CustomerRow } from '@/lib/customers';

export function CustomersTable({ rows, admin }: { rows: CustomerRow[]; admin: boolean }) {
  const [q, setQ] = useState('');
  const router = useRouter();
  const shown = filterCustomers(rows, q);
  return (
    <section className="screen">
      <div className="scrhead">
        <input
          placeholder="🔍 filter customers…"
          style={{ width: 240 }}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button className="btn" onClick={() => router.push('/customers?new=1', { scroll: false })}>
          + New customer
        </button>
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
                  onClick={() => router.push(`/customers?c=${c.id}`, { scroll: false })}
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
                    No customers match.
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
