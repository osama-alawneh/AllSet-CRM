'use client';
import { useRouter } from 'next/navigation';

// Admin-only URL-state toggle (?deleted=1) for the soft-delete History view. Styled and
// placed like its Export CSV / New … neighbours in the scrhead action group (owner request);
// non-admins never render this (gated by the caller).
export function HistoryToggle({ base, active }: { base: '/leads' | '/jobs'; active: boolean }) {
  const router = useRouter();
  const entity = base === '/leads' ? 'leads' : 'jobs';
  return (
    <button
      type="button"
      className="btn sec"
      aria-pressed={active}
      onClick={() => router.push(active ? base : `${base}?deleted=1`, { scroll: false })}
    >
      {active ? `← Back to ${entity}` : '🕘 History'}
    </button>
  );
}
