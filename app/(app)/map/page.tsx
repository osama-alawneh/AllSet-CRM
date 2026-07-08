import { getRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { buildLeads, statusLabel, type Pin, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { MapView } from '@/components/map/MapView';
import { LeadDrawer } from '@/components/leads/LeadDrawer';

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string }>;
}) {
  const { l: lParam } = await searchParams;
  const role = await getRole();
  const admin = role === 'admin';
  const canCreate = role === 'admin' || role === 'rep';
  const sb = await supabaseServer();

  const [lpRes, csRes, baseRes] = await Promise.all([
    sb
      .from('leads_public')
      .select('id,customer_id,status,service,description,stories,panes,note,created_at,updated_at')
      .order('id'),
    sb.from('customers').select('id,name,address,phone,email,lat,lng'),
    admin ? sb.from('leads').select('id,quote_value') : Promise.resolve({ data: null, error: null }),
  ]);
  logQueryError('map.page.leads_public', lpRes.error);
  logQueryError('map.page.customers', csRes.error);
  logQueryError('map.page.leads', baseRes.error);

  const lp = lpRes.data;
  const cs = csRes.data;

  let quoteById: Map<number, number> | null = null;
  if (admin) {
    quoteById = new Map((baseRes.data ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById);
  const pins: Pin[] = leads
    .filter(l => l.lat != null && l.lng != null)
    .map(l => ({
      id: l.id,
      lat: l.lat as number,
      lng: l.lng as number,
      status: l.status,
      label: `${l.customer_name} — ${statusLabel[l.status]}`,
    }));

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null; // empty string → null
  const selected = lParam ? leads.find(l => l.id === Number(lParam)) ?? null : null;

  return (
    <section className="screen screen-fill">
      <MapView pins={pins} token={token} canCreate={canCreate} openLeadId={lParam ?? null} />
      {selected && <LeadDrawer key={selected.id} lead={selected} admin={admin} canEdit={canCreate} backTo="/map" />}
    </section>
  );
}
