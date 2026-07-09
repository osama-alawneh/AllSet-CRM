'use client';
import { useState } from 'react';
import Link from 'next/link';
import { fmtMoney } from '@/lib/invoices';

// Shape matches lib/earnings.leaderboard()'s return element — the app never re-derives the
// split math here, only renders precomputed rows already sorted earnings desc.
export type LeaderRow = { cleaner_id: string; name: string; jobsDone: number; earnings: number };

export function Leaderboard({
  month,
  allTime,
  uid,
  limit,
  moreHref,
}: {
  month: LeaderRow[];
  allTime: LeaderRow[];
  uid: string;
  // Task 7: dashboard's compact leaderboard — limit slices both datasets for display only (the
  // toggle keeps working on the full underlying data); moreHref renders a link to the full
  // /cleaners tab. Both are optional so the default (no props) render stays byte-identical.
  limit?: number;
  moreHref?: string;
}) {
  const [range, setRange] = useState<'month' | 'all'>('month');
  const full = range === 'month' ? month : allTime;
  const rows = limit != null ? full.slice(0, limit) : full;
  return (
    <div className="panel box">
      <h3>Leaderboard</h3>
      <p className="cap">transparent to every role — split math lives in cleaner_earnings</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button type="button" className="chip" aria-pressed={range === 'month'} onClick={() => setRange('month')}>
          This month
        </button>
        <button type="button" className="chip" aria-pressed={range === 'all'} onClick={() => setRange('all')}>
          All time
        </button>
      </div>
      <div className="tblwrap">
        <table className="tbl" aria-label="Leaderboard">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Cleaner</th>
              <th scope="col">Jobs</th>
              <th scope="col">Earnings</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="cap" style={{ color: 'var(--muted)' }}>no completed jobs yet</td></tr>
            )}
            {rows.map((r, i) => {
              const mine = r.cleaner_id === uid;
              return (
                <tr key={r.cleaner_id} style={mine ? { fontWeight: 700 } : undefined}>
                  <td>#{i + 1}</td>
                  <td>{r.name}</td>
                  <td>{r.jobsDone}</td>
                  <td>{fmtMoney(r.earnings)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {moreHref && (
        <p className="cap"><Link href={moreHref}>→ Cleaners</Link></p>
      )}
    </div>
  );
}
