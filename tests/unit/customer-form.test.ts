import { describe, it, expect } from 'vitest';
import { parseCustomerForm } from '@/lib/customers';

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe('parseCustomerForm', () => {
  it('requires a name', () => {
    const r = parseCustomerForm(fd({ name: '  ' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/i);
  });
  it('trims fields and nulls empties', () => {
    const r = parseCustomerForm(fd({ name: ' Sarah Kim ', phone: '', email: ' s@k.io ', address: '', notes: '', type: 'residential' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('Sarah Kim');
      expect(r.value.phone).toBeNull();
      expect(r.value.email).toBe('s@k.io');
      expect(r.value.address).toBeNull();
      expect(r.value.notes).toBeNull();
    }
  });
  it('defaults unknown type to residential, accepts commercial', () => {
    const a = parseCustomerForm(fd({ name: 'A', type: 'weird' }));
    if (a.ok) expect(a.value.type).toBe('residential');
    const b = parseCustomerForm(fd({ name: 'B', type: 'commercial' }));
    if (b.ok) expect(b.value.type).toBe('commercial');
  });
});
