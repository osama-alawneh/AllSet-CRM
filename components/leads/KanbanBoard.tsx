'use client';
import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
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
import { filterLeads } from '@/lib/search';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
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
  const [q, setQ] = useState('');
  // Optimistic move; reverts automatically when the action returns without a
  // revalidate (i.e. on error), and matches the fresh server data on success.
  const [optimistic, moveOptimistic] = useOptimistic(
    leads,
    (state: Lead[], move: { id: number; status: LeadStatus }) =>
      state.map(l => (l.id === move.id ? { ...l, status: move.status } : l))
  );
  // Mouse: 5px so click still opens the drawer. Touch: long-press (200ms) so a normal
  // swipe scrolls the column instead of dragging the card. Keyboard: Enter picks up,
  // arrows move, Enter drops (dnd-kit default bindings).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const grouped = groupByStatus(filterLeads(optimistic, q));

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
        <ViewToggle view="board" base="/leads" />
        <input placeholder="🔍 filter leads…" style={{ width: 200 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Filter leads" />
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          drag cards between columns to change status
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {admin && <HistoryToggle base="/leads" active={false} />}
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
          {canEdit && (
            <button className="btn" type="button" onClick={() => router.push('/leads?new=1', { scroll: false })}>
              + New lead
            </button>
          )}
        </div>
      </div>
      {error && <p className="form-err" role="alert">{error}</p>}
      {/* Stable id — see JobsBoard: dnd-kit auto ids drift between server and client. */}
      <DndContext id="leads-board" sensors={sensors} onDragEnd={onDragEnd}>
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
