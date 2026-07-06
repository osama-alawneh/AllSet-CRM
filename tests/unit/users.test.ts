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
    expect(r).toEqual({ ok: true, value: { email: 'new@co.dev', password: 'password123', full_name: 'New Person', role: 'rep' } });
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
