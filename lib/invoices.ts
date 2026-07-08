export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'waived' | 'cancelled';

export const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'waived', 'cancelled'];

export const invoiceStatusColor: Record<InvoiceStatus, string> = {
  paid: 'var(--paid)', sent: 'var(--sent)', draft: 'var(--draft)',
  waived: 'var(--follow)', cancelled: 'var(--lost)',
};

export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  paid: 'Paid', sent: 'Sent', draft: 'Draft', waived: 'Waived', cancelled: 'Cancelled',
};

export type InvoiceItem = { description: string; qty: number; unit_price: number };

export type Invoice = {
  id: number;
  customer_id: number;
  job_id: number | null;
  number: string;
  issue_date: string;
  status: InvoiceStatus;
  tax: number;
  deposit: number;
  items: InvoiceItem[];
  customer_name: string;
};

// DB shapes the page fetches.
export type InvoiceRow = {
  id: number;
  customer_id: number;
  job_id: number | null;
  number: string;
  issue_date: string;
  status: InvoiceStatus;
  tax: number | null;
  deposit: number | null;
};
export type InvoiceCustomer = { id: number; name: string };

export type InvoiceInput = {
  customer_id: number;
  status: InvoiceStatus;
  items: InvoiceItem[];
};

export const fmtMoney = (n: number) => '$' + Number(n || 0).toLocaleString();

// total = sum(qty * unit_price) + tax - deposit. tax/deposit are Phase-3 fields (default 0).
export function invoiceTotal(items: InvoiceItem[], tax = 0, deposit = 0): number {
  const sub = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  return sub + (Number(tax) || 0) - (Number(deposit) || 0);
}

// Validates the invoice drawer's FormData. items travel as a JSON string field so the whole
// dynamic line-item array survives a single FormData round-trip. Negatives are rejected;
// fully-empty lines are dropped; at least one real line is required.
export function parseInvoiceForm(
  fd: FormData
): { ok: true; value: InvoiceInput } | { ok: false; error: string } {
  const customer_id = Number(fd.get('customer_id'));
  if (!Number.isFinite(customer_id) || customer_id <= 0) return { ok: false, error: 'Customer is required' };

  const status = String(fd.get('status') ?? '');
  if (!INVOICE_STATUSES.includes(status as InvoiceStatus)) return { ok: false, error: 'Invalid status' };

  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get('items') ?? '[]'));
  } catch {
    return { ok: false, error: 'Invalid line items' };
  }
  if (!Array.isArray(raw)) return { ok: false, error: 'Invalid line items' };

  const items: InvoiceItem[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    const description = String(r?.description ?? '').trim();
    const qty = Number(r?.qty) || 0;
    const unit_price = Number(r?.unit_price) || 0;
    if (qty < 0 || unit_price < 0) return { ok: false, error: 'Quantities and prices cannot be negative' };
    if (!description && unit_price === 0) continue; // placeholder-only line: no text, no money — not a real item
    items.push({ description: description || 'Item', qty, unit_price });
  }
  if (items.length === 0) return { ok: false, error: 'At least one line item is required' };

  return { ok: true, value: { customer_id, status: status as InvoiceStatus, items } };
}

// Join helper: attach each invoice's items (from a Map) and its customer name. No DB view.
export function buildInvoices(
  invoices: InvoiceRow[],
  itemsByInvoice: Map<number, InvoiceItem[]>,
  customers: InvoiceCustomer[]
): Invoice[] {
  const byId = new Map(customers.map(c => [c.id, c]));
  return invoices.map(inv => ({
    id: inv.id,
    customer_id: inv.customer_id,
    job_id: inv.job_id,
    number: inv.number,
    issue_date: inv.issue_date,
    status: inv.status,
    tax: Number(inv.tax ?? 0),
    deposit: Number(inv.deposit ?? 0),
    items: itemsByInvoice.get(inv.id) ?? [],
    customer_name: byId.get(inv.customer_id)?.name ?? 'Unknown',
  }));
}
