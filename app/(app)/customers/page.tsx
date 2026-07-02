import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { CustomersTable } from '@/components/customers/CustomersTable';
import type { CustomerRow } from '@/lib/customers';

export default async function CustomersPage() {
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

  const rows: CustomerRow[] = (customers ?? []).map(c => ({
    ...c,
    jobs: jobCount.get(c.id) ?? 0,
    invoices: admin ? (invCount.get(c.id) ?? 0) : null,
  }));

  return <CustomersTable rows={rows} admin={admin} />;
}
