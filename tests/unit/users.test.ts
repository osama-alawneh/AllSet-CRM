import { describe, expect, it } from 'vitest';
import { parseNewUserForm } from '@/lib/users';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const good = { email: 'New@Co.dev', password: 'password123', full_name: 'New Person', role: 'rep' };

describe('parseNewUserForm', () => {
  it('accepts a valid form and lowercases the email', () => {
    const r = parseNewUserForm(fd(good));
    expect(r).toEqual({ ok: true, value: { email: 'new@co.dev', password: 'password123', full_name: 'New Person', role: 'rep', phone: '', dob: '' } });
  });
  it('carries phone and dob through when provided', () => {
    const r = parseNewUserForm(fd({ ...good, phone: ' 555-0100 ', dob: '1990-01-01' }));
    expect(r).toEqual({ ok: true, value: { email: 'new@co.dev', password: 'password123', full_name: 'New Person', role: 'rep', phone: '555-0100', dob: '1990-01-01' } });
  });
  it('defaults phone and dob to empty strings when omitted', () => {
    const r = parseNewUserForm(fd(good));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.phone).toBe('');
      expect(r.value.dob).toBe('');
    }
  });
  it('rejects a malformed email', () => {
    expect(parseNewUserForm(fd({ ...good, email: 'nope' }))).toEqual({ ok: false, error: 'Valid email is required' });
  });
  it('rejects a short password', () => {
    expect(parseNewUserForm(fd({ ...good, password: 'short' }))).toEqual({ ok: false, error: 'Password must be at least 8 characters' });
  });
  it('rejects a missing name', () => {
    expect(parseNewUserForm(fd({ ...good, full_name: '  ' }))).toEqual({ ok: false, error: 'Full name is required' });
  });
  it('rejects an unknown role', () => {
    expect(parseNewUserForm(fd({ ...good, role: 'boss' }))).toEqual({ ok: false, error: 'Invalid role' });
  });
});
