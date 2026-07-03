'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from '@/components/ui/Drawer';
import {
  LEAD_STATUSES,
  statusLabel,
  statusColor,
  type Lead,
  type LeadStatus,
} from '@/lib/leads';
import { setLeadStatus } from '@/app/(app)/leads/actions';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();

export function LeadDrawer({
  lead, admin, canEdit, backTo,
}: {
  lead: Lead;
  admin: boolean;
  canEdit: boolean;
  backTo: '/leads' | '/map';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const close = () => router.push(backTo, { scroll: false });

  const change = (status: LeadStatus) => {
    if (status === lead.status) return;
    setError(null);
    startTransition(async () => {
      const res = await setLeadStatus(lead.id, status);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <Drawer onClose={close}>
      <div className="dh">
        <div>
          <span className="badge" style={{ background: 'var(--chip)', color: statusColor[lead.status] }}>
            {statusLabel[lead.status]}
          </span>
          <h2>{lead.address ?? lead.customer_name}</h2>
        </div>
        <button type="button" className="close" onClick={close} aria-label="Close">✕</button>
      </div>
      <div className="lbl" style={{ marginTop: 4 }}>
        LEAD #{String(lead.id).padStart(4, '0')} · ◆ pinned on map
      </div>

      <div className="sec">
        <span className="lbl">Customer</span>
        <div className="minirow" onClick={() => router.push(`/customers?c=${lead.customer_id}`, { scroll: false })}>
          <span><b>{lead.customer_name}</b> · {lead.phone ?? '—'}</span>
          <span>→</span>
        </div>
        <div className="qa">
          <a href={`tel:${lead.phone ?? ''}`}>📞 Call</a>
          <a href={`sms:${lead.phone ?? ''}`}>💬 Text</a>
          <a href={`mailto:${lead.email ?? ''}`}>✉ Email</a>
        </div>
      </div>

      <div className="sec">
        <span className="lbl">Property / window details</span>
        <div className="kv">
          <span className="k">Stories</span>
          <span className="v">{lead.stories ?? '—'}</span>
          <span className="k">Panes</span>
          <span className="v">{lead.panes ?? '—'}</span>
          <span className="k">Service</span>
          <span className="v">{lead.service ?? 'TBD'}</span>
          <span className="k">Quote</span>
          {admin ? (
            <span className="v" style={{ color: 'var(--won)' }}>{lead.quote_value ? fmt(lead.quote_value) : '—'}</span>
          ) : (
            <span className="v money-hidden">•••••</span>
          )}
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
                  key={st}
                  type="button"
                  className={sel ? 'sel' : ''}
                  disabled={pending}
                  style={sel ? { background: statusColor[st], color: '#fff', borderColor: 'transparent' } : undefined}
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
        {canEdit && lead.status !== 'won' && (
          <button className="btn-p" type="button" disabled={pending} onClick={() => change('won')}>
            Mark won → job
          </button>
        )}
        <button className="btn-s" type="button" onClick={close}>Close</button>
      </div>
    </Drawer>
  );
}
