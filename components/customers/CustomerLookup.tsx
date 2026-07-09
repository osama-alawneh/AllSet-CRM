'use client';
import type React from 'react';
import { useId, useMemo, useState } from 'react';
import { filterCustomers, type CustomerOption } from '@/lib/customerLookup';

// Combobox over the page-provided customer list. Local filtering (no fetch):
// the pages already load all customers for the old <select>; same data, usable UI.
export function CustomerLookup({
  customers, name, required = false, initialId = null, onPick,
}: {
  customers: CustomerOption[];
  name: string;                       // hidden-input field name carrying the picked id
  required?: boolean;
  initialId?: number | null;
  onPick?: (c: CustomerOption) => void;
}) {
  const uid = useId();
  const initial = initialId != null ? customers.find(c => c.id === initialId) ?? null : null;
  const [q, setQ] = useState(initial?.name ?? '');
  const [picked, setPicked] = useState<CustomerOption | null>(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const hits = useMemo(() => filterCustomers(q, customers), [q, customers]);

  const pick = (c: CustomerOption) => {
    setPicked(c); setQ(c.name); setOpen(false); setActive(-1);
    onPick?.(c);
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
    <div className="searchbox lookup">
      <input type="hidden" name={name} value={picked?.id ?? ''} />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${uid}-opt-${active}` : undefined}
        placeholder="Search name, phone, address…"
        required={required && !picked}   /* browser blocks submit until something's typed; server re-validates the id */
        value={q}
        onChange={e => { setQ(e.target.value); setPicked(null); setOpen(true); setActive(-1); }}
        onFocus={() => { if (hits.length > 0) setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && hits.length > 0 && (
        <ul className="searchbox-list" id={`${uid}-list`} role="listbox">
          {hits.map((c, i) => (
            <li
              key={c.id}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onPointerDown={e => { e.preventDefault(); pick(c); }}
            >
              <span>{c.name}</span>
              <small>{[c.phone, c.address].filter(Boolean).join(' · ') || 'no phone / address'}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
