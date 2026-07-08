'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { jobStatusLabel, jobStatusColor, dayTime, type Job } from '@/lib/jobs';
import { filterJobs } from '@/lib/search';
import { restoreJob } from '@/app/(app)/jobs/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

// Admin-only History view (0020): same markup as JobsListTable (Customer/Service/Date/
// Status/Claimed by/Price), plus Deleted + Restore. Rows are read-only — no drawer
// click-through, since editing/status/claim RPCs are closed to a soft-deleted row until
// it's restored.
export type DeletedJob = Job & { deleted_at: string };

export function JobsHistoryTable({ jobs }: { jobs: DeletedJob[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const shown = filterJobs(jobs, q) as DeletedJob[];

  const restore = (id: number) => {
    setRowError(null);
    startTransition(async () => {
      const res = await restoreJob(id);
      if (res?.error) setRowError({ id, message: res.error });
      else router.refresh();
    });
  };

  return (
    <div className="panel box">
      <input
        placeholder="🔍 filter deleted jobs…" style={{ width: 220, marginBottom: 12 }}
        value={q} onChange={e => setQ(e.target.value)} aria-label="Filter deleted jobs"
      />
      <div className="tblwrap">
        <table className="tbl" aria-label="Deleted jobs">
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">Customer</th><th scope="col">Service</th><th scope="col">Date</th>
              <th scope="col">Status</th><th scope="col">Claimed by</th><th scope="col">Price</th>
              <th scope="col">Deleted</th><th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(j => (
              <tr key={j.id}>
                <td>{j.id}</td>
                <td><b>{j.customer_name}</b><br /><small style={{ color: 'var(--muted)' }}>{j.address ?? '—'}</small></td>
                <td>{j.service ?? 'TBD'}</td>
                <td>{j.scheduled_date ? dayTime(j.scheduled_date) : 'TBD'}</td>
                <td><span className="badge" style={{ background: 'var(--chip)', color: jobStatusColor[j.status] }}>{jobStatusLabel[j.status]}</span></td>
                <td>{j.claimed_by_name ?? '—'}</td>
                <td style={{ color: 'var(--won)', fontWeight: 700 }}>{j.price ? fmt(j.price) : '—'}</td>
                <td>{day(j.deleted_at)}</td>
                <td>
                  <button className="btn sec" type="button" disabled={pending} onClick={() => restore(j.id)}>
                    ↺ Restore
                  </button>
                  {rowError?.id === j.id && (
                    <p className="form-err" role="alert" style={{ marginTop: 4 }}>{rowError.message}</p>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={9} style={{ color: 'var(--muted)' }}>No deleted jobs.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
