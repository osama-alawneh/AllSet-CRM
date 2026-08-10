import { redirect } from 'next/navigation';
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { buildLeads, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { resolveMonth, bucketByDay, type CalEntry } from '@/lib/calendar';
import { LeadsCalendarSection } from '@/components/leads/LeadsCalendarSection';
import { KanbanBoard } from '@/components/leads/KanbanBoard';
import { LeadsListSection } from '@/components/leads/LeadsListSection';
import { LeadsHistorySection } from '@/components/leads/LeadsHistorySection';
import { type DeletedLead } from '@/components/leads/LeadsHistoryTable';
import { LeadDrawer } from '@/components/leads/LeadDrawer';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string; new?: string; view?: string; deleted?: string; m?: string }>;
}) {
  const role = await getRole();
  if (role !== 'admin' && role !== 'rep') redirect('/dashboard');
  const { l: lParam, new: newParam, view, deleted, m: mParam } = await searchParams;
  const isNew = newParam === '1';
  const list = view === 'list';
  const cal = view === 'calendar';
  const month = resolveMonth(mParam, new Date());
  const backTo = cal ? `/leads?view=calendar&m=${month}` : list ? '/leads?view=list' : '/leads';
  const admin = role === 'admin';
  // Task 8 (0029's leads_rep policy widened base-leads SELECT + the money gate to
  // admin-or-rep): this page already redirects non-admin/rep above, so canReadMoney is
  // always true here — kept as an expression (not a literal `true`) for greppability
  // alongside the identical const on app/(app)/map/page.tsx.
  const canReadMoney = role === 'admin' || role === 'rep';
  const history = admin && deleted === '1'; // admin-only History view (0020); RPCs also block non-admins
  const user = await getSession();
  const uid = user?.id ?? '';
  const sb = await supabaseServer();

  const [lpRes, csRes, baseRes, delRes, psRes] = await Promise.all([
    sb
      .from('leads_public')
      .select('id,customer_id,status,service,description,stories,panes,note,created_at,updated_at,rep_id')
      .order('id'),
    sb.from('customers').select('id,name,address,phone,email,lat,lng,active'),
    // Base-leads quote read: unconditional — this page is admin/rep-only (redirect above)
    // and 0029's `leads_rep` policy now lets reps read base `leads` where not deleted.
    sb.from('leads').select('id,quote_value').is('deleted_at', null),
    // History fetch: deliberately the ONE base-leads read that does NOT exclude deleted_at —
    // it wants exactly the opposite set.
    history
      ? sb
          .from('leads')
          .select('id,customer_id,status,service,description,stories,panes,note,created_at,updated_at,quote_value,deleted_at,rep_id')
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false })
      : Promise.resolve({ data: null, error: null }),
    // Task 22: rep attribution — admin/rep profiles feed the LeadDrawer's Rep select; the
    // full id->name map (any role) resolves rep_name for the read view / history table.
    sb.from('profiles').select('id,full_name,role'),
  ]);
  logQueryError('leads.page.leads_public', lpRes.error);
  logQueryError('leads.page.customers', csRes.error);
  logQueryError('leads.page.leads', baseRes.error);
  logQueryError('leads.page.deleted', delRes.error);
  logQueryError('leads.page.profiles', psRes.error);

  const lp = lpRes.data;
  const cs = csRes.data;
  const profiles = (psRes.data ?? []) as Array<{ id: string; full_name: string; role: string }>;
  const repNames = new Map(profiles.map(p => [p.id, p.full_name]));
  const reps = profiles
    .filter(p => p.role === 'admin' || p.role === 'rep')
    .map(p => ({ id: p.id, full_name: p.full_name }));

  const quoteById: Map<number, number> = new Map((baseRes.data ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));

  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById, repNames);
  const selected = lParam ? leads.find(l => l.id === Number(lParam)) ?? null : null;
  // Task 20: the lookup picker only offers active customers; `cs` itself stays unfiltered
  // above so existing leads against a since-deactivated customer still resolve name/address.
  const customerOptions = (cs ?? [])
    .filter(c => c.active)
    .map(c => ({ id: c.id, name: c.name, phone: c.phone, address: c.address }));

  if (history) {
    const delRows = (delRes.data ?? []) as Array<LeadPublicRow & { quote_value: number | null; deleted_at: string }>;
    const deletedAtById = new Map(delRows.map(r => [r.id, r.deleted_at]));
    const deletedQuoteById = new Map(delRows.map(r => [r.id, Number(r.quote_value ?? 0)]));
    const deletedLeads: DeletedLead[] = buildLeads(delRows, (cs ?? []) as CustomerGeo[], deletedQuoteById, repNames)
      .map(l => ({ ...l, deleted_at: deletedAtById.get(l.id) as string }));
    return <LeadsHistorySection leads={deletedLeads} />;
  }

  return (
    <>
      {cal ? (
        <LeadsCalendarSection
          leads={leads} month={month}
          // Maps don't cross the RSC boundary — serialize. Buckets cover every month in the
          // already-fetched set; the grid renders only the requested one. No extra query.
          entries={Object.fromEntries(bucketByDay([], leads)) as Record<string, CalEntry[]>}
          admin={admin} money={canReadMoney} canEdit={true}
        />
      ) : list ? (
        <LeadsListSection leads={leads} admin={admin} money={canReadMoney} canEdit={true} />
      ) : (
        <KanbanBoard leads={leads} admin={admin} money={canReadMoney} canEdit={true} />
      )}
      {(selected || isNew) && (
        <LeadDrawer
          key={selected?.id ?? 'new'}
          lead={selected} admin={admin} money={canReadMoney} canEdit={true} backTo={backTo}
          isNew={isNew && !selected} customers={customerOptions}
          reps={reps} uid={uid}
        />
      )}
    </>
  );
}
