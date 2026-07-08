import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
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
  searchParams: Promise<{ c?: string; new?: string; inactive?: string }>;
}) {
  const { c: cParam, new: newParam, inactive: inactiveParam } = await searchParams;
  const role = await getRole();
  const admin = role === 'admin';
  // Owner request 2026-07-08 (#3, soft deactivation): default list is active-only; admin can
  // flip to the inactive-only list via ?inactive=1 (same pattern as the jobs/leads ?view= param).
  // Non-admins never see the inactive list regardless of the query string.
  const showInactive = admin && inactiveParam === '1';
  const sb = await supabaseServer();

  const [customersRes, jobRowsRes, invRowsRes] = await Promise.all([
    sb
      .from('customers')
      .select('id,name,phone,email,address,type,notes,active')
      .eq('active', !showInactive)
      .order('name'),
    sb.from('jobs_public').select('customer_id'),
    admin ? sb.from('invoices').select('customer_id') : Promise.resolve({ data: null, error: null }),
  ]);
  logQueryError('customers.page.customers', customersRes.error);
  logQueryError('customers.page.jobs', jobRowsRes.error);
  logQueryError('customers.page.invoices', invRowsRes.error);

  const customers = customersRes.data;
  const jobRows = jobRowsRes.data;
  const invRows = invRowsRes.data;

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
  const backTo = showInactive ? '/customers?inactive=1' : '/customers'; // close() returns to the list you came from
  const isNew = newParam === '1' && role !== 'cleaner'; // create is admin+rep (RLS 0005); cleaners get no form
  const cid = cParam ? Number(cParam) : null;
  let drawerCustomer: DrawerCustomer | null = null;
  let drawerJobs: DrawerJob[] = [];
  let drawerLeads: DrawerLead[] = [];
  let drawerInvoices: DrawerInvoice[] | null = admin ? [] : null;

  if (cid && Number.isFinite(cid)) {
    drawerCustomer = rows.find(r => r.id === cid) ?? null;
    if (drawerCustomer) {
      const { data: js, error: jsErr } = await sb
        .from('jobs_public')
        .select('id,service,status,scheduled_date')
        .eq('customer_id', cid)
        .order('id', { ascending: false });
      logQueryError('customers.page.drawerJobs', jsErr);
      drawerJobs = js ?? [];
      const { data: ls, error: lsErr } = await sb
        .from('leads_public')
        .select('id,service,status')
        .eq('customer_id', cid)
        .order('id', { ascending: false });
      logQueryError('customers.page.drawerLeads', lsErr);
      drawerLeads = ls ?? [];
      if (admin) {
        const { data: is, error: isErr } = await sb
          .from('invoices')
          .select('id,number,issue_date,status,invoice_items(qty,unit_price)')
          .eq('customer_id', cid)
          .order('id', { ascending: false });
        logQueryError('customers.page.drawerInvoices', isErr);
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
      <CustomersTable rows={rows} admin={admin} canCreate={role !== 'cleaner'} showInactive={showInactive} />
      {(isNew || drawerCustomer) && role && (
        <CustomerDrawer
          key={drawerCustomer?.id ?? 'new'}
          customer={drawerCustomer}
          jobs={drawerJobs}
          leads={drawerLeads}
          invoices={drawerInvoices}
          role={role}
          isNew={isNew}
          backTo={backTo}
        />
      )}
    </>
  );
}
