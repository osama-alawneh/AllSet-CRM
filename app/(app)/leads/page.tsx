import { redirect } from 'next/navigation';
import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
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

  const [lpRes, csRes, baseRes] = await Promise.all([
    sb
      .from('leads_public')
      .select('id,customer_id,status,service,description,stories,panes,note,created_at,updated_at')
      .order('id'),
    sb.from('customers').select('id,name,address,phone,email,lat,lng'),
    admin ? sb.from('leads').select('id,quote_value') : Promise.resolve({ data: null, error: null }),
  ]);
  logQueryError('leads.page.leads_public', lpRes.error);
  logQueryError('leads.page.customers', csRes.error);
  logQueryError('leads.page.leads', baseRes.error);

  const lp = lpRes.data;
  const cs = csRes.data;

  let quoteById: Map<number, number> | null = null;
  if (admin) {
    quoteById = new Map((baseRes.data ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById);
  const selected = lParam ? leads.find(l => l.id === Number(lParam)) ?? null : null;
  const customerOptions = (cs ?? []).map(c => ({ id: c.id, name: c.name, phone: c.phone, address: c.address }));

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
