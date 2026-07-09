import { describe, expect, it } from 'vitest';
import { parseLeadForm } from '@/lib/leads';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('parseLeadForm', () => {
  it('parses a full form', () => {
    const r = parseLeadForm(fd({
      customer_id: '7', service: 'In + out', description: 'Back panes fragile',
      stories: '2', panes: '14', note: 'gate code 1234', quote: '350',
      rep_id: '90000000-0000-0000-0000-000000000031',
    }));
    expect(r).toEqual({ ok: true, value: {
      customer_id: 7, service: 'In + out', description: 'Back panes fragile',
      stories: 2, panes: 14, note: 'gate code 1234', quote: 350,
      rep_id: '90000000-0000-0000-0000-000000000031',
    }});
  });
  it('empty optionals become null', () => {
    const r = parseLeadForm(fd({ customer_id: '7', service: 'Solo', description: '', stories: '', panes: '', note: '', quote: '', rep_id: '' }));
    expect(r).toEqual({ ok: true, value: {
      customer_id: 7, service: 'Solo', description: null, stories: null, panes: null, note: null, quote: null, rep_id: null,
    }});
  });
  it('omits (nulls) rep_id when the field is absent entirely', () => {
    const r = parseLeadForm(fd({ customer_id: '7', service: 'Solo' }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.rep_id).toBeNull();
  });
  it('stories/panes "0" persists as 0, not null (owner request: default 0, not blank)', () => {
    const r = parseLeadForm(fd({ customer_id: '7', service: 'Solo', stories: '0', panes: '0' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.stories).toBe(0);
      expect(r.value.panes).toBe(0);
    }
  });
  it('requires a customer', () => {
    expect(parseLeadForm(fd({ customer_id: '', service: 'x' }))).toEqual({ ok: false, error: 'Customer is required' });
  });
  it('requires a service', () => {
    expect(parseLeadForm(fd({ customer_id: '7', service: '  ' }))).toEqual({ ok: false, error: 'Service is required' });
  });
  it('rejects negative numbers', () => {
    expect(parseLeadForm(fd({ customer_id: '7', service: 'x', quote: '-5' }))).toEqual({ ok: false, error: 'Numbers cannot be negative' });
    expect(parseLeadForm(fd({ customer_id: '7', service: 'x', stories: '-1' }))).toEqual({ ok: false, error: 'Numbers cannot be negative' });
  });
});
