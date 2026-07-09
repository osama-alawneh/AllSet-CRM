'use client';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import { CustomerLookup } from '@/components/customers/CustomerLookup';
import {
  INVOICE_STATUSES,
  invoiceStatusColor,
  fmtMoney,
  invoiceTotal,
  type Invoice,
  type InvoiceItem,
  type InvoiceStatus,
} from '@/lib/invoices';
import { saveInvoice } from '@/app/(app)/invoices/actions';
import { InvoicePrint, type PrintData } from './InvoicePrint';

export type InvoiceCustomerFull = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export function InvoiceDrawer({
  invoice, isNew, customers,
}: {
  invoice: Invoice | null;
  isNew: boolean;
  customers: InvoiceCustomerFull[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(isNew);
  const [customerId, setCustomerId] = useState<number>(invoice?.customer_id ?? 0);
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status ?? 'draft');
  const [items, setItems] = useState<InvoiceItem[]>(
    invoice?.items.length ? invoice.items : [{ description: '', qty: 1, unit_price: 0 }]
  );
  const [printPayload, setPrintPayload] = useState<PrintData | null>(null);

  const close = () => router.push('/invoices', { scroll: false });
  // Bill-to for display/print: the picked customer from the ACTIVE-ONLY picker array if
  // present; otherwise — while customerId is still the invoice's own customer — the invoice's
  // resolved fields (buildInvoices joins the unfiltered customers query). A deactivated
  // customer is absent from `customers` but their existing invoice must still render its
  // bill-to (Task 20 review fix). Repicking in edit mode makes `picked` win.
  const picked = customers.find(c => c.id === customerId) ?? null;
  const cust: InvoiceCustomerFull | null =
    picked ??
    (invoice && customerId === invoice.customer_id
      ? {
          id: invoice.customer_id,
          name: invoice.customer_name,
          address: invoice.customer_address,
          phone: invoice.customer_phone,
          email: invoice.customer_email,
        }
      : null);
  const total = invoiceTotal(items, invoice?.tax ?? 0, invoice?.deposit ?? 0);
  const number = invoice?.number ?? 'INV-—';
  const issueDate = invoice?.issue_date ?? 'pending';

  const setItem = (i: number, f: keyof InvoiceItem, v: string) =>
    setItems(prev => prev.map((it, idx) =>
      idx === i ? { ...it, [f]: f === 'description' ? v : (Number(v) || 0) } : it
    ));
  const addLine = () => setItems(prev => [...prev, { description: '', qty: 1, unit_price: 0 }]);

  const buildFd = () => {
    const fd = new FormData();
    fd.set('customer_id', String(customerId));
    fd.set('status', status);
    fd.set('items', JSON.stringify(items));
    return fd;
  };

  const save = () => {
    setError(null);
    if (!customerId) { setError('Pick a customer'); return; }
    startTransition(async () => {
      const res = await saveInvoice(isNew ? null : invoice!.id, buildFd());
      // New invoices redirect inside the action (this frame does not return); only the
      // edit path returns {} — mirror CustomerDrawer: close only on edit.
      if (res?.error) setError(res.error);
      else if (!isNew) { setEditing(false); }
    });
  };

  const printPdf = () => {
    setError(null);
    // Read mode: print exactly what's persisted — do NOT save first.
    if (!editing && !isNew) {
      setPrintPayload({
        number,
        issue_date: issueDate,
        customer_name: cust?.name ?? 'Customer',
        customer_address: cust?.address ?? null,
        customer_phone: cust?.phone ?? null,
        customer_email: cust?.email ?? null,
        items,
        tax: invoice?.tax ?? 0,
        deposit: invoice?.deposit ?? 0,
      });
      return;
    }
    startTransition(async () => {
      const res = await saveInvoice(isNew ? null : invoice!.id, buildFd());
      if (res?.error) { setError(res.error); return; }
      // A brand-new invoice redirects to /invoices?i=<id> above; the drawer remounts on the
      // persisted invoice and the admin prints from there. For an existing invoice, print now.
      if (isNew) return;
      setPrintPayload({
        number,
        issue_date: issueDate,
        customer_name: cust?.name ?? 'Customer',
        customer_address: cust?.address ?? null,
        customer_phone: cust?.phone ?? null,
        customer_email: cust?.email ?? null,
        items,
        tax: invoice?.tax ?? 0,
        deposit: invoice?.deposit ?? 0,
      });
    });
  };

  // Print once the #printArea portal has mounted as a body sibling; the small delay lets the
  // browser lay it out before the print dialog snapshots the page.
  useEffect(() => {
    if (!printPayload) return;
    const t = setTimeout(() => window.print(), 50);
    return () => clearTimeout(t);
  }, [printPayload]);

  return (
    <Drawer onClose={close} labelId="invoice-drawer-title">
      <div className="dh">
        <div>
          <span className="badge" style={{ background: 'var(--chip)', color: invoiceStatusColor[status] }}>{status}</span>
          <h2 id="invoice-drawer-title">{number}</h2>
        </div>
        <button type="button" className="close" onClick={close} aria-label="Close">✕</button>
      </div>

      <div className="sec">
        <span className="lbl">Bill to</span>
        {editing ? (
          <>
            <CustomerLookup
              customers={customers}
              name="customer_lookup_display"
              initialId={customerId}
              onPick={c => setCustomerId(c.id)}
            />
            <div className="minirow" style={{ cursor: 'default' }}>
              <span style={{ color: 'var(--muted)' }}>📞 {cust?.phone ?? '—'} · {cust?.address ?? '—'}</span>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 600 }}>{cust?.name ?? '—'}</div>
            <div className="minirow" style={{ cursor: 'default' }}>
              <span style={{ color: 'var(--muted)' }}>📞 {cust?.phone ?? '—'} · {cust?.address ?? '—'}</span>
            </div>
          </>
        )}
      </div>

      <div className="sec">
        <span className="lbl">Line items</span>
        <table className="items">
          <thead>
            <tr><th>Description</th><th>Qty</th><th>Price</th><th style={{ textAlign: 'right' }}>Total</th></tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              editing ? (
                <tr key={i}>
                  <td><input value={it.description} placeholder="Window cleaning" onChange={e => setItem(i, 'description', e.target.value)} /></td>
                  <td><input className="num" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} /></td>
                  <td><input className="num" value={it.unit_price === 0 ? '' : it.unit_price} placeholder="0.00" onChange={e => setItem(i, 'unit_price', e.target.value)} /></td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(it.qty * it.unit_price)}</td>
                </tr>
              ) : (
                <tr key={i}>
                  <td>{it.description || '—'}</td>
                  <td className="num">{it.qty}</td>
                  <td className="num">{fmtMoney(it.unit_price)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(it.qty * it.unit_price)}</td>
                </tr>
              )
            ))}
          </tbody>
        </table>
        {editing && (
          <button className="btn sec" type="button" onClick={addLine} style={{ marginTop: 8 }}>+ Add line</button>
        )}
      </div>

      <div className="sec">
        <div className="kv">
          <span className="k">Status</span>
          <span className="v">
            {editing ? (
              <select value={status} onChange={e => setStatus(e.target.value as InvoiceStatus)}>
                {INVOICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <span className="badge" style={{ background: 'var(--chip)', color: invoiceStatusColor[status] }}>{status}</span>
            )}
          </span>
          <span className="k">Total</span>
          <span className="v" style={{ color: 'var(--won)', fontSize: 15 }}>{fmtMoney(total)}</span>
        </div>
      </div>

      {error && <p className="form-err" role="alert">{error}</p>}

      <div className="acts">
        {!editing && (
          <button className="btn-p" type="button" onClick={() => { setError(null); setEditing(true); }}>✎ Edit</button>
        )}
        {editing && (
          <button className="btn-p" type="button" disabled={pending} onClick={save}>Save</button>
        )}
        {editing && !isNew && (
          <button className="btn-s" type="button" disabled={pending}
            onClick={() => { setError(null); setEditing(false); setItems(invoice!.items); setStatus(invoice!.status); setCustomerId(invoice!.customer_id); }}>
            Cancel
          </button>
        )}
        <button className="btn-s" type="button" disabled={pending} onClick={printPdf}>🖨 Print PDF</button>
        <button className="btn-s" type="button" onClick={close}>Close</button>
      </div>

      {printPayload && createPortal(<InvoicePrint data={printPayload} />, document.body)}
    </Drawer>
  );
}
