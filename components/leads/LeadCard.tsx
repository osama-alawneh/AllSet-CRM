'use client';
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
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card2${isDragging ? ' dragging' : ''}`}
      onClick={() => onOpen(lead.id)}
      {...listeners}
      {...attributes}
    >
      <span className="addr">{lead.customer_name}</span>
      <span className="meta">
        {lead.address ?? '—'} · {lead.phone ?? '—'}
        <br />
        {lead.stories ?? '?'}-story · {lead.panes ?? '?'} panes · {lead.service ?? 'TBD'}
      </span>
      {admin && lead.quote_value ? <div className="val">{fmt(lead.quote_value)}</div> : null}
    </div>
  );
}
