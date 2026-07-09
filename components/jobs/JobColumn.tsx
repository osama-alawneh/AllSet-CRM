'use client';
import { useDroppable } from '@dnd-kit/core';
import {
  JOB_STATUSES,
  jobStatusLabel,
  jobStatusColor,
  canTransition,
  type Job,
  type JobStatus,
} from '@/lib/jobs';
import type { Role } from '@/lib/auth';
import { JobCard } from './JobCard';

export function JobColumn({
  status, jobs, admin, money, role, uid, pending, onOpen, onClaim, pendingByJob,
}: {
  status: JobStatus;
  jobs: Job[];
  admin: boolean;
  money: boolean;
  role: Role;
  uid: string;
  pending: boolean;
  onOpen: (id: number) => void;
  onClaim: (id: number) => void;
  pendingByJob?: Record<number, number>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={`col box${isOver ? ' dragover' : ''}`}>
      <div className="ch">
        <b style={{ color: jobStatusColor[status] }}>{jobStatusLabel[status]}</b>
        <span className="cnt">{jobs.length}</span>
      </div>
      {jobs.map(j => {
        const draggable = JOB_STATUSES.some(to => canTransition(role, uid, j, to));
        const canClaim = j.status === 'unclaimed' && (role === 'admin' || role === 'cleaner');
        // Pending-join badge: only for the roles who can actually act on it (admin, or the
        // cleaner who owns this job) — mirrors can_decide_join's admin-or-owner shape.
        const pendingCount = (admin || j.claimed_by === uid) ? (pendingByJob?.[j.id] ?? 0) : 0;
        return (
          <JobCard
            key={j.id}
            job={j}
            money={money}
            draggable={draggable}
            canClaim={canClaim}
            pending={pending}
            onOpen={onOpen}
            onClaim={onClaim}
            pendingCount={pendingCount}
          />
        );
      })}
      {jobs.length === 0 && (
        <div className="meta" style={{ color: 'var(--muted)', fontSize: 10 }}>— drop here —</div>
      )}
    </div>
  );
}
