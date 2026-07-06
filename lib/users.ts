import type { Role } from '@/lib/auth';

export type NewUserInput = { email: string; password: string; full_name: string; role: Role };

const ROLES: Role[] = ['admin', 'rep', 'cleaner'];

export function parseNewUserForm(
  fd: FormData
): { ok: true; value: NewUserInput } | { ok: false; error: string } {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const full_name = String(fd.get('full_name') ?? '').trim();
  const role = String(fd.get('role') ?? '') as Role;
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'Valid email is required' };
  if (password.length < 8) return { ok: false, error: 'Password must be at least 8 characters' };
  if (!full_name) return { ok: false, error: 'Full name is required' };
  if (!ROLES.includes(role)) return { ok: false, error: 'Invalid role' };
  return { ok: true, value: { email, password, full_name, role } };
}
