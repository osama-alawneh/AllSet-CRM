import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

// TEMPORARY latency probe (perf/latency-probe branch, preview only). Runs the same work
// a page render does, one phase at a time, and reports the milliseconds for each so the
// cost lands in a response body instead of sampled runtime logs.
export async function GET() {
  if (process.env.PERF_LOG !== '1') return new NextResponse('disabled', { status: 404 });

  const t: Record<string, number> = {};
  const clock = async <T,>(k: string, fn: () => PromiseLike<T>): Promise<T> => {
    const t0 = performance.now();
    const r = await fn();
    t[k] = Math.round(performance.now() - t0);
    return r;
  };

  const start = performance.now();
  const sb = await clock('supabaseServer', async () => supabaseServer());

  const user = await clock('auth.getUser', () => sb.auth.getUser());
  const uid = user.data.user?.id;
  if (!uid) return NextResponse.json({ error: 'no session', t });

  await clock('auth.roleQuery', () => sb.from('profiles').select('role').eq('id', uid).single());

  // Five identical trivial queries back to back. If only the first is slow, the cost is
  // connection/TLS setup rather than the query; if all five are slow, it is per-request
  // overhead on the Supabase edge.
  for (let i = 0; i < 5; i++) {
    await clock(`trivial${i}`, () => sb.from('profiles').select('id').limit(1));
  }

  // Same request bypassing supabase-js, straight at PostgREST, to separate client overhead
  // from network+server time.
  const restUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  for (let i = 0; i < 3; i++) {
    await clock(`rawFetch${i}`, () => fetch(restUrl, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((r) => r.text()));
  }

  await clock('dashboard.batch', () =>
    Promise.all([
      sb.from('jobs').select('id,customer_id,lead_id,status,claimed_by,scheduled_date,service,description,created_at,updated_at,price').is('deleted_at', null).order('id'),
      sb.from('customers').select('id,name,address,phone,email,lat,lng'),
      sb.from('profiles').select('id,full_name'),
      sb.from('leads_public').select('id,customer_id,status,service,description,stories,panes,note,created_at,updated_at,rep_id').order('id'),
      sb.from('invoices').select('id,status,issue_date'),
      sb.from('invoice_items').select('invoice_id,qty,unit_price'),
      sb.from('cleaner_earnings').select('cleaner_id,job_id,done_at,share'),
      sb.from('company_revenue').select('month,job_revenue,expenses,net'),
      sb.from('dots').select('id,lat,lng,label,notes,status').order('id'),
    ]),
  );

  t.totalServerWork = Math.round(performance.now() - start);
  return NextResponse.json({ t, uptimeSec: Math.round(process.uptime()), region: process.env.VERCEL_REGION });
}
