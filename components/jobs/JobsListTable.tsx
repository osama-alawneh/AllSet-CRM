'use client';
import { useState } from 'react';
import { jobStatusLabel, jobStatusColor, dayTime, type Job } from '@/lib/jobs';
import { filterJobs } from '@/lib/search';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

export function JobsListTable({ jobs, money, onOpen }: { jobs: Job[]; money: boolean; onOpen: (id: number) => void }) {
  const [q, setQ] = useState('');
  const shown = filterJobs(jobs, q);
  return (
    <div className="panel box">
      <input placeholder="🔍 filter jobs…" style={{ width: 220, marginBottom: 12 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Filter jobs" />
      <div className="tblwrap">
        <table className="tbl" aria-label="Jobs">
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">Customer</th><th scope="col">Service</th><th scope="col">Date</th>
              <th scope="col">Status</th><th scope="col">Claimed by</th><th scope="col">Created</th>{money && <th scope="col">Price</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map(j => (
              <tr
                key={j.id} data-click="" tabIndex={0}
                onClick={() => onOpen(j.id)}
                onKeyDown={e => {
                  const t = e.target as HTMLElement;
                  if (t.closest('button, a, input, select, textarea')) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(j.id); }
                }}
              >
                <td>{j.id}</td>
                <td><b>{j.customer_name}</b><br /><small style={{ color: 'var(--muted)' }}>{j.address ?? '—'}</small></td>
                <td>{j.service ?? 'TBD'}</td>
                <td>{j.scheduled_date ? dayTime(j.scheduled_date) : 'TBD'}</td>
                <td><span className="badge" style={{ background: 'var(--chip)', color: jobStatusColor[j.status] }}>{jobStatusLabel[j.status]}</span></td>
                <td>{j.claimed_by_name ?? '—'}</td>
                <td>{day(j.created_at)}</td>
                {money && <td style={{ color: 'var(--won)', fontWeight: 700 }}>{j.price ? fmt(j.price) : '—'}</td>}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={money ? 8 : 7} style={{ color: 'var(--muted)' }}>No jobs match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
