import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { ExpensesSection, type ExpenseRow } from '@/components/expenses/ExpensesSection';
import type { JobOption } from '@/components/expenses/JobLookup';

export default async function ExpensesPage() {
  const role = await getRole();
  if (role !== 'admin' && role !== 'rep') redirect('/dashboard'); // money is admin/rep only
  const sb = await supabaseServer();

  const [expensesRes, jobsRes, customersRes] = await Promise.all([
    sb
      .from('expenses')
      .select('id,label,amount,spent_on,job_id,source,created_at')
      .order('spent_on', { ascending: false })
      .order('id', { ascending: false }),
    // Page is admin/rep-gated, so base-table reads (bypassing the customer-facing jobs
    // view) are fine here — this is just building the JobLookup combobox options.
    sb.from('jobs').select('id,customer_id').is('deleted_at', null).order('id', { ascending: false }),
    sb.from('customers').select('id,name,address'),
  ]);
  logQueryError('expenses.page.expenses', expensesRes.error);
  logQueryError('expenses.page.jobs', jobsRes.error);
  logQueryError('expenses.page.customers', customersRes.error);

  const rows = (expensesRes.data ?? []) as ExpenseRow[];

  const customersById = new Map(
    (customersRes.data ?? []).map(c => [c.id as number, c as { id: number; name: string | null; address: string | null }]),
  );
  const jobOptions: JobOption[] = (jobsRes.data ?? []).map(j => {
    const c = customersById.get(j.customer_id as number);
    return {
      id: j.id as number,
      label: `#${String(j.id).padStart(4, '0')} — ${c?.name ?? '—'}, ${c?.address ?? '—'}`,
    };
  });

  return <ExpensesSection rows={rows} jobOptions={jobOptions} />;
}
