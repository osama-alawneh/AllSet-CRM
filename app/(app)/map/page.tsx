import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { buildLeads, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { buildJobs, visibleJobs, type JobRow, type JobCustomer } from '@/lib/jobs';
import { buildMapPins } from '@/lib/mapPins';
import { MapView } from '@/components/map/MapView';
import { LeadDrawer } from '@/components/leads/LeadDrawer';
import { JobDrawer, type LeadDetail } from '@/components/jobs/JobDrawer';

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string; j?: string }>;
}) {
  const { l: lParam, j: jParam } = await searchParams;
  const user = await getSession();
  const uid = user?.id ?? '';
  const role = await getRole();
  const admin = role === 'admin';
  const canCreate = role === 'admin' || role === 'rep';
  const sb = await supabaseServer();

  // Role-split jobs fetch, same shape as app/(app)/jobs/page.tsx: admins read base
  // jobs (incl. price for the drawer); everyone else reads jobs_public (no price).
  const jobsQuery = admin
    ? sb
        .from('jobs')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,price')
        .order('id')
    : sb
        .from('jobs_public')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at')
        .order('id');

  const [lpRes, csRes, baseRes, jobsRes, psRes] = await Promise.all([
    sb
      .from('leads_public')
      .select('id,customer_id,status,service,description,stories,panes,note,created_at,updated_at')
      .order('id'),
    sb.from('customers').select('id,name,address,phone,email,lat,lng,active'),
    admin ? sb.from('leads').select('id,quote_value') : Promise.resolve({ data: null, error: null }),
    jobsQuery,
    sb.from('profiles').select('id,full_name'),
  ]);
  logQueryError('map.page.leads_public', lpRes.error);
  logQueryError('map.page.customers', csRes.error);
  logQueryError('map.page.leads', baseRes.error);
  logQueryError('map.page.jobs', jobsRes.error);
  logQueryError('map.page.profiles', psRes.error);

  const lp = lpRes.data;
  const cs = csRes.data;

  let quoteById: Map<number, number> | null = null;
  if (admin) {
    quoteById = new Map((baseRes.data ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  let jobRows: JobRow[] = [];
  let priceById: Map<number, number> | null = null;
  if (admin) {
    const rows = (jobsRes.data ?? []) as Array<JobRow & { price: number | null }>;
    jobRows = rows.map(r => ({
      id: r.id,
      customer_id: r.customer_id,
      lead_id: r.lead_id,
      status: r.status,
      claimed_by: r.claimed_by,
      scheduled_date: r.scheduled_date,
      service: r.service,
      description: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    priceById = new Map(rows.map(r => [r.id, Number(r.price ?? 0)]));
  } else {
    jobRows = (jobsRes.data ?? []) as JobRow[];
  }

  const names = new Map((psRes.data ?? []).map(p => [p.id as string, p.full_name as string]));
  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById);
  const allJobs = buildJobs(jobRows, (cs ?? []) as JobCustomer[], priceById, names);
  const jobs = visibleJobs(role, uid, allJobs);

  const geoByCustomer = new Map(
    ((cs ?? []) as CustomerGeo[]).map(c => [c.id, { lat: c.lat, lng: c.lng }])
  );
  const pins = buildMapPins(leads, jobs, geoByCustomer);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null; // empty string → null

  // ?l= wins over ?j= if both are present. Job resolution goes THROUGH visibleJobs:
  // a cleaner deep-linking to a foreign job gets no drawer.
  const selectedLead = lParam ? leads.find(l => l.id === Number(lParam)) ?? null : null;
  const selectedJob =
    !selectedLead && jParam ? jobs.find(j => j.id === Number(jParam)) ?? null : null;

  // Origin-lead quick view for the open job — mirrors app/(app)/jobs/page.tsx.
  let leadDetail: LeadDetail | null = null;
  if (selectedJob?.lead_id != null) {
    if (admin) {
      const { data: ld, error } = await sb
        .from('leads')
        .select('stories,panes,note,description,quote_value')
        .eq('id', selectedJob.lead_id)
        .single();
      logQueryError('map.page.leadDetail', error);
      leadDetail = ld ? { ...ld, quote_value: Number(ld.quote_value ?? 0) } : null;
    } else {
      const { data: ld, error } = await sb
        .from('leads_public')
        .select('stories,panes,note,description')
        .eq('id', selectedJob.lead_id)
        .single();
      logQueryError('map.page.leadDetail', error);
      leadDetail = ld ? { ...ld, quote_value: null } : null; // money structurally absent for non-admins
    }
  }
  // Task 20: the lookup picker only offers active customers; `cs` itself stays unfiltered
  // above so existing leads/jobs against a since-deactivated customer still resolve name/address.
  const customerOptions = ((cs ?? []) as Array<CustomerGeo & { active: boolean }>)
    .filter(c => c.active)
    .map(c => ({ id: c.id, name: c.name, phone: c.phone, address: c.address }));

  return (
    <section className="screen screen-fill">
      <MapView pins={pins} token={token} canCreate={canCreate} openLeadId={lParam ?? null} />
      {selectedLead && (
        <LeadDrawer key={selectedLead.id} lead={selectedLead} admin={admin} canEdit={canCreate} backTo="/map" />
      )}
      {selectedJob && role && (
        <JobDrawer
          key={selectedJob.id}
          job={selectedJob} role={role} uid={uid} admin={admin}
          customers={customerOptions} leadDetail={leadDetail}
          backTo="/map"
        />
      )}
    </section>
  );
}
