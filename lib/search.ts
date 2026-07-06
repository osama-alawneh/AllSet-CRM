import type { Lead } from '@/lib/leads';
import type { Job } from '@/lib/jobs';
import type { Invoice } from '@/lib/invoices';

// Commas/parens delimit or() branches and %/_ are ilike wildcards, so strip them from
// user input; the wildcards we add ourselves are the only ones sent.
const sanitize = (q: string) => q.replace(/[%_,()]/g, ' ').trim().replace(/\s+/g, ' ');

export function buildEntityOrFilter(q: string, fields: string[]): string | null {
  const s = sanitize(q);
  if (!s) return null;
  return fields.map((f) => `${f}.ilike.%${s}%`).join(',');
}

// Back-compat: the customers typeahead filter.
export function buildOrFilter(q: string): string | null {
  return buildEntityOrFilter(q, ['name', 'phone', 'address']);
}

const has = (v: string | null | undefined, f: string) => (v ?? '').toLowerCase().includes(f);

export function filterLeads(rows: Lead[], q: string): Lead[] {
  const f = q.trim().toLowerCase();
  if (!f) return rows;
  return rows.filter(
    (r) => has(r.customer_name, f) || has(r.address, f) || has(r.service, f) || has(r.description, f) || has(r.note, f),
  );
}

export function filterJobs(rows: Job[], q: string): Job[] {
  const f = q.trim().toLowerCase();
  if (!f) return rows;
  return rows.filter(
    (r) =>
      has(r.customer_name, f) ||
      has(r.address, f) ||
      has(r.service, f) ||
      has(r.description, f) ||
      has(r.claimed_by_name, f),
  );
}

export function filterInvoices(rows: Invoice[], q: string): Invoice[] {
  const f = q.trim().toLowerCase();
  if (!f) return rows;
  return rows.filter((r) => has(r.number, f) || has(r.customer_name, f));
}

export type SearchHit = { kind: 'customer' | 'lead' | 'job' | 'invoice'; id: number; title: string; sub: string };

export function hitHref(h: SearchHit): string {
  switch (h.kind) {
    case 'customer':
      return `/customers?c=${h.id}`;
    case 'lead':
      return `/leads?l=${h.id}`;
    case 'job':
      return `/jobs?j=${h.id}`;
    case 'invoice':
      return `/invoices?i=${h.id}`;
  }
}
