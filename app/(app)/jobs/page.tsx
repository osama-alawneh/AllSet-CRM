import { redirect } from 'next/navigation';
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { buildJobs, visibleJobs, type JobRow, type JobCustomer } from '@/lib/jobs';
import { JobsBoard } from '@/components/jobs/JobsBoard';
import { JobsListSection } from '@/components/jobs/JobsListSection';
import { JobDrawer } from '@/components/jobs/JobDrawer';

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string; new?: string; view?: string }>;
}) {
  const { j: jParam, new: newParam, view } = await searchParams;
  const list = view === 'list';
  const user = await getSession();
  if (!user) redirect('/login');
  const role = await getRole();
  if (!role) redirect('/login');
  const uid = user.id;
  const admin = role === 'admin';
  const isNew = newParam === '1' && admin; // only admins create jobs
  const sb = await supabaseServer();

  // Role-split fetch: admins read base jobs (incl. price); everyone else reads the
  // jobs_public view (no price column — money stays server-side).
  const jobsQuery = admin
    ? sb
        .from('jobs')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,price')
        .order('id')
    : sb
        .from('jobs_public')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at')
        .order('id');

  const [jobsRes, csRes, psRes] = await Promise.all([
    jobsQuery,
    sb.from('customers').select('id,name,address,phone,email'),
    sb.from('profiles').select('id,full_name'),
  ]);
  logQueryError('jobs.page.jobs', jobsRes.error);
  logQueryError('jobs.page.customers', csRes.error);
  logQueryError('jobs.page.profiles', psRes.error);

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

  const cs = csRes.data;
  const ps = psRes.data;
  const names = new Map((ps ?? []).map(p => [p.id as string, p.full_name as string]));

  const all = buildJobs(jobRows, (cs ?? []) as JobCustomer[], priceById, names);
  const visible = visibleJobs(role, uid, all);
  const meName = names.get(uid) ?? '';
  // Resolve the drawer THROUGH visibleJobs: a cleaner deep-linking to a foreign job
  // (?j=<id> not in their visible set) must render no drawer.
  const selected = jParam ? visible.find(j => j.id === Number(jParam)) ?? null : null;

  // Origin-lead quick view for the open job: admins read base `leads` (incl. quote_value);
  // everyone else reads leads_public (money structurally absent).
  let leadDetail = null;
  if (selected?.lead_id != null) {
    if (admin) {
      const { data: ld, error } = await sb
        .from('leads')
        .select('stories,panes,note,description,quote_value')
        .eq('id', selected.lead_id)
        .single();
      logQueryError('jobs.page.leadDetail', error);
      leadDetail = ld ? { ...ld, quote_value: Number(ld.quote_value ?? 0) } : null;
    } else {
      const { data: ld, error } = await sb
        .from('leads_public')
        .select('stories,panes,note,description')
        .eq('id', selected.lead_id)
        .single();
      logQueryError('jobs.page.leadDetail', error);
      leadDetail = ld ? { ...ld, quote_value: null } : null; // money structurally absent for non-admins
    }
  }
  const customerOptions = (cs ?? []).map(c => ({ id: c.id, name: c.name }));

  return (
    <>
      {list ? (
        <JobsListSection jobs={visible} admin={admin} />
      ) : (
        <JobsBoard jobs={visible} role={role} uid={uid} meName={meName} admin={admin} />
      )}
      {(selected || isNew) && (
        <JobDrawer
          key={selected?.id ?? 'new'}
          job={selected} role={role} uid={uid} admin={admin}
          isNew={isNew && !selected} customers={customerOptions} leadDetail={leadDetail}
          backTo={list ? '/jobs?view=list' : '/jobs'}
        />
      )}
    </>
  );
}
