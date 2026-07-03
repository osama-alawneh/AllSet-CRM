import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildLeads, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { KanbanBoard } from '@/components/leads/KanbanBoard';

export default async function LeadsPage() {
  const role = await getRole();
  if (role !== 'admin' && role !== 'rep') redirect('/dashboard');
  const admin = role === 'admin';
  const sb = await supabaseServer();

  const { data: lp } = await sb
    .from('leads_public')
    .select('id,customer_id,status,service,stories,panes,note')
    .order('id');
  const { data: cs } = await sb.from('customers').select('id,name,address,phone,email,lat,lng');

  let quoteById: Map<number, number> | null = null;
  if (admin) {
    const { data: base } = await sb.from('leads').select('id,quote_value');
    quoteById = new Map((base ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById);

  return <KanbanBoard leads={leads} admin={admin} canEdit={true} />;
}
