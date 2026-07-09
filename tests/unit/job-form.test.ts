import { describe, expect, it } from 'vitest';
import { parseJobForm } from '@/lib/jobs';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('parseJobForm', () => {
  it('parses a full form', () => {
    expect(parseJobForm(fd({
      customer_id: '3', service: 'Full house', description: '22 panes', scheduled_date: '2026-07-10', price: '240',
    }))).toEqual({ ok: true, value: {
      customer_id: 3, service: 'Full house', description: '22 panes', scheduled_date: '2026-07-10', price: 240, cleaner_amount: null, recur_days: 0,
    }});
  });
  it('empty optionals become null', () => {
    expect(parseJobForm(fd({ customer_id: '3', service: 'S', description: '', scheduled_date: '', price: '' })))
      .toEqual({ ok: true, value: { customer_id: 3, service: 'S', description: null, scheduled_date: null, price: null, cleaner_amount: null, recur_days: 0 } });
  });
  it('requires customer and service', () => {
    expect(parseJobForm(fd({ customer_id: '0', service: 'x' }))).toEqual({ ok: false, error: 'Customer is required' });
    expect(parseJobForm(fd({ customer_id: '3', service: '' }))).toEqual({ ok: false, error: 'Service is required' });
  });
  it('rejects a malformed date and negative price', () => {
    expect(parseJobForm(fd({ customer_id: '3', service: 'x', scheduled_date: '10/07/2026' }))).toEqual({ ok: false, error: 'Date must be YYYY-MM-DD or YYYY-MM-DDTHH:MM' });
    expect(parseJobForm(fd({ customer_id: '3', service: 'x', price: '-1' }))).toEqual({ ok: false, error: 'Numbers cannot be negative' });
  });
  it('accepts a datetime-local value (date + time)', () => {
    expect(parseJobForm(fd({ customer_id: '3', service: 'x', scheduled_date: '2026-07-10T14:30' }))).toEqual({
      ok: true, value: { customer_id: 3, service: 'x', description: null, scheduled_date: '2026-07-10T14:30', price: null, cleaner_amount: null, recur_days: 0 },
    });
  });
  it('still accepts a bare date (no time) for backward compatibility', () => {
    expect(parseJobForm(fd({ customer_id: '3', service: 'x', scheduled_date: '2026-07-10' }))).toEqual({
      ok: true, value: { customer_id: 3, service: 'x', description: null, scheduled_date: '2026-07-10', price: null, cleaner_amount: null, recur_days: 0 },
    });
  });
  it('rejects a datetime with a malformed time part', () => {
    expect(parseJobForm(fd({ customer_id: '3', service: 'x', scheduled_date: '2026-07-10T14' }))).toEqual({ ok: false, error: 'Date must be YYYY-MM-DD or YYYY-MM-DDTHH:MM' });
    expect(parseJobForm(fd({ customer_id: '3', service: 'x', scheduled_date: '2026-07-10 14:30' }))).toEqual({ ok: false, error: 'Date must be YYYY-MM-DD or YYYY-MM-DDTHH:MM' });
  });
});
