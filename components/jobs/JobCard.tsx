'use client';
import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { Job } from '@/lib/jobs';

const fmt = (n: number) => '$' + Number(n || 0).toLocaleString();

export function JobCard({
  job, admin, draggable, canClaim, pending, onOpen, onClaim,
}: {
  job: Job;
  admin: boolean;
  draggable: boolean;
  canClaim: boolean;
  pending: boolean;
  onOpen: (id: number) => void;
  onClaim: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(job.id),
    disabled: !draggable,
  });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  // dnd-kit fires a native click on mouseup after a completed drag; suppress onOpen when
  // pointer travel between down and click exceeds the 5px threshold (LeadCard pattern).
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const firstName = job.claimed_by_name ? job.claimed_by_name.split(' ')[0] : '';
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card2${isDragging ? ' dragging' : ''}`}
      onPointerDown={e => {
        downPos.current = { x: e.clientX, y: e.clientY };
        listeners?.onPointerDown?.(e);
      }}
      onClick={e => {
        const d = downPos.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
        onOpen(job.id);
      }}
      {...attributes}
    >
      <span className="addr">{job.customer_name}</span>
      <span className="meta">
        {job.address ?? '—'}
        <br />
        {job.service ?? 'TBD'} · {job.scheduled_date ?? 'TBD'}
        {admin && job.price ? ` · ${fmt(job.price)}` : ''}
      </span>
      <div style={{ marginTop: 8 }}>
        {canClaim ? (
          <button
            type="button"
            className="claim"
            disabled={pending}
            onClick={e => { e.stopPropagation(); onClaim(job.id); }}
          >
            Claim
          </button>
        ) : job.claimed_by_name ? (
          <button type="button" className="claim locked" onClick={e => e.stopPropagation()}>
            🔒 {firstName}
          </button>
        ) : null}
      </div>
    </div>
  );
}
