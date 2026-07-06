'use client';
import { useEffect, useRef, useState } from 'react';
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
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const admin = role === 'admin';
  const canLeads = role === 'admin' || role === 'rep';
  const custFilter = buildEntityOrFilter(q, ['name', 'phone', 'address']);
  const visible = open && custFilter !== null;

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
      setOpen(true);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, custFilter, admin, canLeads]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const pick = (h: SearchHit) => {
    setOpen(false);
    setQ('');
    router.push(hitHref(h), { scroll: false });
  };

  return (
    <div className="search" ref={boxRef}>
      <input
        placeholder="🔍 Search…"
        autoComplete="off"
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => hits && setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && visible && hits?.length) pick(hits[0]);
        }}
        aria-label="Search customers, leads, jobs, invoices"
      />
      <div className={`sresults box ${visible ? 'show' : ''}`}>
        {hits?.length ? (
          GROUP_ORDER.map(kind => {
            const group = hits.filter(h => h.kind === kind);
            if (!group.length) return null;
            return (
              <div key={kind}>
                <div className="lbl" style={{ padding: '6px 10px 2px' }}>{GROUP_LABEL[kind]}</div>
                {group.map(h => (
                  <div className="scard" key={`${h.kind}-${h.id}`} onClick={() => pick(h)}>
                    <b>{h.title}</b>
                    <small>{h.sub}</small>
                  </div>
                ))}
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
