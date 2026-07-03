import { redirect } from 'next/navigation';
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { buildJobs, visibleJobs, type JobRow, type JobCustomer } from '@/lib/jobs';
import { buildLeads, statusLabel, type LeadPublicRow, type CustomerGeo, type Pin } from '@/lib/leads';
import {
  revenueMTD, overdueTotal, chartBuckets14d, jobsThisWeek, winRate,
  type RevenueInvoice, type WeekJob, type WinLead,
} from '@/lib/dashboard';
import { fmtMoney } from '@/lib/invoices';
import { KpiCountUp } from '@/components/dashboard/KpiCountUp';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import { ClaimableJobs, type ClaimableJob } from '@/components/dashboard/ClaimableJobs';
import { MiniMap } from '@/components/dashboard/MiniMap';

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect('/login');
  const role = await getRole();
  if (!role) redirect('/login');
  const uid = user.id;
  const admin = role === 'admin';
  const sb = await supabaseServer();
  const now = new Date(); // server "today"; all metrics compare YYYY-MM-DD (UTC-normalized)

  // ---- everyone: jobs (role-split price), leads (win rate + pins), customers ----
  let jobRows: JobRow[] = [];
  let priceById: Map<number, number> | null = null;
  if (admin) {
    const { data } = await sb
      .from('jobs')
      .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,price')
      .order('id');
    const rows = data ?? [];
    jobRows = rows.map(r => ({
      id: r.id, customer_id: r.customer_id, lead_id: r.lead_id, status: r.status,
      claimed_by: r.claimed_by, scheduled_date: r.scheduled_date, service: r.service,
    }));
    priceById = new Map(rows.map(r => [r.id, Number(r.price ?? 0)]));
  } else {
    const { data } = await sb
      .from('jobs_public')
      .select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service')
      .order('id');
    jobRows = (data ?? []) as JobRow[];
  }

  const { data: cs } = await sb.from('customers').select('id,name,address,phone,email,lat,lng');
  const { data: ps } = await sb.from('profiles').select('id,full_name');
  const names = new Map((ps ?? []).map(p => [p.id as string, p.full_name as string]));
  const jobs = buildJobs(jobRows, (cs ?? []) as JobCustomer[], priceById, names);
  const visible = visibleJobs(role, uid, jobs);
  const claimable: ClaimableJob[] = visible
    .filter(j => j.status === 'unclaimed')
    .slice(0, 3)
    .map(j => ({ id: j.id, customer_name: j.customer_name, address: j.address, service: j.service, price: j.price }));
  const jpw = jobsThisWeek(jobs as WeekJob[], now);

  const { data: lp } = await sb
    .from('leads_public')
    .select('id,customer_id,status,service,stories,panes,note')
    .order('id');
  const leads = buildLeads((lp ?? []) as LeadPublicRow[], (cs ?? []) as CustomerGeo[], null);
  const wr = Math.round(winRate(leads as WinLead[]) * 100);
  const pins: Pin[] = leads
    .filter(l => l.lat != null && l.lng != null)
    .map(l => ({
      id: l.id, lat: l.lat as number, lng: l.lng as number, status: l.status,
      label: `${l.customer_name} — ${statusLabel[l.status]}`,
    }));

  // ---- admin-only money (non-admins NEVER fetch invoices or receive these values) ----
  let revenue = 0, overdue = 0, chart: number[] = [];
  if (admin) {
    const { data: invRows } = await sb.from('invoices').select('id,status,issue_date');
    const { data: itemRows } = await sb.from('invoice_items').select('invoice_id,qty,unit_price');
    const totalById = new Map<number, number>();
    for (const it of itemRows ?? []) {
      totalById.set(it.invoice_id, (totalById.get(it.invoice_id) ?? 0) + Number(it.qty) * Number(it.unit_price));
    }
    const rev: RevenueInvoice[] = (invRows ?? []).map(i => ({
      status: i.status, issue_date: i.issue_date, total: totalById.get(i.id) ?? 0,
    }));
    revenue = revenueMTD(rev, now);
    overdue = overdueTotal(rev, now);
    chart = chartBuckets14d(rev, now);
  }

  return (
    <section className="screen">
      <div className="kpis">
        {admin && (
          <div className="kpi box">
            <span className="tag">▚ ADMIN</span>
            <div className="lbl">Revenue · MTD</div>
            <div className="val"><KpiCountUp end={revenue} format={n => fmtMoney(Math.round(n))} /></div>
            <div className="sub up">▲ paid this month</div>
          </div>
        )}
        <div className="kpi box">
          <span className="tag">wk</span>
          <div className="lbl">Jobs / week</div>
          <div className="val"><KpiCountUp end={jpw} /></div>
          <div className="sub up">▲ scheduled 7d</div>
        </div>
        <div className="kpi box">
          <span className="tag">%</span>
          <div className="lbl">Win rate</div>
          <div className="val"><KpiCountUp end={wr} suffix="%" /></div>
          <div className="sub up">▲ lead → won</div>
        </div>
        {admin && (
          <div className="kpi box">
            <span className="tag">$</span>
            <div className="lbl">Overdue invoices</div>
            <div className="val"><KpiCountUp end={overdue} format={n => fmtMoney(Math.round(n))} /></div>
            <div className="sub bad">● sent &gt; 30d</div>
          </div>
        )}
      </div>

      <div className="grid2">
        <div className="panel box">
          <h3>Revenue / 14D</h3>
          <p className="cap">daily · USD{admin ? ' · admin view' : ''}</p>
          {admin ? (
            <RevenueChart data={chart} />
          ) : (
            <div
              className="money-hidden"
              style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 22 }}
            >
              •••••
            </div>
          )}
        </div>
        <div className="panel box">
          <h3>Claimable jobs</h3>
          <p className="cap">claim = lock</p>
          <ClaimableJobs jobs={claimable} />
        </div>
      </div>

      <div className="panel box">
        <h3>Neighborhood snapshot</h3>
        <p className="cap">tap to open full map →</p>
        <MiniMap pins={pins} />
        <div className="legend">
          <span><i className="lg" style={{ background: 'var(--won)' }} /> WON</span>
          <span><i className="lg" style={{ background: 'var(--follow)' }} /> FOLLOW-UP</span>
          <span><i className="lg" style={{ background: 'var(--lost)' }} /> LOST</span>
          <span><i className="lg" style={{ background: 'var(--new)' }} /> NEW</span>
        </div>
      </div>
    </section>
  );
}
