'use client';
import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Lead } from '@/lib/leads';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();

export function LeadCard({
  lead, money, draggable, onOpen,
}: {
  lead: Lead;
  money: boolean;
  draggable: boolean;
  onOpen: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: String(lead.id),
    disabled: !draggable,
  });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  // dnd-kit fires a native click on mouseup after a completed drag (its activation
  // distance only gates when the drag *starts*, not the trailing click). Suppress
  // onOpen when pointer travel between down and click exceeds a small threshold.
  const downPos = useRef<{ x: number; y: number } | null>(null);
  // Root keeps only the mouse/touch activators (drag-from-anywhere-on-the-card stays
  // intact); onKeyDown is deliberately excluded here and lives only on the .draghandle
  // button below (via the full `listeners` spread there) so Enter/Space on the title
  // button can never be misread as a keyboard drag pick-up.
  const pointerListeners: typeof listeners = listeners
    ? Object.fromEntries(Object.entries(listeners).filter(([key]) => key !== 'onKeyDown'))
    : listeners;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card2${isDragging ? ' dragging' : ''}`}
      onClick={e => {
        const d = downPos.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
        onOpen(lead.id);
      }}
      {...pointerListeners} /* sensor activators: onMouseDown, onTouchStart (no onKeyDown — see above) */
      /* Own handler placed AFTER the listeners spread so it wins if a sensor ever
         claims onPointerDown again; pointerdown fires for both mouse and touch, so
         one handler covers travel tracking for both. No forwarding — each sensor
         receives its own activator event via the spread above. */
      onPointerDown={e => {
        downPos.current = { x: e.clientX, y: e.clientY };
      }}
    >
      {draggable && (
        <button
          type="button"
          className="draghandle"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Move card"
        >
          ⠿
        </button>
      )}
      <button
        type="button"
        className="cardlink addr"
        onClick={e => { e.stopPropagation(); onOpen(lead.id); }}
        /* Title stays a mouse/touch drag dead zone (Step 2 option: keep these stops
           rather than duplicating the downPos travel check) — a drag can never start
           here, so a plain click always reaches onOpen. onKeyDown stop removed: the
           root no longer carries a keydown listener (see above), so there is nothing
           left to shield Enter/Space from. */
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        {lead.customer_name}
      </button>
      <span className="meta">
        {lead.address ?? '—'} · {lead.phone ?? '—'}
        <br />
        {lead.stories ?? '?'}-story · {lead.panes ?? '?'} panes · {lead.service ?? 'TBD'}
      </span>
      {money && lead.quote_value ? <div className="val">{fmt(lead.quote_value)}</div> : null}
    </div>
  );
}
