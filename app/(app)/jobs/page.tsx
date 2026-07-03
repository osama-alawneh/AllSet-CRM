import { redirect } from 'next/navigation';
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildJobs, visibleJobs, type JobRow, type JobCustomer } from '@/lib/jobs';
import { JobsBoard } from '@/components/jobs/JobsBoard';
import { JobDrawer } from '@/components/jobs/JobDrawer';

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const { j: jParam } = await searchParams;
  const user = await getSession();
  if (!user) redirect('/login');
  const role = await getRole();
  if (!role) redirect('/login');
  const uid = user.id;
  const admin = role === 'admin';
  const sb = await supabaseServer();

  // Role-split fetch: admins read base jobs (incl. price); everyone else reads the
  // jobs_public view (no price column — money stays server-side).
  let jobRows: JobRow[] = [];
  let priceById: Map<number, number> | null = null;
  if (admin) {
    const { data } = await sb
      .from('jobs')
      .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,price')
      .order('id');
    const rows = data ?? [];
    jobRows = rows.map(r => ({
      id: r.id,
      customer_id: r.customer_id,
      lead_id: r.lead_id,
      status: r.status,
      claimed_by: r.claimed_by,
      scheduled_date: r.scheduled_date,
      service: r.service,
    }));
    priceById = new Map(rows.map(r => [r.id, Number(r.price ?? 0)]));
  } else {
    const { data } = await sb
      .from('jobs_public')
      .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service')
      .order('id');
    jobRows = (data ?? []) as JobRow[];
  }

  const { data: cs } = await sb.from('customers').select('id,name,address,phone,email');
  const { data: ps } = await sb.from('profiles').select('id,full_name');
  const names = new Map((ps ?? []).map(p => [p.id as string, p.full_name as string]));

  const all = buildJobs(jobRows, (cs ?? []) as JobCustomer[], priceById, names);
  const visible = visibleJobs(role, uid, all);
  const meName = names.get(uid) ?? '';
  // Resolve the drawer THROUGH visibleJobs: a cleaner deep-linking to a foreign job
  // (?j=<id> not in their visible set) must render no drawer.
  const selected = jParam ? visible.find(j => j.id === Number(jParam)) ?? null : null;

  return (
    <>
      <JobsBoard jobs={visible} role={role} uid={uid} meName={meName} admin={admin} />
      {selected && <JobDrawer job={selected} role={role} uid={uid} admin={admin} />}
    </>
  );
}
