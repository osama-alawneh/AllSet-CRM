import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { ExpensesSection, type ExpenseRow } from '@/components/expenses/ExpensesSection';

export default async function ExpensesPage() {
  const role = await getRole();
  if (role !== 'admin' && role !== 'rep') redirect('/dashboard'); // money is admin/rep only
  const sb = await supabaseServer();

  const { data, error } = await sb
    .from('expenses')
    .select('id,label,amount,spent_on,job_id,source,created_at')
    .order('spent_on', { ascending: false })
    .order('id', { ascending: false });
  logQueryError('expenses.page.expenses', error);

  const rows = (data ?? []) as ExpenseRow[];

  return <ExpensesSection rows={rows} />;
}
