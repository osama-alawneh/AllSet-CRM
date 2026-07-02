# Task 6: Login page + route guard

**STATUS:** DONE
**Commit:** `9aca9c9` — "feat(auth): login page + route guard" (branch `feat/foundation`)

## TDD sequence

### 1. Failing test (before)
Created `tests/unit/guard.test.ts` with the two specified cases. Ran `npm test`:

```
✓ tests/unit/smoke.test.ts (1 test)
✓ tests/unit/auth.test.ts (1 test)
❯ tests/unit/guard.test.ts (2 tests | 2 failed)
  × no role → redirect to login
    → (0 , guardDecision) is not a function
  × has role → allow
    → (0 , guardDecision) is not a function

Test Files  1 failed | 2 passed (3)
     Tests  2 failed | 2 passed (4)
```

Confirmed the expected failure mode (`guardDecision` undefined) before writing any implementation.

### 2. Implementation
Appended to `lib/auth.ts`:

```ts
export function guardDecision(role: Role | null): string | null {
  return role ? null : '/login';
}
```

Created:
- `app/(app)/layout.tsx` — async guarded layout, calls `getRole()`, redirects via `guardDecision()`.
- `app/(app)/dashboard/page.tsx` — simple signed-in placeholder page.
- `app/login/page.tsx` — client component login form using `supabaseBrowser().auth.signInWithPassword`.

All created exactly per the task spec, no deviations needed.

### 3. Verification (after)

`npm test`:
```
✓ tests/unit/smoke.test.ts (1 test)
✓ tests/unit/guard.test.ts (2 tests)
✓ tests/unit/auth.test.ts (1 test)

Test Files  3 passed (3)
     Tests  4 passed (4)
```

`npx tsc --noEmit`: clean, no output, exit 0.

`npx --yes next build`: succeeded (Turbopack, Next 16.2.10), ~8s compile + 2.3s TS check. Route table:

```
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /dashboard
└ ○ /login

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

`/dashboard` is correctly dynamic (reads cookies via `getRole()` → `supabaseServer()` → `cookies()`), `/login` and `/` are static. Build succeeded without any Supabase env vars set at build time, as expected — the env reads happen inside functions invoked at request time, not at module load/build time.

## Next-16 route/group adaptations

None needed. The task's provided code matched Next 16 App Router conventions as-is:
- `redirect()` from `next/navigation`, async layout, `Role | null` param typing all compiled clean under strict TypeScript.
- `app/(app)/` route group does not require its own root layout since `app/layout.tsx` already serves as the root layout — route groups only need a root layout if no top-level `layout.js`/`layout.tsx` exists (per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`). No conflicting paths introduced.
- Verified via `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md` that `redirect()` usage in an async Server Component layout (outside try/catch, not awaited/returned) is the correct pattern used here.

## Concerns

- None blocking. The login page's `err` state renders raw Supabase error messages directly to the user — acceptable for this foundational task but worth revisiting for UX/i18n polish later.
- `app/(app)/layout.tsx` calls `getRole()` on every request under the group (including `/dashboard`), which itself calls `supabaseServer()` twice (once via `getSession()`, once directly) — a minor duplicate-client-construction inefficiency, not a correctness issue. Could be optimized later by threading the client through, but out of scope for this task.
- Pre-existing untracked files (`.superpowers/`, `docs/superpowers/task-1/2/4/5-report.md`) were left untouched, as instructed to only stage `app`, `lib`, `tests`.
