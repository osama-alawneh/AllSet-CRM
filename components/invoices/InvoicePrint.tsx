'use client';
import { fmtMoney, invoiceTotal, type InvoiceItem } from '@/lib/invoices';

export type PrintData = {
  number: string;
  issue_date: string;
  customer_name: string;
  customer_address: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  items: InvoiceItem[];
  tax: number;
  deposit: number;
};

// Rendered by InvoiceDrawer via createPortal(…, document.body) so it is a SIBLING of .app.
// Print CSS hides .app/.drawer with display:none!important and shows #printArea — a nested
// #printArea would inherit the ancestor's display:none and print blank.
export function InvoicePrint({ data }: { data: PrintData }) {
  const total = invoiceTotal(data.items, data.tax, data.deposit);
  return (
    <div id="printArea">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>AllSet</h1>
          <div style={{ fontSize: 11 }}>Window Cleaning Co.</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>INVOICE</div>
          <div>{data.number}</div>
          <div>{data.issue_date}</div>
        </div>
      </div>
      <div style={{ marginTop: 24, fontSize: 12 }}>
        <b>Bill to:</b>
        <br />{data.customer_name}
        <br />{data.customer_address ?? ''}
        <br />{data.customer_phone ?? ''} · {data.customer_email ?? ''}
      </div>
      <table className="inv-tbl">
        <thead>
          <tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr>
        </thead>
        <tbody>
          {data.items.map((it, i) => (
            <tr key={i}>
              <td>{it.description}</td>
              <td>{it.qty}</td>
              <td>{fmtMoney(it.unit_price)}</td>
              <td>{fmtMoney(it.qty * it.unit_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tot">Total due: {fmtMoney(total)}</div>
      <div style={{ marginTop: 40, fontSize: 11, color: '#555' }}>
        Thank you for your business. Payment due within 14 days.
      </div>
    </div>
  );
}
