'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import {
  LEAD_STATUSES, statusLabel, statusColor, type Lead, type LeadStatus,
} from '@/lib/leads';
import { blankMoneyToZero } from '@/lib/forms';
import { setLeadStatus, createLead, updateLead, deleteLead } from '@/app/(app)/leads/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();
const day = (s: string) => s.slice(0, 10);

export function LeadDrawer({
  lead, admin, canEdit, backTo, isNew = false, customers = [],
}: {
  lead: Lead | null;
  admin: boolean;
  canEdit: boolean;
  backTo: string;
  isNew?: boolean;
  customers?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(isNew); // item 11: read-only default, edit on demand
  const close = () => router.push(backTo, { scroll: false });

  if (!isNew && !lead) return null;

  const change = (status: LeadStatus) => {
    if (!lead || status === lead.status) return;
    setError(null);
    startTransition(async () => {
      const res = await setLeadStatus(lead.id, status);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };

  const submit = (fd: FormData) => {
    setError(null);
    // Admin blanking the (prefilled) quote is a deliberate "clear to $0". The quote input
    // is {admin &&}-gated, so present-in-fd ⇒ admin; absent (rep) stays absent and the RPC
    // keeps ignoring it. Safe on create too (blank quote already stores 0 there).
    blankMoneyToZero(fd, 'quote');
    startTransition(async () => {
      const res = isNew ? await createLead(fd) : await updateLead(lead!.id, fd);
      if (res?.error) setError(res.error);
      else if (!isNew) { setEditing(false); router.refresh(); }
      // new lead: createLead redirects to /leads?l=<id>
    });
  };

  const remove = () => {
    if (!lead) return;
    if (!window.confirm(`Delete lead #${lead.id} (${lead.service ?? 'no service'})? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteLead(lead.id);
      if (res?.error) setError(res.error);
      else close();
    });
  };

  return (
    <Drawer onClose={close}>
      <div className="dh">
        <div>
          <span className="badge" style={{ background: 'var(--chip)', color: lead ? statusColor[lead.status] : 'var(--muted)' }}>
            {lead ? statusLabel[lead.status] : 'NEW'}
          </span>
          <h2>{isNew ? 'New lead' : lead!.service ?? lead!.customer_name}</h2>
        </div>
        <button type="button" className="close" onClick={close} aria-label="Close">✕</button>
      </div>
      {!isNew && (
        <div className="lbl" style={{ marginTop: 4 }}>
          LEAD #{String(lead!.id).padStart(4, '0')} · created {day(lead!.created_at)} · updated {day(lead!.updated_at)}
        </div>
      )}

      {!editing && lead && (
        <>
          <div className="sec">
            <span className="lbl">Customer</span>
            <div className="minirow" onClick={() => router.push(`/customers?c=${lead.customer_id}`, { scroll: false })}>
              <span><b>{lead.customer_name}</b> · {lead.address ?? '—'}</span>
              <span>→</span>
            </div>
            <div className="qa">
              <a href={`tel:${lead.phone ?? ''}`}>📞 Call</a>
              <a href={`sms:${lead.phone ?? ''}`}>💬 Text</a>
              <a href={`mailto:${lead.email ?? ''}`}>✉ Email</a>
            </div>
          </div>

          <div className="sec">
            <span className="lbl">Lead details</span>
            <div className="kv">
              <span className="k">Service</span><span className="v">{lead.service ?? 'TBD'}</span>
              <span className="k">Description</span><span className="v">{lead.description ?? '—'}</span>
              <span className="k">Stories</span><span className="v">{lead.stories ?? '—'}</span>
              <span className="k">Panes</span><span className="v">{lead.panes ?? '—'}</span>
              <span className="k">Quote</span>
              {admin
                ? <span className="v" style={{ color: 'var(--won)' }}>{lead.quote_value ? fmt(lead.quote_value) : '—'}</span>
                : <span className="v money-hidden">•••••</span>}
            </div>
          </div>

          <div className="sec">
            <span className="lbl">Notes</span>
            <p style={{ fontSize: 12, lineHeight: 1.6, margin: 0, color: 'var(--muted)' }}>{lead.note ?? '—'}</p>
          </div>

          {canEdit && (
            <div className="sec">
              <span className="lbl">Change status</span>
              <div className="statuspick">
                {LEAD_STATUSES.map(st => {
                  const sel = st === lead.status;
                  return (
                    <button
                      key={st} type="button" className={sel ? 'sel' : ''} aria-pressed={sel} disabled={pending}
                      style={sel ? { background: statusColor[st], color: 'var(--on-status)', borderColor: 'transparent' } : undefined}
                      onClick={() => change(st)}
                    >
                      {statusLabel[st]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
          <div className="acts">
            {canEdit && (
              <button className="btn-p" type="button" disabled={pending} onClick={() => { setError(null); setEditing(true); }}>
                ✎ Edit
              </button>
            )}
            {canEdit && lead.status !== 'won' && (
              <button className="btn-s" type="button" disabled={pending} onClick={() => change('won')}>
                Mark won → job
              </button>
            )}
            {admin && (
              <button className="btn-s btn-danger" type="button" disabled={pending} onClick={remove}>
                🗑 Delete
              </button>
            )}
            <button className="btn-s" type="button" onClick={close}>Close</button>
          </div>
        </>
      )}

      {editing && (
        <form action={submit}>
          <div className="sec">
            <span className="lbl">{isNew ? 'New lead' : 'Edit lead'}</span>
            <div className="kv">
              <span className="k">Customer</span>
              <span className="v">
                {isNew ? (
                  <select name="customer_id" required defaultValue="">
                    <option value="" disabled>Select customer…</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <>
                    <input type="hidden" name="customer_id" value={lead!.customer_id} />
                    {lead!.customer_name}
                  </>
                )}
              </span>
              <span className="k">Service</span>
              <span className="v"><input name="service" required defaultValue={lead?.service ?? ''} placeholder="e.g. In + out, screens" /></span>
              <span className="k">Stories</span>
              <span className="v"><input name="stories" type="number" min={0} defaultValue={lead?.stories ?? ''} placeholder="2" /></span>
              <span className="k">Panes</span>
              <span className="v"><input name="panes" type="number" min={0} defaultValue={lead?.panes ?? ''} placeholder="14" /></span>
              {admin && (
                <>
                  <span className="k">Quote $</span>
                  <span className="v"><input name="quote" type="number" min={0} step="0.01" defaultValue={lead?.quote_value ?? ''} placeholder="0.00" /></span>
                </>
              )}
            </div>
          </div>
          <div className="sec">
            <span className="lbl">Description (what exactly to do)</span>
            <textarea name="description" defaultValue={lead?.description ?? ''} placeholder="e.g. 12 front panes, 2nd-story ladder, skip garage" style={{ width: '100%', minHeight: 70 }} />
          </div>
          <div className="sec">
            <span className="lbl">Internal note</span>
            <textarea name="note" defaultValue={lead?.note ?? ''} placeholder="gate code, best call time…" style={{ width: '100%', minHeight: 50 }} />
          </div>
          {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
          <div className="acts">
            <button className="btn-p" type="submit" disabled={pending}>
              {pending ? 'Saving…' : isNew ? 'Create lead' : 'Save'}
            </button>
            <button className="btn-s" type="button" disabled={pending} onClick={() => (isNew ? close() : (setError(null), setEditing(false)))}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
