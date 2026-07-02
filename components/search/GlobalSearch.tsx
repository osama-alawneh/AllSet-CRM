'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { buildOrFilter } from '@/lib/search';

type Hit = { id: number; name: string; phone: string | null; address: string | null };

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const filter = buildOrFilter(q);
  const visible = open && filter !== null;

  useEffect(() => {
    if (!filter) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabaseBrowser()
        .from('customers')
        .select('id,name,phone,address')
        .or(filter)
        .limit(6);
      if (cancelled) return;
      setHits(data ?? []);
      setOpen(true);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [filter]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const pick = (id: number) => {
    setOpen(false);
    setQ('');
    router.push(`/customers?c=${id}`, { scroll: false });
  };

  return (
    <div className="search" ref={boxRef}>
      <input
        placeholder="🔍 Find customer…"
        autoComplete="off"
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => hits && setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && visible && hits?.length) pick(hits[0].id);
        }}
        aria-label="Find customer"
      />
      <div className={`sresults box ${visible ? 'show' : ''}`}>
        {hits?.length ? (
          hits.map(h => (
            <div className="scard" key={h.id} onClick={() => pick(h.id)}>
              <b>{h.name}</b>
              <small>📞 {h.phone ?? '—'} · {h.address ?? '—'}</small>
            </div>
          ))
        ) : (
          <div className="scard"><small>No match</small></div>
        )}
      </div>
    </div>
  );
}
