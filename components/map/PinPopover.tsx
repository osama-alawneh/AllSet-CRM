'use client';
import { useState, useTransition } from 'react';
import { LEAD_STATUSES, statusLabel, statusColor, type LeadStatus } from '@/lib/leads';
import { createLeadFromPin } from '@/app/(app)/map/actions';

export function PinPopover({
  lat, lng, xPct, yPct, onCancel,
}: {
  lat: number;
  lng: number;
  xPct: number;
  yPct: number;
  onCancel: () => void;
}) {
  const [addr, setAddr] = useState('');
  const [status, setStatus] = useState<LeadStatus>('won');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    setError(null);
    const name = addr.trim() || `Lot ${Math.abs(Math.round(lat * 1000))}`;
    const fd = new FormData();
    fd.set('name', name);
    fd.set('address', addr.trim());
    fd.set('lat', String(lat));
    fd.set('lng', String(lng));
    fd.set('status', status);
    startTransition(async () => {
      const res = await createLeadFromPin(fd); // success redirects away
      if (res?.error) setError(res.error);
    });
  };

  return (
    <div
      className="pop box"
      style={{ left: `min(max(${xPct}%, 120px), calc(100% - 120px))`, top: `${yPct}%` }}
      onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
    >
      <h4>New pin</h4>
      <p>{lat.toFixed(4)}°, {lng.toFixed(4)}°</p>
      <input
        placeholder="House / address"
        value={addr}
        onChange={e => setAddr(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
        autoFocus
      />
      <div className="statuspick">
        {LEAD_STATUSES.map(st => {
          const sel = st === status;
          return (
            <button
              key={st}
              type="button"
              className={sel ? 'sel' : ''}
              style={sel ? { background: statusColor[st], color: 'var(--on-status)', borderColor: 'transparent' } : undefined}
              onClick={() => setStatus(st)}
            >
              {statusLabel[st]}
            </button>
          );
        })}
      </div>
      {error && <p className="form-err" role="alert">{error}</p>}
      <div className="row">
        <button type="button" className="go" disabled={pending} onClick={create}>
          {pending ? 'Creating…' : 'Create lead'}
        </button>
        <button type="button" className="x" onClick={onCancel}>✕</button>
      </div>
    </div>
  );
}
