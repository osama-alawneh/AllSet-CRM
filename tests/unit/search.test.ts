import { describe, it, expect } from 'vitest';
import { buildOrFilter, buildEntityOrFilter, filterLeads, filterJobs, filterInvoices, hitHref } from '@/lib/search';

describe('buildOrFilter', () => {
  it('builds ilike or-filter across name/phone/address', () => {
    expect(buildOrFilter('sarah')).toBe(
      'name.ilike.%sarah%,phone.ilike.%sarah%,address.ilike.%sarah%'
    );
  });
  it('returns null for empty/whitespace', () => {
    expect(buildOrFilter('')).toBeNull();
    expect(buildOrFilter('   ')).toBeNull();
  });
  it('strips PostgREST-reserved chars (commas, parens, %, _) so the or() stays valid', () => {
    expect(buildOrFilter('a,b(c)%_d')).toBe(
      'name.ilike.%a b c d%,phone.ilike.%a b c d%,address.ilike.%a b c d%'
    );
  });
  it('collapses whitespace', () => {
    expect(buildOrFilter('  555   0142 ')).toBe(
      'name.ilike.%555 0142%,phone.ilike.%555 0142%,address.ilike.%555 0142%'
    );
  });
});

describe('buildEntityOrFilter', () => {
  it('builds an ilike branch per field', () => {
    expect(buildEntityOrFilter('oak', ['service', 'note'])).toBe('service.ilike.%oak%,note.ilike.%oak%');
  });
  it('sanitizes PostgREST delimiters and wildcards', () => {
    expect(buildEntityOrFilter('a,b(c)%_', ['f'])).toBe('f.ilike.%a b c%');
  });
  it('returns null for blank input', () => {
    expect(buildEntityOrFilter('   ', ['f'])).toBeNull();
  });
});

describe('client-side filters', () => {
  const lead = { customer_name: 'Maple St', address: '12 Maple', service: 'In+out', description: 'back panes', note: null } as never;
  it('filterLeads matches description', () => {
    expect(filterLeads([lead], 'back').length).toBe(1);
    expect(filterLeads([lead], 'zzz').length).toBe(0);
    expect(filterLeads([lead], '')).toEqual([lead]);
  });
  const job = { customer_name: 'Oak Co', address: null, service: 'Full', description: null, claimed_by_name: 'Cleo' } as never;
  it('filterJobs matches claimer name', () => {
    expect(filterJobs([job], 'cleo').length).toBe(1);
  });
  const inv = { number: 'INV-1004', customer_name: 'Oak Co' } as never;
  it('filterInvoices matches number', () => {
    expect(filterInvoices([inv], '1004').length).toBe(1);
  });
});

describe('hitHref', () => {
  it('routes each kind to its drawer', () => {
    expect(hitHref({ kind: 'lead', id: 7, title: '', sub: '' })).toBe('/leads?l=7');
    expect(hitHref({ kind: 'job', id: 8, title: '', sub: '' })).toBe('/jobs?j=8');
    expect(hitHref({ kind: 'invoice', id: 9, title: '', sub: '' })).toBe('/invoices?i=9');
    expect(hitHref({ kind: 'customer', id: 1, title: '', sub: '' })).toBe('/customers?c=1');
  });
});
