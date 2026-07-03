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
  status, jobs, admin, role, uid, onOpen, onClaim,
}: {
  status: JobStatus;
  jobs: Job[];
  admin: boolean;
  role: Role;
  uid: string;
  onOpen: (id: number) => void;
  onClaim: (id: number) => void;
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
        return (
          <JobCard
            key={j.id}
            job={j}
            admin={admin}
            draggable={draggable}
            canClaim={canClaim}
            onOpen={onOpen}
            onClaim={onClaim}
          />
        );
      })}
      {jobs.length === 0 && (
        <div className="meta" style={{ color: 'var(--muted)', fontSize: 10 }}>— drop here —</div>
      )}
    </div>
  );
}
