'use client';
import { useRouter } from 'next/navigation';
import { fmtMoney, invoiceTotal, invoiceStatusColor, type Invoice } from '@/lib/invoices';

export function InvoicesTable({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter();
  const open = (id: number) => router.push(`/invoices?i=${id}`, { scroll: false });
  return (
    <section className="screen">
      <div className="scrhead">
        <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: 13 }}>Invoices</h3>
        <button className="btn" type="button" onClick={() => router.push('/invoices?new=1', { scroll: false })}>
          + New invoice
        </button>
      </div>
      <div className="panel box">
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} data-click="" onClick={() => open(inv.id)}>
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
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="cap" style={{ color: 'var(--muted)' }}>No invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
