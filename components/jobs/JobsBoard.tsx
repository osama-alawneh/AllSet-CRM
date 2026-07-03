'use client';
import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
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
import { supabaseBrowser } from '@/lib/supabase/client';
import { claimJob, setJobStatus } from '@/app/(app)/jobs/actions';
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
  // Optimistic patch; reverts automatically when the action returns without a revalidate
  // (i.e. on error), and reconciles with fresh server data on success/realtime refresh.
  const [optimistic, applyOptimistic] = useOptimistic(
    jobs,
    (state: Job[], p: Patch) => state.map(j => (j.id === p.id ? { ...j, ...p } : j))
  );
  // 5px activation distance so a tap still fires the card's onClick (opens drawer).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const grouped = groupJobsByStatus(optimistic);

  // Realtime: subscribe to the private 'jobs' broadcast topic. The DB trigger
  // (0011) sends a tiny {id,status} ping on any job insert/update; we debounce it
  // (250ms trailing) into router.refresh(), which re-runs the role-split server fetch.
  // Sensitive data (price/names) is NEVER in the ping — it comes back through RLS.
  useEffect(() => {
    const sb = supabaseBrowser();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    (async () => {
      await sb.realtime.setAuth(); // attach the current session token for RLS on realtime.messages
      channel = sb
        .channel('jobs', { config: { private: true } })
        .on('broadcast', { event: 'change' }, refresh)
        .subscribe();
    })();
    return () => {
      if (timer) clearTimeout(timer);
      if (channel) sb.removeChannel(channel);
    };
  }, [router]);

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
        <span className="cap" style={{ fontSize: 11, color: 'var(--muted)' }}>
          drag between statuses · claim to lock
        </span>
      </div>
      {error && <p style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
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
