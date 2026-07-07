import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { CustomersTable } from '@/components/customers/CustomersTable';
import {
  CustomerDrawer,
  type DrawerCustomer,
  type DrawerJob,
  type DrawerLead,
  type DrawerInvoice,
} from '@/components/customers/CustomerDrawer';
import type { CustomerRow } from '@/lib/customers';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string }>;
}) {
  const { c: cParam, new: newParam } = await searchParams;
  const role = await getRole();
  const admin = role === 'admin';
  const sb = await supabaseServer();

  const { data: customers } = await sb
    .from('customers')
    .select('id,name,phone,email,address,type,notes')
    .order('name');
  const { data: jobRows } = await sb.from('jobs_public').select('customer_id');
  const { data: invRows } = admin ? await sb.from('invoices').select('customer_id') : { data: null };

  const jobCount = new Map<number, number>();
  for (const j of jobRows ?? []) jobCount.set(j.customer_id, (jobCount.get(j.customer_id) ?? 0) + 1);
  const invCount = new Map<number, number>();
  for (const i of invRows ?? []) invCount.set(i.customer_id, (invCount.get(i.customer_id) ?? 0) + 1);

  const rows: CustomerRow[] = (customers ?? []).map(cu => ({
    ...cu,
    jobs: jobCount.get(cu.id) ?? 0,
    invoices: admin ? (invCount.get(cu.id) ?? 0) : null,
  }));

  // drawer data
  const isNew = newParam === '1' && role !== 'cleaner'; // create is admin+rep (RLS 0005); cleaners get no form
  const cid = cParam ? Number(cParam) : null;
  let drawerCustomer: DrawerCustomer | null = null;
  let drawerJobs: DrawerJob[] = [];
  let drawerLeads: DrawerLead[] = [];
  let drawerInvoices: DrawerInvoice[] | null = admin ? [] : null;

  if (cid && Number.isFinite(cid)) {
    drawerCustomer = rows.find(r => r.id === cid) ?? null;
    if (drawerCustomer) {
      const { data: js } = await sb
        .from('jobs_public')
        .select('id,service,status,scheduled_date')
        .eq('customer_id', cid)
        .order('id', { ascending: false });
      drawerJobs = js ?? [];
      const { data: ls } = await sb
        .from('leads_public')
        .select('id,service,status')
        .eq('customer_id', cid)
        .order('id', { ascending: false });
      drawerLeads = ls ?? [];
      if (admin) {
        const { data: is } = await sb
          .from('invoices')
          .select('id,number,issue_date,status,invoice_items(qty,unit_price)')
          .eq('customer_id', cid)
          .order('id', { ascending: false });
        drawerInvoices = (is ?? []).map(i => ({
          id: i.id,
          number: i.number,
          issue_date: i.issue_date,
          status: i.status,
          total: (i.invoice_items ?? []).reduce(
            (s: number, it: { qty: number; unit_price: number }) => s + it.qty * it.unit_price,
            0
          ),
        }));
      }
    }
  }

  return (
    <>
      <CustomersTable rows={rows} admin={admin} />
      {(isNew || drawerCustomer) && role && (
        <CustomerDrawer
          key={drawerCustomer?.id ?? 'new'}
          customer={drawerCustomer}
          jobs={drawerJobs}
          leads={drawerLeads}
          invoices={drawerInvoices}
          role={role}
          isNew={isNew}
        />
      )}
    </>
  );
}
