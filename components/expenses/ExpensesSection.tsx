'use client';
import { Fragment, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import { JobLookup, type JobOption } from '@/components/expenses/JobLookup';
import { fmtMoney } from '@/lib/invoices';
import { monthKey } from '@/lib/earnings';
import { toCSV, downloadCSV, expensesCsvTable } from '@/lib/csv';
import { addExpense, deleteExpense } from '@/app/(app)/expenses/actions';

export type ExpenseRow = {
  id: number;
  label: string;
  amount: number;
  spent_on: string;
  job_id: number | null;
  source: 'manual' | 'job_payout';
  created_at: string;
};

const today = () => new Date().toISOString().slice(0, 10);

export function ExpensesSection({ rows, jobOptions }: { rows: ExpenseRow[]; jobOptions: JobOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const grandTotal = rows.reduce((s, r) => s + Number(r.amount), 0);

  // Rows already arrive ordered spent_on desc, id desc (page.tsx query) — grouping
  // preserves that order within and across months, so `months` just needs the same
  // desc sort on the derived keys.
  const groups = new Map<string, ExpenseRow[]>();
  for (const r of rows) {
    const k = monthKey(r.spent_on);
    const arr = groups.get(k);
    if (arr) arr.push(r);
    else groups.set(k, [r]);
  }
  const months = [...groups.keys()].sort().reverse();

  const submitAdd = (fd: FormData) => {
    setError(null);
    startTransition(async () => {
      const res = await addExpense(fd);
      if (res?.error) setError(res.error);
      // React 19 auto-resets the uncontrolled form after any <form action> completes (success
      // OR error) — values clear either way; the explicit reset()+refresh here just re-syncs
      // the list on success. On error we surface the message via the role=alert below and
      // keep the drawer open so the message stays visible next to the form.
      else { formRef.current?.reset(); setCreating(false); router.refresh(); }
    });
  };

  const onDelete = (id: number) => {
    if (!window.confirm('Delete this expense?')) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteExpense(id);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <section className="screen">
      <div className="scrhead">
        <span className="cap" style={{ color: 'var(--muted)', fontSize: 12 }}>
          Total: {fmtMoney(grandTotal)}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn"
            type="button"
            onClick={() => { setError(null); setCreating(true); }}
          >
            ＋ New expense
          </button>
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = expensesCsvTable(rows);
              downloadCSV('clearview-expenses.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {creating && (
        <Drawer onClose={() => setCreating(false)} labelId="new-expense-title">
          <form ref={formRef} action={submitAdd}>
            <div className="dh">
              <h2 id="new-expense-title">New expense</h2>
              <button type="button" className="close" onClick={() => setCreating(false)} aria-label="Close">✕</button>
            </div>
            <div className="sec" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label className="lbl" htmlFor="exp-label">Label</label><br />
                <input id="exp-label" name="label" required />
              </div>
              <div>
                <label className="lbl" htmlFor="exp-amount">Amount</label><br />
                <input id="exp-amount" name="amount" type="number" step="0.01" className="num" required />
              </div>
              <div>
                <label className="lbl" htmlFor="exp-date">Date</label><br />
                <input id="exp-date" name="spent_on" type="date" defaultValue={today()} />
              </div>
              <div style={{ flex: '1 1 220px' }}>
                <label className="lbl">Job (optional)</label><br />
                <JobLookup jobs={jobOptions} name="job_id" />
              </div>
            </div>
            {error && <p className="form-err" role="alert">{error}</p>}
            <div className="acts">
              <button className="btn-p" type="submit" disabled={pending}>
                {pending ? 'Adding…' : 'Add expense'}
              </button>
              <button className="btn-s" type="button" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </form>
        </Drawer>
      )}

      <div className="panel box">
        <div className="tblwrap">
          <table className="tbl" aria-label="Expenses">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Label</th>
                <th scope="col">Amount</th>
                <th scope="col">Source</th>
                <th scope="col">Job</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {months.length === 0 && (
                <tr><td colSpan={6} className="cap" style={{ color: 'var(--muted)' }}>No expenses yet.</td></tr>
              )}
              {months.map(m => {
                const monthRows = groups.get(m)!;
                const subtotal = monthRows.reduce((s, r) => s + Number(r.amount), 0);
                return (
                  <Fragment key={m}>
                    <tr>
                      <td colSpan={6} style={{ fontWeight: 700, background: 'var(--chip)' }}>
                        {m} — {fmtMoney(subtotal)}
                      </td>
                    </tr>
                    {monthRows.map(r => (
                      <tr key={r.id}>
                        <td>{r.spent_on}</td>
                        <td>{r.label}</td>
                        <td>{fmtMoney(r.amount)}</td>
                        <td><span className="lbl">{r.source === 'job_payout' ? 'auto' : 'manual'}</span></td>
                        <td>{r.job_id ? <a href={`/jobs?j=${r.job_id}`}>#{r.job_id}</a> : '—'}</td>
                        <td>
                          {r.source === 'manual' ? (
                            <button
                              className="btn-s btn-danger"
                              type="button"
                              disabled={pending}
                              onClick={() => onDelete(r.id)}
                              style={{ minHeight: 44 }}
                            >
                              Delete
                            </button>
                          ) : (
                            <em title="created by job completion">—</em>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
