# Plan 7 — Auth & Admin Surface (login redesign · sign-out · user management) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make auth usable: a Blueprint+ login page, a sign-out button, and an admin-only page to create users and assign roles.

**Architecture:** Login becomes a server page (redirects signed-in users) wrapping a client form. Sign-out is a small client button in the sidebar. User management uses a **server-only service-role Supabase client** (`auth.admin.createUser` + direct `profiles` writes bypassing RLS), exposed through admin-gated Server Actions on the existing `/settings` route.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (@supabase/ssr for session, @supabase/supabase-js service-role client), Vitest.

**Branch:** `feat/auth-admin` (from `main`; merge to `main` when green).

## Global Constraints

- Next.js is **v16**: `cookies()` from `next/headers` is async. Read `node_modules/next/dist/docs/` before non-trivial Next work (AGENTS.md).
- Design = Blueprint+ tokens already in `app/globals.css`; no component libraries. Reference prototype: `docs/design/clearview-proto.html`.
- **Decision (2026-07-06): LIGHT theme stays the default.** Code already defaults light (`app/layout.tsx:12`); if the app appears dark it is a persisted `theme=dark` cookie from an earlier toggle. No default change; the login task below only verifies this.
- `SUPABASE_SERVICE_ROLE_KEY` already exists in `.env.local`. It must **never** be imported into client components — service-role code lives only in `'use server'` files and `lib/supabase/admin.ts`.
- Tests: `npm test` (Vitest, `tests/unit/`), `npm run lint`, `npm run build` must be clean before merge. No new DB migrations in this plan (service-role bypasses RLS; no pgTAP needed).
- Local logins for live verification (password `password123`): `admin@clearview.dev` · `rep@clearview.dev` · `cleaner@clearview.dev`. Stack: `npx supabase start`, `npm run dev`.

---

### Task 1: Blueprint+ login page

**Files:**
- Create: `components/auth/LoginForm.tsx`
- Modify: `app/login/page.tsx` (full rewrite — currently bare unstyled HTML)
- Modify: `app/globals.css` (append `.login` styles at end)

**Interfaces:**
- Consumes: `supabaseBrowser()` from `lib/supabase/client`, `getSession()` from `lib/auth`, existing `.box`/`.brand`/`.logo`/`.lbl`/`.btn-p` CSS.
- Produces: `LoginForm` (no props). `app/login/page.tsx` becomes an async **server** component.

- [ ] **Step 1: Create the client form component**

```tsx
// components/auth/LoginForm.tsx
'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setPending(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password: pw });
    if (error) {
      setErr(error.message);
      setPending(false);
    } else {
      location.href = '/dashboard';
    }
  }

  return (
    <form onSubmit={signIn} className="login-form">
      <label className="lbl" htmlFor="email">Email</label>
      <input
        id="email" type="email" required autoComplete="username"
        value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
      />
      <label className="lbl" htmlFor="password">Password</label>
      <input
        id="password" type="password" required autoComplete="current-password"
        value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••"
      />
      <button className="btn-p" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      {err && <p role="alert" style={{ color: 'var(--lost)', fontSize: 12, margin: 0 }}>{err}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Rewrite the page as a server component (redirect if already signed in)**

```tsx
// app/login/page.tsx  (FULL REPLACEMENT)
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage() {
  if (await getSession()) redirect('/dashboard');
  return (
    <main className="login">
      <div className="login-card box">
        <div className="brand">
          <div className="logo">◇</div>
          <div>
            <b>ClearView</b>
            <small>BLUEPRINT+ CRM</small>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Append login styles to `app/globals.css`** (after the `.kanban .card2` line at the end)

```css
/* login (Plan 7) */
.login { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
.login-card { width: min(360px, 92vw); padding: 26px; }
.login-card .brand { margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1.5px dashed var(--line); }
.login-form { display: flex; flex-direction: column; gap: 8px; }
.login-form .lbl { margin-top: 8px; }
.login-form button { margin-top: 14px; padding: 11px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; border-radius: 4px; }
```

(`.brand`, `.logo`, `.box`, `.btn-p` already exist in globals.css — reuse, do not duplicate.)

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run build`
Expected: 0 errors, build clean.

Live (`npm run dev` with Supabase up):
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login` → `200`.
- Browser: `/login` shows a centered Blueprint+ card on the graph-paper background, **light theme by default in a fresh/incognito window** (theme-default verification for MVP item 2). Wrong password shows the error in red under the button; correct login lands on `/dashboard`. Visiting `/login` while signed in redirects to `/dashboard`.

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx components/auth/LoginForm.tsx app/globals.css
git commit -m "feat(auth): Blueprint+ login page + signed-in redirect"
```

---

### Task 2: Sign-out button in the sidebar

**Files:**
- Create: `components/shell/SignOutButton.tsx`
- Modify: `components/shell/Sidebar.tsx` (add button inside `.foot`, after `.who`)

**Interfaces:**
- Consumes: `supabaseBrowser()` (its `auth.signOut()` clears the @supabase/ssr cookies).
- Produces: `SignOutButton` (no props), rendered by the server `Sidebar`.

- [ ] **Step 1: Create the button**

```tsx
// components/shell/SignOutButton.tsx
'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      className="btn sec"
      type="button"
      disabled={pending}
      style={{ width: '100%', marginTop: 10 }}
      onClick={async () => {
        setPending(true);
        await supabaseBrowser().auth.signOut();
        location.assign('/login'); // full navigation so all server components refetch with no session
      }}
    >
      {pending ? 'Signing out…' : '⎋ Sign out'}
    </button>
  );
}
```

- [ ] **Step 2: Mount it in `components/shell/Sidebar.tsx`**

Add the import and render it inside the existing `.foot` div, after `.who`:

```tsx
import { SignOutButton } from './SignOutButton';
// …inside the component's return, replace the foot block:
      <div className="foot">
        <div className="who">
          <div className="av">{initial}</div>
          <div>
            <b>{name}</b>
            <small>ROLE: {role.toUpperCase()}</small>
          </div>
        </div>
        <SignOutButton />
      </div>
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build` → clean.
Live: click Sign out as admin → lands on `/login`; browser back button must NOT show the app (guard redirects); signing in again works.

- [ ] **Step 4: Commit**

```bash
git add components/shell/SignOutButton.tsx components/shell/Sidebar.tsx
git commit -m "feat(auth): sign-out button in sidebar"
```

---

### Task 3: New-user form parser (pure, TDD)

**Files:**
- Create: `lib/users.ts`
- Test: `tests/unit/users.test.ts`

**Interfaces:**
- Consumes: `Role` type from `lib/auth`.
- Produces: `parseNewUserForm(fd: FormData): { ok: true; value: NewUserInput } | { ok: false; error: string }` and `type NewUserInput = { email: string; password: string; full_name: string; role: Role }`. Task 4's `createUser` action calls this.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/users.test.ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/users.test.ts`
Expected: FAIL — cannot resolve `@/lib/users`.

- [ ] **Step 3: Implement**

```ts
// lib/users.ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/users.test.ts` → PASS (5). Then `npm test` → all suites pass.

- [ ] **Step 5: Commit**

```bash
git add lib/users.ts tests/unit/users.test.ts
git commit -m "feat(users): parseNewUserForm validation (TDD)"
```

---

### Task 4: Service-role client + user-management Server Actions

**Files:**
- Create: `lib/supabase/admin.ts`
- Create: `app/(app)/settings/actions.ts`

**Interfaces:**
- Consumes: `parseNewUserForm` (Task 3), `getRole`/`getSession`/`normalizeRole` from `lib/auth`, env `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `createUser(fd: FormData): Promise<{ error?: string }>` and `setUserRole(userId: string, role: string): Promise<{ error?: string }>` — Task 5's UI calls these.

- [ ] **Step 1: Service-role client**

```ts
// lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';

// Server-only: the service-role key bypasses RLS. NEVER import this from a client
// component — the key must not reach the browser bundle. Only 'use server' action
// files may import it.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
```

- [ ] **Step 2: Actions**

```ts
// app/(app)/settings/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getRole, getSession, normalizeRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { parseNewUserForm } from '@/lib/users';

// Admin creates a login + profile in one go. Service-role client: auth.admin.createUser
// is admin-API-only, and the profiles insert must bypass RLS (no insert policy exists —
// deliberately: only this admin-gated action creates profiles).
export async function createUser(fd: FormData): Promise<{ error?: string }> {
  if ((await getRole()) !== 'admin') return { error: 'Not authorized' };
  const parsed = parseNewUserForm(fd);
  if (!parsed.ok) return { error: parsed.error };
  const { email, password, full_name, role } = parsed.value;
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return { error: error.message };
  const { error: pErr } = await admin.from('profiles').insert({ id: data.user.id, full_name, role });
  if (pErr) return { error: `Login created but profile failed: ${pErr.message}` };
  revalidatePath('/settings');
  return {};
}

export async function setUserRole(userId: string, role: string): Promise<{ error?: string }> {
  if ((await getRole()) !== 'admin') return { error: 'Not authorized' };
  const r = normalizeRole(role);
  if (!r) return { error: 'Invalid role' };
  const me = await getSession();
  if (me?.id === userId) return { error: 'You cannot change your own role' };
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('profiles').update({ role: r }).eq('id', userId).select('id');
  if (error) return { error: error.message };
  if (!data?.length) return { error: 'Profile not found' };
  revalidatePath('/settings');
  return {};
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build` → clean. (Behavioral verification happens in Task 5's live check; these actions have no UI yet.)

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/admin.ts "app/(app)/settings/actions.ts"
git commit -m "feat(users): admin-gated createUser/setUserRole server actions (service role)"
```

---

### Task 5: Settings → Users page UI

**Files:**
- Create: `components/settings/UsersPanel.tsx`
- Modify: `app/(app)/settings/page.tsx` (replace placeholder body)

**Interfaces:**
- Consumes: `createUser`/`setUserRole` (Task 4), `supabaseAdmin` for `auth.admin.listUsers` (emails live in `auth.users`, not `profiles`), `supabaseServer` for the profiles list.
- Produces: `UsersPanel({ users, meId }: { users: PanelUser[]; meId: string })` with `type PanelUser = { id: string; full_name: string; role: 'admin' | 'rep' | 'cleaner'; email: string; created_at: string }`.

- [ ] **Step 1: Server page**

```tsx
// app/(app)/settings/page.tsx  (FULL REPLACEMENT)
import { redirect } from 'next/navigation';
import { getRole, getSession } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { UsersPanel, type PanelUser } from '@/components/settings/UsersPanel';

export default async function SettingsPage() {
  const role = await getRole();
  if (role !== 'admin') redirect('/dashboard');
  const me = (await getSession())!;

  const sb = await supabaseServer();
  const { data: profiles } = await sb
    .from('profiles')
    .select('id,full_name,role,created_at')
    .order('created_at');
  // Emails live in auth.users — admin API only. MVP scale: one page of 200 is plenty.
  const { data: list } = await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 200 });
  const emailById = new Map((list?.users ?? []).map(u => [u.id, u.email ?? '—']));

  const users: PanelUser[] = (profiles ?? []).map(p => ({
    id: p.id,
    full_name: p.full_name,
    role: p.role,
    email: emailById.get(p.id) ?? '—',
    created_at: String(p.created_at).slice(0, 10),
  }));

  return <UsersPanel users={users} meId={me.id} />;
}
```

- [ ] **Step 2: Client panel**

```tsx
// components/settings/UsersPanel.tsx
'use client';
import { useRef, useState, useTransition } from 'react';
import { createUser, setUserRole } from '@/app/(app)/settings/actions';

export type PanelUser = {
  id: string; full_name: string; role: 'admin' | 'rep' | 'cleaner';
  email: string; created_at: string;
};
const ROLES = ['admin', 'rep', 'cleaner'] as const;

export function UsersPanel({ users, meId }: { users: PanelUser[]; meId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = (fd: FormData) => {
    setError(null); setNotice(null);
    startTransition(async () => {
      const res = await createUser(fd);
      if (res?.error) setError(res.error);
      else { setNotice('User created.'); formRef.current?.reset(); }
    });
  };
  const changeRole = (id: string, role: string) => {
    setError(null); setNotice(null);
    startTransition(async () => {
      const res = await setUserRole(id, role);
      if (res?.error) setError(res.error);
    });
  };

  return (
    <section className="screen">
      <div className="panel box">
        <h3>Create user</h3>
        <p className="cap">Login is active immediately (email pre-confirmed).</p>
        <form ref={formRef} action={submit} className="userform">
          <input name="full_name" placeholder="Full name" required />
          <input name="email" type="email" placeholder="email@company.com" required />
          <input name="password" type="password" placeholder="Password (min 8)" required minLength={8} />
          <select name="role" defaultValue="rep">
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="btn" type="submit" disabled={pending}>{pending ? '…' : '+ Create'}</button>
        </form>
        {error && <p role="alert" style={{ color: 'var(--lost)', fontSize: 12 }}>{error}</p>}
        {notice && <p style={{ color: 'var(--won)', fontSize: 12 }}>{notice}</p>}
      </div>
      <div className="panel box">
        <h3>Users ({users.length})</h3>
        <div className="tblwrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Since</th><th>Role</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><b>{u.full_name}</b>{u.id === meId ? <small style={{ color: 'var(--muted)' }}> (you)</small> : null}</td>
                  <td>{u.email}</td>
                  <td>{u.created_at}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={pending || u.id === meId}
                      onChange={e => changeRole(u.id, e.target.value)}
                      aria-label={`Role for ${u.full_name}`}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Append form styles to `app/globals.css`**

```css
/* settings / users (Plan 7) */
.userform { display: grid; grid-template-columns: 1fr 1fr 1fr auto auto; gap: 8px; }
@media (max-width: 900px) { .userform { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Verify live (all cases)**

Run: `npm test && npm run lint && npm run build` → clean. Then with the stack up, as **admin** → `/settings`:
- Three seed users listed with emails and roles; own row's role select disabled.
- Create `test-user@clearview.dev` / `password123` / cleaner → appears in the table; **sign out, sign in as that user** → cleaner nav (no Leads/Invoices/Settings).
- Change that user's role to rep → after refresh their nav shows Leads.
- Short password / bad email → inline error, nothing created.
- As **rep**: `/settings` redirects to `/dashboard` (existing guard).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/settings/page.tsx" components/settings/UsersPanel.tsx app/globals.css
git commit -m "feat(users): admin settings page — create users + assign roles"
```

---

### Task 6: Final review & merge

- [ ] Run everything: `npm test`, `npx supabase test db` (must stay 51/51 — no DB changes), `npm run lint`, `npm run build`.
- [ ] Request a whole-branch code review (superpowers:requesting-code-review); fix findings.
- [ ] Merge `feat/auth-admin` → `main`; update `docs/superpowers/AUTONOMOUS_RUN.md` Phase-1.5 status table.

## Self-Review Notes

- Spec coverage: MVP item 1 (login) → Task 1; item 2 (theme default = light, verified) → Task 1 Step 4; item 5 (sign out) → Task 2; item 6 (user management) → Tasks 3–5.
- `setUserRole` blocks self-role-change → an admin cannot lock themselves out; last-admin protection beyond that is out of scope (recorded in backlog).
- `listUsers` pagination capped at 200 — fine for a small company; recorded in backlog.
