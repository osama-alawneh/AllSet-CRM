'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { buildEntityOrFilter, hitHref, type SearchHit } from '@/lib/search';
import type { Role } from '@/lib/auth';

const GROUP_LABEL: Record<SearchHit['kind'], string> = {
  customer: 'Customers', lead: 'Leads', job: 'Jobs', invoice: 'Invoices',
};
const GROUP_ORDER: SearchHit['kind'][] = ['customer', 'lead', 'job', 'invoice'];

export function GlobalSearch({ role }: { role: Role }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optId = (i: number) => `${listId}-opt-${i}`;
  const admin = role === 'admin';
  const canLeads = role === 'admin' || role === 'rep';
  const custFilter = buildEntityOrFilter(q, ['name', 'phone', 'address']);
  const visible = open && custFilter !== null;
  const orderedHits = hits ? GROUP_ORDER.flatMap(kind => hits.filter(h => h.kind === kind)) : [];

  useEffect(() => {
    if (!custFilter) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const sb = supabaseBrowser();
      const leadFilter = buildEntityOrFilter(q, ['service', 'note', 'description'])!;
      const jobFilter = buildEntityOrFilter(q, ['service', 'description'])!;
      const numFilter = buildEntityOrFilter(q, ['number'])!;
      // Role-gated fan-out; money-free views only. Failed/skipped sources yield [].
      const [cs, ls, js, is] = await Promise.all([
        sb.from('customers').select('id,name,phone,address').or(custFilter).limit(5),
        canLeads
          ? sb.from('leads_public').select('id,service,status,description').or(leadFilter).limit(5)
          : Promise.resolve({ data: [] }),
        sb.from('jobs_public').select('id,service,status,scheduled_date,description').or(jobFilter).limit(5),
        admin
          ? sb.from('invoices').select('id,number,status,issue_date').or(numFilter).limit(5)
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      const out: SearchHit[] = [
        ...(cs.data ?? []).map(c => ({
          kind: 'customer' as const, id: c.id, title: c.name, sub: `📞 ${c.phone ?? '—'} · ${c.address ?? '—'}`,
        })),
        ...(ls.data ?? []).map(l => ({
          kind: 'lead' as const, id: l.id, title: l.service ?? `Lead #${l.id}`, sub: `${l.status} · ${l.description ?? '—'}`,
        })),
        ...(js.data ?? []).map(j => ({
          kind: 'job' as const, id: j.id, title: j.service ?? `Job #${j.id}`, sub: `${j.status} · ${j.scheduled_date ?? 'TBD'}`,
        })),
        ...(is.data ?? []).map(i => ({
          kind: 'invoice' as const, id: i.id, title: i.number, sub: `${i.status} · ${i.issue_date}`,
        })),
      ];
      setHits(out);
      setActive(-1);
      setOpen(true);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, custFilter, admin, canLeads]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) { setOpen(false); setActive(-1); }
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const pick = (h: SearchHit) => {
    setOpen(false);
    setQ('');
    router.push(hitHref(h), { scroll: false });
  };

  let optIndex = -1;

  return (
    <div className="search" ref={boxRef}>
      <input
        placeholder="🔍 Search…"
        autoComplete="off"
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => hits && setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!visible && hits) setOpen(true);
            setActive(a => Math.min(a + 1, orderedHits.length - 1));
          }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, -1)); }
          else if (e.key === 'Enter' && visible && active >= 0 && orderedHits[active]) { e.preventDefault(); pick(orderedHits[active]); }
          else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
        }}
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? optId(active) : undefined}
        aria-autocomplete="list"
        aria-label="Search customers, leads, jobs, invoices"
      />
      <div className={`sresults box ${visible ? 'show' : ''}`} role="listbox" id={listId}>
        {hits?.length ? (
          GROUP_ORDER.map(kind => {
            const group = hits.filter(h => h.kind === kind);
            if (!group.length) return null;
            return (
              <div key={kind}>
                <div className="lbl" style={{ padding: '6px 10px 2px' }}>{GROUP_LABEL[kind]}</div>
                {group.map(h => {
                  optIndex++;
                  const i = optIndex;
                  return (
                    <div
                      key={`${h.kind}-${h.id}`}
                      id={optId(i)}
                      role="option"
                      aria-selected={i === active}
                      className={`scard${i === active ? ' active' : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => pick(h)}
                    >
                      <b>{h.title}</b>
                      <small>{h.sub}</small>
                    </div>
                  );
                })}
              </div>
            );
          })
        ) : (
          <div className="scard"><small>No match</small></div>
        )}
      </div>
    </div>
  );
}
