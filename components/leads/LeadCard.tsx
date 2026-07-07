'use client';
import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Lead } from '@/lib/leads';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();

export function LeadCard({
  lead, admin, draggable, onOpen,
}: {
  lead: Lead;
  admin: boolean;
  draggable: boolean;
  onOpen: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(lead.id),
    disabled: !draggable,
  });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  // dnd-kit fires a native click on mouseup after a completed drag (its activation
  // distance only gates when the drag *starts*, not the trailing click). Suppress
  // onOpen when pointer travel between down and click exceeds a small threshold.
  const downPos = useRef<{ x: number; y: number } | null>(null);
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
      {...attributes}
      {...listeners} /* sensor activators: onMouseDown, onTouchStart, onKeyDown */
      /* Own handler placed AFTER the listeners spread so it wins if a sensor ever
         claims onPointerDown again; pointerdown fires for both mouse and touch, so
         one handler covers travel tracking for both. No forwarding — each sensor
         receives its own activator event via the spread above. */
      onPointerDown={e => {
        downPos.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <button
        type="button"
        className="cardlink addr"
        onClick={e => { e.stopPropagation(); onOpen(lead.id); }}
        /* Stop sensor-activator event types (mousedown, touchstart, keydown) from
           reaching the root's spread listeners (react synthetic events propagate per
           event type). pointerdown deliberately bubbles so the root's downPos travel
           tracking stays fresh. */
        onMouseDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {lead.customer_name}
      </button>
      <span className="meta">
        {lead.address ?? '—'} · {lead.phone ?? '—'}
        <br />
        {lead.stories ?? '?'}-story · {lead.panes ?? '?'} panes · {lead.service ?? 'TBD'}
      </span>
      {admin && lead.quote_value ? <div className="val">{fmt(lead.quote_value)}</div> : null}
    </div>
  );
}
