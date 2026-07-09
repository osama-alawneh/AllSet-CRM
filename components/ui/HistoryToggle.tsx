'use client';
import { useRouter } from 'next/navigation';

// Admin-only companion to ViewToggle (0020): a second, independent URL-state toggle
// (?deleted=1) for the soft-delete History view. Sits next to the board/list ViewToggle;
// non-admins never render this (gated by the caller).
export function HistoryToggle({ base, active }: { base: '/leads' | '/jobs'; active: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={active}
      onClick={() => router.push(active ? base : `${base}?deleted=1`, { scroll: false })}
    >
      🕘 History
    </button>
  );
}
