# Small Changes Batch — Phased Autonomous Execution Prompts

Three phases over the 7 tasks of `docs/superpowers/plans/2026-07-14-small-changes.md`. Each phase = one fresh session, run start-to-finish WITHOUT user interaction (subagent-driven execution + per-task review + phase-end gate). State carries via git (`feat/small-changes`) and the ledger (`.superpowers/sdd/progress.md`).

**Hard prerequisite:** the map-dots feature (`feat/map-dots`, phases file `2026-07-14-map-dots-phases.md`) is implemented through its Phase D. Task 6 here needs the dots table + the dashboard dots fetch; Task 3 needs the grown mapbox test mock. Phase 1's setup verifies this and STOPS if absent.

Phase split logic:
- **Phase 1 (Tasks 1–3): independent surface tweaks.** Cleaners Pay rename, streets style + fast flyTo, GeolocateControl. Zero coupling to each other or to the calendar; all Vitest-only.
- **Phase 2 (Tasks 4–5): calendar.** Pure month lib, then the page/grid/nav that consumes it — one dependency chain, the batch's only new route.
- **Phase 3 (Tasks 6–7): win rate + closeout.** The dots-dependent stat change, then full battery + whole-branch review + ledger + walkthrough checklist.

Rules common to every phase (baked into each prompt): TDD per plan steps, commit per task, reviewer subagent per task, fix Critical/Important findings before moving on, NEVER merge to main, halt only on a plan-vs-reality contradiction the spec doesn't resolve (ledger note + stop — do not guess).

---

## Phase 1 prompt (Tasks 1–3 — independent tweaks)

```
You are working in D:\Development\ClearViewCRM (Next.js + Supabase CRM). Execute Phase 1 of the small-changes batch FULLY AUTONOMOUSLY — no user questions; undecidables get a ledger note + the plan's literal reading.

READ FIRST (in order):
1. docs/superpowers/plans/2026-07-14-small-changes.md — header, Global Constraints, File Structure, then Tasks 1-3 in full.
2. docs/superpowers/specs/2026-07-14-small-changes-batch-design.md — items 1, 3, 4, 5.
3. Tail of .superpowers/sdd/progress.md — ledger style + the map-dots closing entry.

SETUP:
- PREREQUISITE CHECK: the map-dots work must be implemented (migrations 0028/0029 exist; components/map/DotPopover.tsx exists; tests/unit/MapboxMap.render.test.tsx mock has getContainer). If the dots work is merged to main, branch feat/small-changes off main; if it still lives unmerged on feat/map-dots, branch feat/small-changes off feat/map-dots and record that base in the ledger. If the dots work is absent entirely, STOP with a ledger blocker note.
- Record the base SHA in the ledger entry as WAVE-BASE (Phase 3's whole-branch review diffs from it).
- Pre-flight: npm test, npx tsc --noEmit, npm run lint green before starting.

EXECUTE Tasks 1, 2, 3 from the plan, in order, using superpowers:subagent-driven-development (fresh implementer subagent per task, fresh reviewer subagent per task). Plan steps EXACTLY (failing test first; the plan contains full code). Reviewer checks per task:
- Task 1: `grep -rni "cleaner pot" components/ app/ lib/ tests/` returns ZERO hits (comments included; docs/ and .superpowers/ exempt); both confirm strings byte-identical to each other and to the plan's exact copy; cleaner_amount identifiers untouched.
- Task 2: MAP_STYLE and FLY_TO_OPTS live in lib/geo.ts and are the ONLY style/speed sources (grep for 'satellite-streets' → zero hits; grep for a literal speed number outside lib/geo.ts → zero hits); the flyTo test asserts speed 2.4 + zoom 16 + center.
- Task 3: GeolocateControl added only when `interactive` (MiniMap test proves absence); exact options object (enableHighAccuracy, trackUserLocation, showUserHeading all true); no custom permission or cleanup code; the accepted-deviation comment from the plan is present.
Fix Critical/Important before the next task; Minors → ledger.

PHASE GATE (after Task 3): npm test (record count), npx tsc --noEmit, npm run lint, npm run build — all green.

CLOSE: dated Phase 1 ledger entry in the file's existing style (WAVE-BASE SHA, per-task commits, review outcomes, battery numbers, deferred minors, "Phase 2 next: plan Tasks 4-5"). Commit the ledger. Do NOT merge.
```

---

## Phase 2 prompt (Tasks 4–5 — calendar)

```
You are working in D:\Development\ClearViewCRM (Next.js + Supabase CRM). Execute Phase 2 of the small-changes batch FULLY AUTONOMOUSLY — no user questions; undecidables get a ledger note + the plan's literal reading.

READ FIRST (in order):
1. docs/superpowers/plans/2026-07-14-small-changes.md — header, Global Constraints, File Structure, then Tasks 4-5 in full.
2. docs/superpowers/specs/2026-07-14-small-changes-batch-design.md — item 2 (calendar) in full, including the drawer-support-fetches and ?m=-preservation paragraphs.
3. Tail of .superpowers/sdd/progress.md — Phase 1 entry.
4. app/(app)/map/page.tsx — the canonical drawer-wiring caller the calendar page copies (prop names may have drifted during dots implementation; the map page at HEAD is the source of truth, per the plan's NOTE).

SETUP:
- git checkout feat/small-changes (Phase 1 commits present — verify Cleaners Pay rename + lib/geo.ts constants exist). If absent, STOP with a ledger blocker note.
- Pre-flight: npm test, npx tsc --noEmit, npm run lint, npm run build green.

EXECUTE Tasks 4, 5 from the plan, in order, using superpowers:subagent-driven-development (fresh implementer + fresh reviewer per task). Plan steps EXACTLY. Reviewer checks per task:
- Task 4: pure functions only (no Date-local parsing — everything UTC/string per the plan); month math survives year wraps and leap February; bucketByDay passes through jobStatusColor/statusColor (verify the unclaimed token assertion matches lib/jobs.ts:10 reality, per the plan's NOTE); unscheduled jobs absent.
- Task 5: ?m= rides on EVERY chip href AND backTo (grep the page/grid for '/calendar?' and verify no bare '/calendar' except the Today link); nav renumbering complete (nav.test.ts updated: admin 10 items, cleaner list includes /calendar); leads fetch skipped entirely for cleaners (not fetched-then-filtered); month-window queries use gte/lt with monthWindow; done jobs included, deleted excluded; drawer support fetches match the map page's set; phones-first CSS breakpoint present; /calendar builds.
Fix Critical/Important before the next task; Minors → ledger.

PHASE GATE (after Task 5): npm test, npx tsc --noEmit, npm run lint, npm run build — all green, record numbers.

CLOSE: dated Phase 2 ledger entry (commits, reviews, battery, deferred minors, "Phase 3 next: plan Tasks 6-7"). Commit the ledger. No merge.
```

---

## Phase 3 prompt (Tasks 6–7 — win rate + closeout)

```
You are working in D:\Development\ClearViewCRM (Next.js + Supabase CRM). Execute Phase 3 (final) of the small-changes batch FULLY AUTONOMOUSLY — no user questions.

READ FIRST (in order):
1. docs/superpowers/plans/2026-07-14-small-changes.md — Tasks 6-7 + Global Constraints.
2. docs/superpowers/specs/2026-07-14-small-changes-batch-design.md — in full (Phase 3's review benchmark is the whole spec).
3. .superpowers/sdd/progress.md — Phase 1-2 entries (WAVE-BASE SHA, every deferred Minor).

SETUP:
- git checkout feat/small-changes; verify Phase 1-2 commits present.
- Verify the dashboard dots fetch exists (app/(app)/dashboard/page.tsx fetches dots — landed with the map-dots feature). If absent, STOP with a ledger blocker note.
- Pre-flight battery green: npm test, npx tsc --noEmit, npm run lint, npm run build.

EXECUTE Task 6 using superpowers:subagent-driven-development (fresh implementer + fresh reviewer). Plan steps EXACTLY. Reviewer checks:
- winRate(leads, noDots) with 0-denominator convention preserved; dashboard derives noDots by filtering the EXISTING dots rows (grep the page for a second dots query → must be none); dashboard.test.ts covers the plan's four cases.

THEN EXECUTE Task 7 (closeout):
1. Full battery in the plan's order (lint, tsc, unit, build, db reset, test:db — the DB steps are sanity-only, this plan has no migrations) — all green before review.
2. Whole-branch review via superpowers:requesting-code-review — diff WAVE-BASE..HEAD (SHA from Phase 1's ledger entry). Reviewer brief: verify against the SPEC item by item (rename sweep zero-hits, style/speed constants sole-sourced, GeolocateControl gating, calendar month-window + ?m= survival + role gating + phones-first collapse, winRate formula + call site) AND triage every deferred Minor from Phases 1-2 — fix now or explicitly carry with a reason.
3. Fix all Critical/Important findings (single fixer subagent, reviewer re-verifies), re-run the FULL battery.
4. Append the closing ledger entry: branch commit range, battery numbers, review verdict, carried minors, and the owner walkthrough checklist from the plan's Task 7 Step 4 (verbatim). State "AWAITING owner walkthrough — do NOT merge".
5. Commit the ledger. Push feat/small-changes to origin. Do NOT merge, do NOT open a PR — owner decides after the walkthrough.

FINAL OUTPUT to the session log: commit range, battery numbers, review verdict, carried minors, walkthrough checklist.
```

---

## Sequencing notes

- Strictly Phase 1 → 2 → 3; each verifies its predecessor's artifacts at setup and stops with a ledger note if missing.
- If the map-dots branch merges to main between phases, do NOT rebase mid-wave — finish on the existing base and note it; the owner decides merge order at walkthrough time.
- After Phase 3 + owner walkthrough, both 2026-07-14 features are done; remaining backlog lives in the ledger (CARRY items) and memory (rep commissions, launch ops).
