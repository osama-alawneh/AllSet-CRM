'use client';
import { useRouter } from 'next/navigation';

export type ViewMode = 'board' | 'list' | 'calendar';

// Board is the bare base path (no ?view=); list/calendar carry ?view=. Calendar deliberately
// omits ?m= so the button always lands on the current month — CalendarGrid's own nav owns ?m=.
export function ViewToggle({ view, base }: { view: ViewMode; base: '/leads' | '/jobs' }) {
  const router = useRouter();
  const go = (v: ViewMode) =>
    router.push(v === 'board' ? base : `${base}?view=${v}`, { scroll: false });
  const cls = (v: ViewMode) => (view === v ? 'on' : '');
  return (
    <div className="viewtoggle" role="group" aria-label="View mode">
      <button type="button" className={cls('board')} aria-pressed={view === 'board'} onClick={() => go('board')}>⌗ Board</button>
      <button type="button" className={cls('list')} aria-pressed={view === 'list'} onClick={() => go('list')}>☰ List</button>
      <button type="button" className={cls('calendar')} aria-pressed={view === 'calendar'} onClick={() => go('calendar')}>▦ Calendar</button>
    </div>
  );
}
