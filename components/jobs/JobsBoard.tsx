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
  JOB_STATUSES,
  groupJobsByStatus,
  canTransition,
  type Job,
  type JobStatus,
} from '@/lib/jobs';
import type { Role } from '@/lib/auth';
import { claimJob, setJobStatus } from '@/app/(app)/jobs/actions';
import { toCSV, downloadCSV, jobsCsvTable } from '@/lib/csv';
import { filterJobs } from '@/lib/search';
import { useJobsRealtime } from '@/lib/hooks/useJobsRealtime';
import { ViewToggle } from '@/components/ui/ViewToggle';
import { HistoryToggle } from '@/components/ui/HistoryToggle';
import { JobColumn } from './JobColumn';

type Patch = { id: number; status: JobStatus; claimed_by?: string | null; claimed_by_name?: string | null };

export function JobsBoard({
  jobs, role, uid, meName, admin,
}: {
  jobs: Job[];
  role: Role;
  uid: string;
  meName: string;
  admin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  // Optimistic patch; reverts automatically when the action returns without a revalidate
  // (i.e. on error), and reconciles with fresh server data on success/realtime refresh.
  const [optimistic, applyOptimistic] = useOptimistic(
    jobs,
    (state: Job[], p: Patch) => state.map(j => (j.id === p.id ? { ...j, ...p } : j))
  );
  // Mouse: 5px so click still opens the drawer. Touch: long-press (200ms) so a normal
  // swipe scrolls the column instead of dragging the card. Keyboard: Enter picks up,
  // arrows move, Enter drops (dnd-kit default bindings).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );
  const grouped = groupJobsByStatus(filterJobs(optimistic, q));

  useJobsRealtime();

  const onDragEnd = (e: DragEndEvent) => {
    if (pending) return; // ignore drops while a claim/status action is already in flight
    const id = Number(e.active.id);
    const to = e.over?.id as JobStatus | undefined;
    if (!to || !JOB_STATUSES.includes(to)) return;
    const job = optimistic.find(j => j.id === id);
    if (!job || !canTransition(role, uid, job, to)) return;
    setError(null);
    startTransition(async () => {
      const patch: Patch = to === 'unclaimed'
        ? { id, status: to, claimed_by: null, claimed_by_name: null }
        : { id, status: to };
      applyOptimistic(patch);
      const res = await setJobStatus(id, to);
      if (res?.error) setError(res.error);
    });
  };

  const onClaim = (id: number) => {
    setError(null);
    startTransition(async () => {
      applyOptimistic({ id, status: 'claimed', claimed_by: uid, claimed_by_name: meName });
      const res = await claimJob(id);
      if (res?.error) setError(res.error);
    });
  };

  const open = (id: number) => router.push(`/jobs?j=${id}`, { scroll: false });

  return (
    <section className="screen">
      <div className="scrhead">
        <ViewToggle view="board" base="/jobs" />
        <input placeholder="🔍 filter jobs…" style={{ width: 200 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Filter jobs" />
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          drag between statuses · claim to lock
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {admin && <HistoryToggle base="/jobs" active={false} />}
          <button
            className="btn sec"
            type="button"
            onClick={() => {
              const t = jobsCsvTable(jobs, admin);
              downloadCSV('clearview-jobs.csv', toCSV(t.headers, t.rows));
            }}
          >
            ⬇ Export CSV
          </button>
          {admin && (
            <button className="btn" type="button" onClick={() => router.push('/jobs?new=1', { scroll: false })}>
              + New job
            </button>
          )}
        </div>
      </div>
      {error && <p className="form-err" role="alert">{error}</p>}
      {/* Stable id: dnd-kit's auto id comes from a module-scope counter that drifts
          between server and client → hydration mismatch on aria-describedby. */}
      <DndContext id="jobs-board" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban">
          {JOB_STATUSES.map(st => (
            <JobColumn
              key={st}
              status={st}
              jobs={grouped[st]}
              admin={admin}
              role={role}
              uid={uid}
              pending={pending}
              onOpen={open}
              onClaim={onClaim}
            />
          ))}
        </div>
      </DndContext>
    </section>
  );
}
