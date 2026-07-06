import { describe, it, expect } from 'vitest';
import {
  INVOICE_STATUSES,
  invoiceStatusColor,
  fmtMoney,
  invoiceTotal,
  parseInvoiceForm,
  buildInvoices,
  type InvoiceItem,
  type InvoiceRow,
  type InvoiceCustomer,
} from '@/lib/invoices';

const fd = (o: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('status maps', () => {
  it('lists the three invoice statuses', () => {
    expect(INVOICE_STATUSES).toEqual(['draft', 'sent', 'paid']);
  });
  it('has a CSS-var color for each status', () => {
    expect(invoiceStatusColor.paid).toBe('var(--paid)');
    expect(invoiceStatusColor.sent).toBe('var(--sent)');
    expect(invoiceStatusColor.draft).toBe('var(--draft)');
  });
});

describe('fmtMoney', () => {
  it('formats with a $ prefix and thousands separators', () => {
    expect(fmtMoney(1240)).toBe('$1,240');
    expect(fmtMoney(0)).toBe('$0');
    expect(fmtMoney(NaN)).toBe('$0');
  });
});

describe('invoiceTotal', () => {
  const items: InvoiceItem[] = [
    { description: 'A', qty: 2, unit_price: 100 },
    { description: 'B', qty: 1, unit_price: 25 },
  ];
  it('sums qty * unit_price', () => {
    expect(invoiceTotal(items)).toBe(225);
  });
  it('adds tax and subtracts deposit', () => {
    expect(invoiceTotal(items, 20, 50)).toBe(195); // 225 + 20 - 50
  });
  it('is 0 for no items', () => {
    expect(invoiceTotal([])).toBe(0);
  });
  it('coerces non-numeric qty/price to 0', () => {
    expect(invoiceTotal([{ description: 'x', qty: NaN, unit_price: 10 }])).toBe(0);
  });
});

describe('parseInvoiceForm', () => {
  it('accepts a valid form and coerces item numbers', () => {
    const r = parseInvoiceForm(fd({
      customer_id: '5',
      status: 'sent',
      items: JSON.stringify([{ description: 'Window cleaning', qty: '2', unit_price: '90' }]),
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.customer_id).toBe(5);
      expect(r.value.status).toBe('sent');
      expect(r.value.items).toEqual([{ description: 'Window cleaning', qty: 2, unit_price: 90 }]);
    }
  });
  it('rejects a missing customer', () => {
    const r = parseInvoiceForm(fd({ customer_id: '0', status: 'draft', items: '[]' }));
    expect(r.ok).toBe(false);
  });
  it('rejects an invalid status', () => {
    const r = parseInvoiceForm(fd({ customer_id: '1', status: 'void', items: JSON.stringify([{ description: 'x', qty: '1', unit_price: '1' }]) }));
    expect(r.ok).toBe(false);
  });
  it('rejects negative qty or price', () => {
    const r = parseInvoiceForm(fd({ customer_id: '1', status: 'draft', items: JSON.stringify([{ description: 'x', qty: '-1', unit_price: '5' }]) }));
    expect(r.ok).toBe(false);
    const r2 = parseInvoiceForm(fd({ customer_id: '1', status: 'draft', items: JSON.stringify([{ description: 'x', qty: '1', unit_price: '-5' }]) }));
    expect(r2.ok).toBe(false);
  });
  it('drops fully-empty lines but requires at least one real item', () => {
    const r = parseInvoiceForm(fd({
      customer_id: '1', status: 'draft',
      items: JSON.stringify([{ description: '', qty: '0', unit_price: '0' }, { description: 'Real', qty: '1', unit_price: '50' }]),
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.items).toEqual([{ description: 'Real', qty: 1, unit_price: 50 }]);
    const empty = parseInvoiceForm(fd({ customer_id: '1', status: 'draft', items: JSON.stringify([{ description: '', qty: '0', unit_price: '0' }]) }));
    expect(empty.ok).toBe(false);
  });
  it('drops a line with no description and no price regardless of qty', () => {
    const fd = new FormData();
    fd.set('customer_id', '1');
    fd.set('status', 'draft');
    fd.set('items', JSON.stringify([{ description: '', qty: 1, unit_price: 0 }]));
    expect(parseInvoiceForm(fd)).toEqual({ ok: false, error: 'At least one line item is required' });
  });
  it('rejects malformed items JSON', () => {
    const r = parseInvoiceForm(fd({ customer_id: '1', status: 'draft', items: 'not json' }));
    expect(r.ok).toBe(false);
  });
});

describe('buildInvoices', () => {
  const rows: InvoiceRow[] = [
    { id: 1, customer_id: 10, job_id: null, number: 'INV-1001', issue_date: '2026-06-20', status: 'paid', tax: 0, deposit: 0 },
    { id: 2, customer_id: 99, job_id: 7, number: 'INV-1002', issue_date: '2026-06-25', status: 'sent', tax: null, deposit: null },
  ];
  const items = new Map<number, InvoiceItem[]>([[1, [{ description: 'A', qty: 1, unit_price: 180 }]]]);
  const customers: InvoiceCustomer[] = [{ id: 10, name: 'Sarah Kim' }];
  it('joins customer name, items, and coerces null tax/deposit to 0', () => {
    const out = buildInvoices(rows, items, customers);
    expect(out[0].customer_name).toBe('Sarah Kim');
    expect(out[0].items).toEqual([{ description: 'A', qty: 1, unit_price: 180 }]);
    expect(out[0].tax).toBe(0);
    expect(out[1].customer_name).toBe('Unknown'); // customer 99 absent
    expect(out[1].items).toEqual([]);             // no items row
    expect(out[1].tax).toBe(0);
    expect(out[1].deposit).toBe(0);
  });
});
