'use client';
import { useState, useTransition } from 'react';
import { DOT_STATUSES, dotStatusColor, dotStatusLabel, type Dot, type DotStatus } from '@/lib/dots';
import { SERVICE_TYPES, LEAD_STATUSES, statusLabel } from '@/lib/leads';
import { updateDot, deleteDot, convertDotToLead, convertDotToJob } from '@/app/(app)/map/actions';

type View = 'main' | 'lead' | 'job';

// Three-view dot popup (spec: main / Lead form / Job form). Positioned like
// the old create-lead popover: xPct/yPct clamped so it never hangs off the map edge.
export function DotPopover({
  dot, canEdit, xPct, yPct, onClose,
}: {
  dot: Dot; canEdit: boolean; xPct: number; yPct: number; onClose: () => void;
}) {
  const [view, setView] = useState<View>('main');
  const [label, setLabel] = useState(dot.label);
  const [notes, setNotes] = useState(dot.notes);
  const [status, setStatus] = useState<DotStatus>(dot.status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pos = { left: `min(max(${xPct}%, 130px), calc(100% - 130px))`, top: `${yPct}%` } as const;

  const save = (st: DotStatus = status) => {
    setError(null);
    startTransition(async () => {
      const res = await updateDot(dot.id, label.trim(), notes.trim(), st);
      if (res.error) setError(res.error);
    });
  };
  const pick = (st: DotStatus) => { setStatus(st); save(st); }; // chip click saves immediately
  const remove = () => {
    setError(null);
    startTransition(async () => {
      const res = await deleteDot(dot.id);
      if (res.error) setError(res.error); else onClose();
    });
  };
  const convert = (fn: typeof convertDotToLead) => (fd: FormData) => {
    setError(null);
    fd.set('dot_id', String(dot.id));
    startTransition(async () => {
      const res = await fn(fd); // success redirects away
      if (res?.error) setError(res.error);
    });
  };

  if (!canEdit) {
    return (
      <div className="pop box" style={pos} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <h4>Dot — {dotStatusLabel[dot.status]}</h4>
        <p>{dot.label || `${dot.lat.toFixed(4)}°, ${dot.lng.toFixed(4)}°`}</p>
        {dot.notes && <p>{dot.notes}</p>}
        <div className="row"><button type="button" className="x" onClick={onClose}>✕</button></div>
      </div>
    );
  }

  return (
    <div className="pop box pop-dot" style={pos} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      {view === 'main' && (
        <>
          <h4>Dot</h4>
          <p>{dot.lat.toFixed(4)}°, {dot.lng.toFixed(4)}°</p>
          <input name="label" placeholder="Label or address" value={label} onChange={e => setLabel(e.target.value)} autoFocus />
          <textarea name="notes" placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="statuspick statuspick-wrap">
            {DOT_STATUSES.map(st => {
              const sel = st === status;
              return (
                <button
                  key={st} type="button" className={sel ? 'sel' : ''} aria-pressed={sel} disabled={pending}
                  style={sel ? { background: dotStatusColor[st], color: 'var(--on-status)', borderColor: 'transparent' } : undefined}
                  onClick={() => pick(st)}
                >
                  {dotStatusLabel[st]}
                </button>
              );
            })}
          </div>
          {error && <p className="form-err" role="alert">{error}</p>}
          <div className="row">
            <button type="button" className="go" disabled={pending} onClick={() => save()}>{pending ? 'Saving…' : 'Save'}</button>
            <button type="button" className="x" onClick={onClose}>✕</button>
          </div>
          <div className="row">
            <button type="button" className="btn-s" disabled={pending} onClick={() => setView('lead')}>Lead</button>
            <button type="button" className="btn-s" disabled={pending} onClick={() => setView('job')}>Job</button>
          </div>
          <div className="row">
            <button type="button" className="btn-s btn-danger" disabled={pending} onClick={remove}>Delete Dot</button>
          </div>
        </>
      )}

      {view === 'lead' && (
        <form action={convert(convertDotToLead)}>
          <h4>New lead</h4>
          <input name="name" placeholder="Name" />
          <input name="phone" placeholder="Number" />
          <input name="address" placeholder="House number / address" defaultValue={label} />
          <input name="quote" type="number" min={0} step="0.01" placeholder="Quote" />
          <select name="service" defaultValue={SERVICE_TYPES[0]} required>
            {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select name="status" defaultValue="new">
            {LEAD_STATUSES.map(s => <option key={s} value={s}>{statusLabel[s]}</option>)}
          </select>
          <textarea name="note" placeholder="Notes" defaultValue={notes} />
          {error && <p className="form-err" role="alert">{error}</p>}
          <div className="row">
            <button type="submit" className="go" disabled={pending}>{pending ? 'Saving…' : 'Save Lead'}</button>
          </div>
          <div className="row">
            <button type="button" className="btn-s" disabled={pending} onClick={() => { setError(null); setView('main'); }}>Back</button>
            <button type="button" className="btn-s btn-danger" disabled={pending} onClick={remove}>Delete Dot</button>
          </div>
        </form>
      )}

      {view === 'job' && (
        <form action={convert(convertDotToJob)}>
          <h4>New job</h4>
          <input name="name" placeholder="Name" />
          <input name="phone" placeholder="Number" />
          <input name="address" placeholder="House number / address" defaultValue={label} />
          <input name="price" type="number" min={0} step="0.01" placeholder="Price" />
          <label className="lbl">Cleaners Pay
            <input name="cleaner_amount" type="number" min={0} step="0.01" placeholder="0.00" />
          </label>
          <select name="service" defaultValue={SERVICE_TYPES[0]} required>
            {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input name="scheduled_date" type="datetime-local" />
          <textarea name="description" placeholder="Notes" defaultValue={notes} />
          {error && <p className="form-err" role="alert">{error}</p>}
          <div className="row">
            <button type="submit" className="go" disabled={pending}>{pending ? 'Saving…' : 'Save Job'}</button>
          </div>
          <div className="row">
            <button type="button" className="btn-s" disabled={pending} onClick={() => { setError(null); setView('main'); }}>Back</button>
            <button type="button" className="btn-s btn-danger" disabled={pending} onClick={remove}>Delete Dot</button>
          </div>
        </form>
      )}
    </div>
  );
}
