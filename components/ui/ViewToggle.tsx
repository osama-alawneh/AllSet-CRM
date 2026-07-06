'use client';
import { useRouter } from 'next/navigation';

export function ViewToggle({ view, base }: { view: 'board' | 'list'; base: '/leads' | '/jobs' }) {
  const router = useRouter();
  const go = (v: 'board' | 'list') =>
    router.push(v === 'list' ? `${base}?view=list` : base, { scroll: false });
  return (
    <div className="viewtoggle" role="group" aria-label="View mode">
      <button type="button" className={view === 'board' ? 'on' : ''} aria-pressed={view === 'board'} onClick={() => go('board')}>⌗ Board</button>
      <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => go('list')}>☰ List</button>
    </div>
  );
}
