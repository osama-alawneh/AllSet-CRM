import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildLeads, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { KanbanBoard } from '@/components/leads/KanbanBoard';
import { LeadsListSection } from '@/components/leads/LeadsListSection';
import { LeadDrawer } from '@/components/leads/LeadDrawer';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string; new?: string; view?: string }>;
}) {
  const role = await getRole();
  if (role !== 'admin' && role !== 'rep') redirect('/dashboard');
  const { l: lParam, new: newParam, view } = await searchParams;
  const isNew = newParam === '1';
  const list = view === 'list';
  const backTo = list ? '/leads?view=list' : '/leads';
  const admin = role === 'admin';
  const sb = await supabaseServer();

  const { data: lp } = await sb
    .from('leads_public')
    .select('id,customer_id,status,service,description,stories,panes,note,created_at,updated_at')
    .order('id');
  const { data: cs } = await sb.from('customers').select('id,name,address,phone,email,lat,lng');

  let quoteById: Map<number, number> | null = null;
  if (admin) {
    const { data: base } = await sb.from('leads').select('id,quote_value');
    quoteById = new Map((base ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById);
  const selected = lParam ? leads.find(l => l.id === Number(lParam)) ?? null : null;
  const customerOptions = (cs ?? []).map(c => ({ id: c.id, name: c.name }));

  return (
    <>
      {list ? (
        <LeadsListSection leads={leads} admin={admin} canEdit={true} />
      ) : (
        <KanbanBoard leads={leads} admin={admin} canEdit={true} />
      )}
      {(selected || isNew) && (
        <LeadDrawer
          key={selected?.id ?? 'new'}
          lead={selected} admin={admin} canEdit={true} backTo={backTo}
          isNew={isNew && !selected} customers={customerOptions}
        />
      )}
    </>
  );
}
