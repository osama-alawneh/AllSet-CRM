import { redirect } from 'next/navigation';
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { logQueryError } from '@/lib/log';
import { buildJobs, visibleJobs, buildMembers, type JobRow, type JobCustomer, type JobMember } from '@/lib/jobs';
import { JobsBoard } from '@/components/jobs/JobsBoard';
import { JobsListSection } from '@/components/jobs/JobsListSection';
import { JobsHistorySection } from '@/components/jobs/JobsHistorySection';
import { type DeletedJob } from '@/components/jobs/JobsHistoryTable';
import { JobDrawer } from '@/components/jobs/JobDrawer';

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string; new?: string; view?: string; deleted?: string }>;
}) {
  const { j: jParam, new: newParam, view, deleted } = await searchParams;
  const list = view === 'list';
  const user = await getSession();
  if (!user) redirect('/login');
  const role = await getRole();
  if (!role) redirect('/login');
  const uid = user.id;
  const admin = role === 'admin';
  const canReadMoney = admin || role === 'rep';
  const isNew = newParam === '1' && canReadMoney; // admin + rep create jobs (spec: rep = admin on job money)
  const history = admin && deleted === '1'; // admin-only History view (0020); RPCs also block non-admins
  const sb = await supabaseServer();

  // Role-split fetch: admin/rep read base jobs (incl. price, cleaner_amount, done_at — rep
  // gains base-table read via the jobs_rep RLS policy, 0023: "rep = admin on job money");
  // cleaners read the jobs_public view (no price column — money stays server-side).
  const jobsQuery = canReadMoney
    ? sb
        .from('jobs')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,price,cleaner_amount,done_at')
        .is('deleted_at', null)
        .order('id')
    : sb
        .from('jobs_public')
        .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,cleaner_amount')
        .order('id');

  const [jobsRes, csRes, psRes, delRes, jmRes] = await Promise.all([
    jobsQuery,
    sb.from('customers').select('id,name,address,phone,email,active'),
    sb.from('profiles').select('id,full_name'),
    // History fetch: deliberately the ONE base-jobs read that does NOT exclude deleted_at —
    // it wants exactly the opposite set.
    history
      ? sb
          .from('jobs')
          .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,price,deleted_at')
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false })
      : Promise.resolve({ data: null, error: null }),
    // Members: world-readable to any logged-in role (job_members_read, 0023) — feeds the
    // JobDrawer members panel and the board's per-job pending-join badge.
    sb.from('job_members').select('id,job_id,cleaner_id,status,is_owner'),
  ]);
  logQueryError('jobs.page.jobs', jobsRes.error);
  logQueryError('jobs.page.customers', csRes.error);
  logQueryError('jobs.page.profiles', psRes.error);
  logQueryError('jobs.page.deleted', delRes.error);
  logQueryError('jobs.page.job_members', jmRes.error);

  let jobRows: JobRow[] = [];
  let priceById: Map<number, number> | null = null;
  if (canReadMoney) {
    const rows = (jobsRes.data ?? []) as Array<JobRow & { price: number | null; cleaner_amount: number | null; done_at: string | null }>;
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
      cleaner_amount: r.cleaner_amount,
      done_at: r.done_at,
    }));
    priceById = new Map(rows.map(r => [r.id, Number(r.price ?? 0)]));
  } else {
    jobRows = (jobsRes.data ?? []) as JobRow[];
  }

  const cs = csRes.data;
  const ps = psRes.data;
  const names = new Map((ps ?? []).map(p => [p.id as string, p.full_name as string]));
  const allMembers: JobMember[] = buildMembers(
    (jmRes.data ?? []) as Array<Omit<JobMember, 'cleaner_name'>>,
    names
  );
  // Per-job pending-join count for the board badge (Task 4 Step 4); plain object (not a
  // Map) so it crosses the Server -> Client Component boundary cleanly.
  const pendingByJob: Record<number, number> = {};
  for (const m of allMembers) {
    if (m.status === 'pending') pendingByJob[m.job_id] = (pendingByJob[m.job_id] ?? 0) + 1;
  }

  if (history) {
    const delRows = (delRes.data ?? []) as Array<JobRow & { price: number | null; deleted_at: string }>;
    const deletedAtById = new Map(delRows.map(r => [r.id, r.deleted_at]));
    const deletedPriceById = new Map(delRows.map(r => [r.id, Number(r.price ?? 0)]));
    const deletedJobs: DeletedJob[] = buildJobs(delRows, (cs ?? []) as JobCustomer[], deletedPriceById, names)
      .map(j => ({ ...j, deleted_at: deletedAtById.get(j.id) as string }));
    return <JobsHistorySection jobs={deletedJobs} />;
  }

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
  // Task 20: the lookup picker only offers active customers; `cs` itself stays unfiltered
  // above so existing jobs against a since-deactivated customer still resolve name/address.
  const customerOptions = (cs ?? [])
    .filter(c => c.active)
    .map(c => ({ id: c.id, name: c.name, phone: c.phone, address: c.address }));

  return (
    <>
      {list ? (
        <JobsListSection jobs={visible} admin={admin} money={canReadMoney} />
      ) : (
        <JobsBoard jobs={visible} role={role} uid={uid} meName={meName} admin={admin} money={canReadMoney} pendingByJob={pendingByJob} />
      )}
      {(selected || isNew) && (
        <JobDrawer
          key={selected?.id ?? 'new'}
          job={selected} role={role} uid={uid} admin={admin}
          isNew={isNew && !selected} customers={customerOptions} leadDetail={leadDetail}
          members={selected ? allMembers.filter(m => m.job_id === selected.id) : []}
          backTo={list ? '/jobs?view=list' : '/jobs'}
        />
      )}
    </>
  );
}
