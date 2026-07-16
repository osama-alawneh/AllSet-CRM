import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { buildLeads, type LeadPublicRow, type CustomerGeo } from '@/lib/leads';
import { buildJobs, visibleJobs, buildMembers, type JobRow, type JobCustomer, type JobMember } from '@/lib/jobs';
import { resolveMonth, monthWindow, bucketByDay, type CalEntry } from '@/lib/calendar';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { LeadDrawer } from '@/components/leads/LeadDrawer';
import { JobDrawer, type LeadDetail } from '@/components/jobs/JobDrawer';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; l?: string; j?: string }>;
}) {
  const { m: mParam, l: lParam, j: jParam } = await searchParams;
  const month = resolveMonth(mParam, new Date());
  const { from, to } = monthWindow(month);
  const user = await getSession();
  const uid = user?.id ?? '';
  const role = await getRole();
  const admin = role === 'admin';
  const canReadMoney = admin || role === 'rep';
  const showLeads = canReadMoney; // leads layer is admin/rep (matches /leads nav gating)
  const sb = await supabaseServer();

  // Month-scoped, role-split jobs (same shape as jobs/map pages; done INCLUDED
  // — the calendar doubles as history; deleted excluded; unscheduled absent by
  // the gte filter). timestamptz vs day-string comparison is safe: ISO strings.
  const jobsQuery = canReadMoney
    ? sb
        .from('jobs')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,price,cleaner_amount,done_at,recur_days,recur_parent_id')
        .is('deleted_at', null)
        .gte('scheduled_date', from).lt('scheduled_date', to)
        .order('scheduled_date')
    : sb
        .from('jobs_public')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,cleaner_amount')
        .gte('scheduled_date', from).lt('scheduled_date', to)
        .order('scheduled_date');

  const [jobsRes, lpRes, csRes, baseRes, psRes, jmRes] = await Promise.all([
    jobsQuery,
    showLeads
      ? sb
          .from('leads_public')
          .select('id,customer_id,status,service,description,stories,panes,note,created_at,updated_at,rep_id')
          .gte('created_at', from).lt('created_at', to)
          .order('created_at')
      : Promise.resolve({ data: null, error: null }),
    sb.from('customers').select('id,name,address,phone,email,lat,lng,active'),
    // Quote map for the LeadDrawer (post-0029: admin AND rep read base leads).
    canReadMoney ? sb.from('leads').select('id,quote_value').is('deleted_at', null) : Promise.resolve({ data: null, error: null }),
    sb.from('profiles').select('id,full_name,role'),
    sb.from('job_members').select('id,job_id,cleaner_id,status,is_owner'),
  ]);
  logQueryError('calendar.page.jobs', jobsRes.error);
  logQueryError('calendar.page.leads_public', 'error' in lpRes ? lpRes.error : null);
  logQueryError('calendar.page.customers', csRes.error);
  logQueryError('calendar.page.leads', 'error' in baseRes ? baseRes.error : null);
  logQueryError('calendar.page.profiles', psRes.error);
  logQueryError('calendar.page.job_members', jmRes.error);

  const cs = csRes.data;
  const profiles = (psRes.data ?? []) as Array<{ id: string; full_name: string; role: string }>;
  const names = new Map(profiles.map(p => [p.id, p.full_name]));
  const reps = profiles
    .filter(p => p.role === 'admin' || p.role === 'rep')
    .map(p => ({ id: p.id, full_name: p.full_name }));

  let jobRows: JobRow[] = [];
  let priceById: Map<number, number> | null = null;
  if (canReadMoney) {
    const rows = (jobsRes.data ?? []) as Array<JobRow & { price: number | null; cleaner_amount: number | null; done_at: string | null; recur_days: number | null; recur_parent_id: number | null }>;
    jobRows = rows.map(r => ({
      id: r.id, customer_id: r.customer_id, lead_id: r.lead_id, status: r.status,
      claimed_by: r.claimed_by, scheduled_date: r.scheduled_date, service: r.service,
      description: r.description, created_at: r.created_at, updated_at: r.updated_at,
      cleaner_amount: r.cleaner_amount, done_at: r.done_at,
      recur_days: r.recur_days, recur_parent_id: r.recur_parent_id,
    }));
    priceById = new Map(rows.map(r => [r.id, Number(r.price ?? 0)]));
  } else {
    jobRows = (jobsRes.data ?? []) as JobRow[];
  }

  let quoteById: Map<number, number> | null = null;
  if (canReadMoney) {
    quoteById = new Map((baseRes.data ?? []).map(b => [b.id, Number(b.quote_value ?? 0)]));
  }

  const allJobs = buildJobs(jobRows, (cs ?? []) as JobCustomer[], priceById, names);
  const jobs = visibleJobs(role, uid, allJobs);
  const leads = buildLeads((lpRes.data ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], quoteById, names);
  const allMembers: JobMember[] = buildMembers(
    (jmRes.data ?? []) as Array<Omit<JobMember, 'cleaner_name'>>,
    names
  );

  // Maps don't cross the RSC boundary — serialize.
  const entries: Record<string, CalEntry[]> = Object.fromEntries(bucketByDay(jobs, leads));

  const backTo = `/calendar?m=${month}`;
  // ?l= wins over ?j= (map-page rule); cleaner deep links filter through visibleJobs.
  const selectedLead = lParam ? leads.find(l => l.id === Number(lParam)) ?? null : null;
  const selectedJob = !selectedLead && jParam ? jobs.find(j => j.id === Number(jParam)) ?? null : null;

  let leadDetail: LeadDetail | null = null;
  if (selectedJob?.lead_id != null) {
    if (admin) {
      const { data: ld, error } = await sb
        .from('leads')
        .select('stories,panes,note,description,quote_value')
        .eq('id', selectedJob.lead_id)
        .single();
      logQueryError('calendar.page.leadDetail', error);
      leadDetail = ld ? { ...ld, quote_value: Number(ld.quote_value ?? 0) } : null;
    } else {
      const { data: ld, error } = await sb
        .from('leads_public')
        .select('stories,panes,note,description')
        .eq('id', selectedJob.lead_id)
        .single();
      logQueryError('calendar.page.leadDetail', error);
      leadDetail = ld ? { ...ld, quote_value: null } : null; // money structurally absent for non-admins
    }
  }
  const customerOptions = ((cs ?? []) as Array<CustomerGeo & { active: boolean }>)
    .filter(c => c.active)
    .map(c => ({ id: c.id, name: c.name, phone: c.phone, address: c.address }));

  return (
    <section className="screen">
      <CalendarGrid month={month} entries={entries} showLeads={showLeads} />
      {selectedLead && (
        <LeadDrawer key={selectedLead.id} lead={selectedLead} admin={admin} money={canReadMoney} canEdit={canReadMoney} backTo={backTo} reps={reps} uid={uid} />
      )}
      {selectedJob && role && (
        <JobDrawer
          key={selectedJob.id}
          job={selectedJob} role={role} uid={uid} admin={admin}
          customers={customerOptions} leadDetail={leadDetail}
          members={allMembers.filter(m => m.job_id === selectedJob.id)}
          backTo={backTo}
        />
      )}
    </section>
  );
}
