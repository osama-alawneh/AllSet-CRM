'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { parseInvoiceForm } from '@/lib/invoices';

// Save an invoice header + its line items. id === null → create (number/issue_date/status
// defaults fill from the DB; 0012 sets number = INV-<nextval>). Authorization is the
// invoices_admin / items_admin FOR ALL RLS policies (0002) — a non-admin's writes are
// rejected (insert: 42501; update: 0 rows).
//
// NOT ATOMIC (accepted MVP risk): header write → delete all items → re-insert items. If the
// process dies between the delete and the insert, the invoice keeps its header but loses its
// items; an admin can simply re-save. A transaction/RPC would remove this risk — out of scope.
export async function saveInvoice(id: number | null, fd: FormData): Promise<{ error?: string }> {
  const parsed = parseInvoiceForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const { customer_id, status, items } = parsed.value;
  const sb = await supabaseServer();

  let invoiceId = id;
  if (id === null) {
    const { data, error } = await sb
      .from('invoices')
      .insert({ customer_id, status })
      .select('id')
      .single();
    if (error) return { error: error.message };
    invoiceId = data.id;
  } else {
    const { data, error } = await sb
      .from('invoices')
      .update({ customer_id, status })
      .eq('id', id)
      .select('id');
    if (error) return { error: error.message };
    if (!data?.length) return { error: 'Save failed: not permitted or invoice not found' };
  }

  const { error: delErr } = await sb.from('invoice_items').delete().eq('invoice_id', invoiceId);
  if (delErr) return { error: delErr.message };
  const { error: insErr } = await sb.from('invoice_items').insert(
    items.map(it => ({
      invoice_id: invoiceId,
      description: it.description,
      qty: it.qty,
      unit_price: it.unit_price,
    }))
  );
  if (insErr) return { error: insErr.message };

  revalidatePath('/invoices');
  revalidatePath('/customers');
  revalidatePath('/dashboard');
  if (id === null) redirect(`/invoices?i=${invoiceId}`);
  return {};
}
