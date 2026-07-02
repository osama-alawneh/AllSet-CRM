# Task 1: Project scaffold + toolchain — Report

## STATUS: DONE_WITH_CONCERNS

See "Deviations / concerns" below — nothing blocking, but a few things diverged from the literal instructions and are worth a human glance.

## Branch & commits

- Branch created: `feat/foundation`
- `create-next-app` (v16.2.10) auto-initialized git and made an initial commit on `main`:
  - `820db51` — "Initial commit from Create Next App"
- Scaffold + Supabase + Vitest work committed on top, on `feat/foundation`:
  - `5dc7955` — "chore: scaffold Next.js + Supabase + Vitest"

```
* feat/foundation 5dc7955 chore: scaffold Next.js + Supabase + Vitest
  main            820db51 Initial commit from Create Next App
```

`feat/foundation` is checked out and is 1 commit ahead of `main`.

## `npm test` output

```
> clearview-crm@0.1.0 test
> vitest run


 RUN  v3.2.6 D:/Development/ClearViewCRM

 ✓ tests/unit/smoke.test.ts (1 test) 2ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  17:02:36
   Duration  557ms (transform 25ms, setup 0ms, collect 26ms, tests 2ms, environment 0ms, prepare 233ms)
```

1 test passed, as required.

## docs/ intact

`docs/` contents preserved exactly as before scaffolding, plus nothing removed:

```
docs/
├── ARCHITECTURE.md
├── PRD.md
├── prd-brief.html
└── superpowers/
    └── plans/
        └── 2026-07-02-foundation-and-auth.md   (pre-existing, untouched)
```

(Note: `docs/superpowers/` and its `plans/` subfolder already existed before this task started — not created by this task. This report was added alongside it at `docs/superpowers/task-1-report.md`.)

## Deviations / concerns

1. **`create-next-app` fought the non-empty/invalid-name scenario differently than the plan assumed.** Moving `docs/` out was not sufficient — `create-next-app` derives the npm package name from the target directory name when scaffolding into `.`, and `ClearViewCRM` contains capital letters, which npm package names disallow:
   ```
   Could not create a project called "ClearViewCRM" because of npm naming restrictions:
   * name can no longer contain capital letters
   ```
   **Fix applied:** scaffolded into a throwaway subfolder with a valid lowercase name (`clearview-scaffold-tmp`), then moved all resulting files/folders — including dotfiles (`.git`, `.gitignore`) and `node_modules` — up into the repo root via `mv * ` with `dotglob` enabled, then removed the empty subfolder. Afterwards I manually corrected `package.json`'s `"name"` field from the leaked `clearview-scaffold-tmp` to `clearview-crm`.

2. **`--no-turbopack` flag does not exist in this `create-next-app` version (16.2.10).** It's not listed in `--help` and was dropped from the actual invocation rather than risk an unknown-flag error. Turbopack was not explicitly enabled either — scaffold used defaults for the bundler (the `--rspack` flag exists as an alternative but was not requested/used).

3. **There was a stray `CleanView PDF.pdf` (556 KB) at the repo root** that the task brief didn't mention (brief said root contained "ONLY a docs/ folder"). Since it would have also blocked scaffolding into a truly-empty dir (moot given the subfolder approach above, but it still would've been swept up by `create-next-app`'s non-empty-dir check had I gone the literal route), I moved it out alongside `docs/` and moved it back afterward, then included it in the commit since it predates this task and deleting it wasn't authorized. Flagging in case it wasn't meant to be there / should be `.gitignore`d or removed by a human.

4. **Next.js version is 16.2.10**, which is newer/different from what may be expected (a "Next 16" line with breaking API changes vs. common training-data assumptions). `create-next-app` itself auto-generated `AGENTS.md` and `CLAUDE.md` at the repo root warning about this:
   > "This is NOT the Next.js you know — This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."
   Left both files as-is (scaffold defaults); worth being aware of for subsequent feature tasks.

5. **`supabase init`** ran non-interactively via `npx --yes supabase init --yes` with no prompts encountered (no VS Code/Deno question appeared) — produced `supabase/config.toml` and `supabase/.gitignore` cleanly.

6. **`.gitignore` fix:** create-next-app's default `.gitignore` had a blanket `.env*` rule, which would have excluded `.env.example` from git. Changed it to:
   ```
   .env*.local
   .env
   !.env.example
   ```
   Verified via `git check-ignore`: `.env.example` → exit 1 (tracked/not ignored), `.env.local` and `.env` → exit 0 (ignored).

7. **`tsconfig.json` `strict: true`** confirmed present (create-next-app default, untouched).

8. **EBADENGINE warnings** appeared during `npm install` steps (`eslint-visitor-keys@5.0.1` wants Node `^20.19.0 || ^22.13.0 || >=24`, current is `v23.11.0`). Non-fatal, install completed; noting for awareness — Node 24 upgrade may silence this later.

9. **Line-ending warnings** ("LF will be replaced by CRLF") appeared during `git add` — cosmetic, Windows core.autocrlf behavior, not addressed since no `.gitattributes` was requested.

10. Did **not** run `npm run dev` or `npx supabase start`, per constraints.

## Files created/modified this task

- `package.json` — name fixed to `clearview-crm`; added `test` and `test:db` scripts; added `@supabase/supabase-js`, `@supabase/ssr`, `vitest`, `supabase` deps.
- `vitest.config.ts` — new.
- `tests/unit/smoke.test.ts` — new, passing.
- `.env.example` — new, tracked.
- `.gitignore` — patched env rules.
- `supabase/config.toml`, `supabase/.gitignore` — new, from `supabase init`.
- Standard Next.js scaffold files (`app/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `public/`, `README.md`, `AGENTS.md`, `CLAUDE.md`).
