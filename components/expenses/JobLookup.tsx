'use client';
import type React from 'react';
import { useId, useMemo, useState } from 'react';

export type JobOption = { id: number; label: string };

// Combobox over the page-provided job list (mirrors components/customers/CustomerLookup.tsx:
// same local-filter approach, same searchbox/listbox chrome, identical ARIA/keyboard shape).
// Used to replace the raw job-id number input on the expenses add form — an admin/rep
// shouldn't have to know a job's numeric id to file an expense against it.
export function JobLookup({ jobs, name }: { jobs: JobOption[]; name: string }) {
  const uid = useId();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<JobOption | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return jobs.filter(j => j.label.toLowerCase().includes(s)).slice(0, 8);
  }, [q, jobs]);

  const pick = (j: JobOption) => {
    setPicked(j); setQ(j.label); setOpen(false); setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.preventDefault(); // never submit the form from the combobox
    if (!open || hits.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % hits.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a <= 0 ? hits.length - 1 : a - 1)); }
    else if (e.key === 'Enter' && active >= 0) pick(hits[active]);
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="searchbox">
      <input type="hidden" name={name} value={picked?.id ?? ''} />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${uid}-opt-${active}` : undefined}
        placeholder="Search job #, customer, address…"
        value={q}
        onChange={e => { setQ(e.target.value); setPicked(null); setOpen(true); setActive(-1); }}
        onFocus={() => { if (hits.length > 0) setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && hits.length > 0 && (
        <ul className="searchbox-list" id={`${uid}-list`} role="listbox">
          {hits.map((j, i) => (
            <li
              key={j.id}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onPointerDown={e => { e.preventDefault(); pick(j); }}
            >
              <span>{j.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
