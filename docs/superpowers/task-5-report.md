# Task 5: Supabase clients + auth/role helpers

**STATUS:** DONE
**Commit:** `0af0926` — "feat(auth): supabase clients + role helpers"
(branch `feat/foundation`, parent `da5acd5`)

## Files created

- `lib/supabase/client.ts` — `supabaseBrowser()` via `createBrowserClient` from `@supabase/ssr`.
- `lib/supabase/server.ts` — `supabaseServer()`, async, `await`s Next 16's async `cookies()`
  and wires `getAll`/`setAll` to the cookie store for `createServerClient`.
- `lib/auth.ts` — `Role` type, `normalizeRole()`, `getSession()`, `getRole()` (all await the
  now-async `supabaseServer()`).
- `tests/unit/auth.test.ts` — unit test for `normalizeRole`.

## Files modified

- `vitest.config.ts` — added `resolve.alias` mapping `@` → project root (see "Adaptations" below).

## TDD evidence

### 1. Failing run (before implementation existed)

```
$ npm test
 ✓ tests/unit/smoke.test.ts (1 test)

 FAIL  tests/unit/auth.test.ts [ tests/unit/auth.test.ts ]
Error: Cannot find package '@/lib/auth' imported from 'D:/Development/ClearViewCRM/tests/unit/auth.test.ts'
Caused by: Error: Failed to load url @/lib/auth (resolved id: @/lib/auth) in
tests/unit/auth.test.ts. Does the file exist?

 Test Files  1 failed | 1 passed (2)
      Tests  1 passed (1)
```

Confirms the test was written first and failed for the expected reason (missing module),
not a typo/config error.

### 2. Passing run (after implementation)

```
$ npm test
 ✓ tests/unit/smoke.test.ts (1 test)
 ✓ tests/unit/auth.test.ts (1 test)

 Test Files  2 passed (2)
      Tests  2 passed (2)
```

### 3. Type-check

```
$ npx tsc --noEmit
(no output — exit 0)
```

### 4. Lint (extra check, not required by task but run for safety)

```
$ npx eslint lib tests/unit/auth.test.ts vitest.config.ts
(no output — exit 0)
```

## Next-16 / adaptation notes beyond the async-cookies note in the task brief

1. **`vitest.config.ts` had no `@/` path alias.** The repo's `tsconfig.json` maps `@/*` →
   `./*` for TypeScript/Next's bundler, but Vitest (running on Vite, not the Next/webpack
   resolver) does not read `tsconfig.json` paths automatically, and no `vite-tsconfig-paths`
   plugin is installed. Without a fix, the test file's `import { normalizeRole } from
   '@/lib/auth'` would fail to resolve even after `lib/auth.ts` existed. Added:
   ```ts
   resolve: {
     alias: { '@': path.resolve(process.cwd(), './') },
   },
   ```
   to `vitest.config.ts` (using `process.cwd()` rather than `__dirname` since the config
   file is evaluated by vite-node and `__dirname` semantics aren't guaranteed there; `npm
   test` always runs from the repo root so `process.cwd()` is reliable). This was verified
   necessary by the failing-run step above — the error was a resolution failure, not a
   missing-file error, confirming the alias, not just the file, was needed.

2. **`@supabase/ssr@0.12.0`'s `SetAllCookies` type takes a second `headers` parameter**
   (`(cookies, headers) => void`), used for cache-control headers on auth-cookie writes.
   The task's suggested `setAll: (c) => c.forEach(...)` implementation only declares one
   parameter. This still type-checks under `strict: true` because TypeScript permits a
   function value to have fewer parameters than the target type requires (extra params on
   the interface are simply unused) — confirmed via the clean `tsc --noEmit` run. No code
   change was needed, but noting it since it's a version-specific detail worth knowing if
   the header-based cache-control guidance from the type's doc comment becomes relevant later.

3. Verified against `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`
   per `AGENTS.md`'s instruction to check in-repo docs before writing code (Next 16 docs
   confirm `cookies()` is async, matching the task brief).

## Concerns

- `getRole()` in `lib/auth.ts` selects `profiles.role` but no `profiles` table/migration
  currently exists in `supabase/` in this repo (schema tasks so far cover
  customers/leads/jobs/invoices). `getRole()` will throw/return an error at runtime until
  that table exists — this is out of scope for Task 5 (client/helper scaffolding only) but
  should be tracked before any code path actually calls `getRole()`.
- No integration/e2e test exercises `supabaseServer()` or `getRole()` against a real
  Supabase instance (env vars `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are
  unset locally, per `.env.example`). Only the pure `normalizeRole()` function is
  unit-tested, per the task's explicit scope.
- `supabaseServer()` is now async per Next 16 requirements; any future caller must `await`
  it (already done correctly inside `lib/auth.ts`, but worth flagging for reviewers of
  future route handlers / server components that consume it).
