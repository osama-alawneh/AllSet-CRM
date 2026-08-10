'use client';
import { useState } from 'react';
import Link from 'next/link';
import { addMonths, monthGrid, monthLabel, type CalEntry } from '@/lib/calendar';

const CHIP_CAP = 3; // chips per cell before "+n more"

// Month grid. Entries arrive pre-bucketed and pre-colored (the host page did the role
// filtering — cleaners never receive lead entries). `kind` says which host is rendering:
// it picks the base path, so every link stays inside that host's calendar view. Chip click
// deep-links the drawer; view+month ride along so Back/close keeps the grid. Tapping a day
// opens a panel listing everything (the phones-first path — cells collapse to count dots
// below the CSS breakpoint).
export function CalendarGrid({
  month, entries, kind,
}: {
  month: string;
  entries: Record<string, CalEntry[]>;
  kind: 'lead' | 'job';
}) {
  const { days, leadingBlanks } = monthGrid(month);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const base = kind === 'lead' ? '/leads' : '/jobs';
  const monthHref = (m: string | null) => (m ? `${base}?view=calendar&m=${m}` : `${base}?view=calendar`);
  const chipHref = (e: CalEntry) => `${base}?view=calendar&m=${month}&${e.kind === 'job' ? 'j' : 'l'}=${e.id}`;
  const hint = kind === 'lead' ? '◆ leads by created' : '● jobs by schedule';

  return (
    <section className="panel box">
      <div className="calhead">
        <h3>{monthLabel(month)}</h3>
        <div className="calnav">
          <Link className="chip" href={monthHref(addMonths(month, -1))}>‹ Prev</Link>
          <Link className="chip" href={monthHref(null)}>Today</Link>
          <Link className="chip" href={monthHref(addMonths(month, 1))}>Next ›</Link>
        </div>
        <span className="hint">{hint}</span>
      </div>
      <div className="calgrid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="caldow">{d}</div>)}
        {Array.from({ length: leadingBlanks }, (_, i) => <div key={`b${i}`} className="calblank" />)}
        {days.map(day => {
          const list = entries[day] ?? [];
          return (
            <div
              key={day} className="calday" role="button" tabIndex={0}
              onClick={() => setOpenDay(list.length ? day : null)}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && list.length) { e.preventDefault(); setOpenDay(day); } }}
            >
              <span className="caldnum">{Number(day.slice(8))}</span>
              {list.slice(0, CHIP_CAP).map(e => (
                <Link
                  key={`${e.kind}${e.id}`} className="calchip" href={chipHref(e)}
                  style={{ '--pc': e.color } as React.CSSProperties}
                  onClick={ev => ev.stopPropagation()}
                >
                  {e.kind === 'job' ? '●' : '◆'} {e.label}
                </Link>
              ))}
              {list.length > CHIP_CAP && <span className="calmore">+{list.length - CHIP_CAP} more</span>}
              {/* phones-first collapse target: count dots shown below the breakpoint */}
              {list.length > 0 && (
                <span className="caldots" aria-hidden>
                  {list.slice(0, 4).map((e, i) => <i key={i} style={{ background: e.color }} />)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {openDay && (
        <div className="caldaypanel box">
          <div className="calhead">
            <h4>{openDay}</h4>
            <button type="button" className="x" onClick={() => setOpenDay(null)}>✕</button>
          </div>
          {(entries[openDay] ?? []).map(e => (
            <Link key={`${e.kind}${e.id}`} className="calchip" href={chipHref(e)} style={{ '--pc': e.color } as React.CSSProperties}>
              {e.kind === 'job' ? '●' : '◆'} {e.label}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
