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
    }));
    expect(r).toEqual({ ok: true, value: {
      customer_id: 7, service: 'In + out', description: 'Back panes fragile',
      stories: 2, panes: 14, note: 'gate code 1234', quote: 350,
    }});
  });
  it('empty optionals become null', () => {
    const r = parseLeadForm(fd({ customer_id: '7', service: 'Solo', description: '', stories: '', panes: '', note: '', quote: '' }));
    expect(r).toEqual({ ok: true, value: {
      customer_id: 7, service: 'Solo', description: null, stories: null, panes: null, note: null, quote: null,
    }});
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
