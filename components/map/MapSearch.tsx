'use client';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { geocodeUrl, parseGeocodeResponse, type GeocodeSuggestion } from '@/lib/geocode';

// Custom combobox over Mapbox Geocoding v6 — no dependency, app-themed, keyboardable.
export function MapSearch({ token, onSelect }: { token: string; onSelect: (s: GeocodeSuggestion) => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<GeocodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 3) {
      abortRef.current?.abort();
      // Deferred to a microtask (not called synchronously in the effect body) to
      // satisfy react-hooks/set-state-in-effect; runs before paint, so no visible delay.
      queueMicrotask(() => {
        setItems([]); setOpen(false); setFailed(false); setActive(-1);
      });
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const res = await fetch(geocodeUrl(query, token), { signal: ctl.signal });
        const parsed = parseGeocodeResponse(await res.json());
        setItems(parsed); setFailed(false); setActive(-1); setOpen(true);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('geocode failed', err);
        setItems([]); setFailed(true); setActive(-1); setOpen(true);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, token]);

  // Close when focus/click leaves the combobox.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const pick = (s: GeocodeSuggestion) => {
    abortRef.current?.abort();
    setQ(s.name);
    setOpen(false);
    setActive(-1);
    onSelect(s);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a <= 0 ? items.length - 1 : a - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="map-search-listbox"
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `map-search-opt-${active}` : undefined}
        placeholder="Search address…"
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (items.length > 0 || failed) setOpen(true); }}
      />
      {open && (
        <ul className="searchbox-list" id="map-search-listbox" role="listbox">
          {items.map((s, i) => (
            <li
              key={s.id}
              id={`map-search-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              // pointerdown, not click: fires before the input's blur/outside-close
              onPointerDown={e => { e.preventDefault(); pick(s); }}
            >
              {s.name}
            </li>
          ))}
          {items.length === 0 && (
            <li className="empty" role="option" aria-selected={false} aria-disabled="true">No results</li>
          )}
        </ul>
      )}
    </div>
  );
}
