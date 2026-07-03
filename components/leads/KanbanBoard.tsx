'use client';
import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  LEAD_STATUSES,
  groupByStatus,
  type Lead,
  type LeadStatus,
} from '@/lib/leads';
import { setLeadStatus } from '@/app/(app)/leads/actions';
import { toCSV, downloadCSV, leadsCsvTable } from '@/lib/csv';
import { KanbanColumn } from './KanbanColumn';

export function KanbanBoard({
  leads, admin, canEdit,
}: {
  leads: Lead[];
  admin: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Optimistic move; reverts automatically when the action returns without a
  // revalidate (i.e. on error), and matches the fresh server data on success.
  const [optimistic, moveOptimistic] = useOptimistic(
    leads,
    (state: Lead[], move: { id: number; status: LeadStatus }) =>
      state.map(l => (l.id === move.id ? { ...l, status: move.status } : l))
  );
  // 5px activation distance so a tap still fires the card's onClick (opens drawer).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const grouped = groupByStatus(optimistic);

  const onDragEnd = (e: DragEndEvent) => {
    const id = Number(e.active.id);
    const status = e.over?.id as LeadStatus | undefined;
    if (!status || !LEAD_STATUSES.includes(status)) return;
    const lead = optimistic.find(l => l.id === id);
    if (!lead || lead.status === status) return;
    setError(null);
    startTransition(async () => {
      moveOptimistic({ id, status });
      const res = await setLeadStatus(id, status);
      if (res?.error) setError(res.error);
    });
  };

  const open = (id: number) => router.push(`/leads?l=${id}`, { scroll: false });

  return (
    <section className="screen">
      <div className="scrhead">
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          drag cards between columns to change status
        </span>
        <button
          className="btn sec"
          type="button"
          onClick={() => {
            // Export the committed `leads` prop, NOT the optimistic drag state.
            const t = leadsCsvTable(leads, admin);
            downloadCSV('clearview-leads.csv', toCSV(t.headers, t.rows));
          }}
        >
          ⬇ Export CSV
        </button>
      </div>
      {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban">
          {LEAD_STATUSES.map(st => (
            <KanbanColumn
              key={st}
              status={st}
              leads={grouped[st]}
              admin={admin}
              canEdit={canEdit}
              onOpen={open}
            />
          ))}
        </div>
      </DndContext>
    </section>
  );
}
