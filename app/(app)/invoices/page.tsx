import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { buildInvoices, type InvoiceRow, type InvoiceItem, type InvoiceCustomer } from '@/lib/invoices';
import { InvoicesTable } from '@/components/invoices/InvoicesTable';
import { InvoiceDrawer, type InvoiceCustomerFull } from '@/components/invoices/InvoiceDrawer';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ i?: string; new?: string }>;
}) {
  const { i: iParam, new: newParam } = await searchParams;
  const role = await getRole();
  if (role !== 'admin') redirect('/dashboard'); // money is admin-only
  const sb = await supabaseServer();

  const [invRes, itemsRes, custRes] = await Promise.all([
    sb
      .from('invoices')
      .select('id,customer_id,job_id,number,issue_date,status,tax,deposit')
      .order('id', { ascending: false }),
    sb.from('invoice_items').select('invoice_id,description,qty,unit_price'),
    sb.from('customers').select('id,name,address,phone,email').order('name'),
  ]);
  logQueryError('invoices.page.invoices', invRes.error);
  logQueryError('invoices.page.invoice_items', itemsRes.error);
  logQueryError('invoices.page.customers', custRes.error);

  const invRows = invRes.data;
  const itemRows = itemsRes.data;
  const custRows = custRes.data;

  const itemsByInvoice = new Map<number, InvoiceItem[]>();
  for (const it of itemRows ?? []) {
    const arr = itemsByInvoice.get(it.invoice_id) ?? [];
    arr.push({ description: it.description, qty: Number(it.qty), unit_price: Number(it.unit_price) });
    itemsByInvoice.set(it.invoice_id, arr);
  }

  const invoices = buildInvoices(
    (invRows ?? []) as InvoiceRow[],
    itemsByInvoice,
    (custRows ?? []) as InvoiceCustomer[]
  );
  const customers: InvoiceCustomerFull[] = (custRows ?? []).map(c => ({
    id: c.id, name: c.name, address: c.address, phone: c.phone, email: c.email,
  }));

  const isNew = newParam === '1';
  const selected = iParam ? invoices.find(v => v.id === Number(iParam)) ?? null : null;

  return (
    <>
      <InvoicesTable invoices={invoices} />
      {(isNew || selected) && (
        <InvoiceDrawer key={selected?.id ?? 'new'} invoice={selected} isNew={isNew && !selected} customers={customers} />
      )}
    </>
  );
}
