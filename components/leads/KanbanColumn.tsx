'use client';
import { useDroppable } from '@dnd-kit/core';
import { statusLabel, statusColor, type Lead, type LeadStatus } from '@/lib/leads';
import { LeadCard } from './LeadCard';

export function KanbanColumn({
  status, leads, money, canEdit, onOpen,
}: {
  status: LeadStatus;
  leads: Lead[];
  money: boolean;
  canEdit: boolean;
  onOpen: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={`col box${isOver ? ' dragover' : ''}`}>
      <div className="ch">
        <b style={{ color: statusColor[status] }}>{statusLabel[status]}</b>
        <span className="cnt">{leads.length}</span>
      </div>
      {leads.map(l => (
        <LeadCard key={l.id} lead={l} money={money} draggable={canEdit} onOpen={onOpen} />
      ))}
      {leads.length === 0 && (
        <div className="meta" style={{ color: 'var(--muted)', fontSize: 10 }}>— drop here —</div>
      )}
    </div>
  );
}
