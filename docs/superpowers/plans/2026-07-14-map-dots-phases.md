# Map Dots — Phased Autonomous Execution Prompts

Four phases over the 10 tasks of `docs/superpowers/plans/2026-07-14-map-dots.md`. Each phase = one fresh session, run start-to-finish WITHOUT user interaction (subagent-driven execution + per-task review + phase-end gate). State carries between phases via git (`feat/map-dots`) and the ledger (`.superpowers/sdd/progress.md`).

Phase split logic:
- **Phase A (Tasks 1–3): DB layer.** Migrations 0028–0029 + pgTAP. One dependency chain (dots schema → converts → quote widening), pure SQL, its own test battery (`npm run test:db`).
- **Phase B (Tasks 4–6): client building blocks.** lib vocab/parsers → server actions → popup components. Consumes only Phase A's RPC signatures; all Vitest-verifiable without touching existing screens.
- **Phase C (Tasks 7–9): integration.** Map page rewiring + PinPopover retirement (7), rep quote UI (8), MiniMap (9). The breaking-change wave — everything that touches existing surfaces, in one session so cross-file fallout is fixed where it's caused.
- **Phase D (Task 10): closeout.** Full battery, whole-branch review vs the wave base, fixes, ledger, owner walkthrough checklist.

Rules common to every phase (baked into each prompt): TDD per plan steps, commit per task, reviewer subagent per task, fix Critical/Important findings before moving on, NEVER merge to main, halt only on a contradiction between plan and reality that the spec doesn't resolve (record it in the ledger and stop — do not guess).

---

## Phase A prompt (Tasks 1–3 — DB layer)

```
You are working in D:\Development\ClearViewCRM (Next.js + Supabase CRM). Execute Phase A of the map-dots feature FULLY AUTONOMOUSLY — no user questions; every decision you need is in the plan/spec, and anything neither covers gets recorded in the ledger as a deferred question, choosing the plan's literal reading in the meantime.

READ FIRST (in order):
1. docs/superpowers/plans/2026-07-14-map-dots.md — header, Global Constraints, File Structure, then Tasks 1-3 in full.
2. docs/superpowers/specs/2026-07-14-map-dots-design.md — Data model, RPCs, and rep-quote-widening sections.
3. Tail of .superpowers/sdd/progress.md — ledger style you must append to.

SETUP:
- git checkout main && git pull, then create branch feat/map-dots. Record the base SHA in the ledger entry as WAVE-BASE (Phase D's whole-branch review diffs from it).
- Ensure local supabase is running (npx supabase start if needed). Pre-flight: npm run test:db must be green BEFORE you change anything; record the baseline pgTAP counts.

EXECUTE Tasks 1, 2, 3 from the plan, in order, using superpowers:subagent-driven-development (fresh implementer subagent per task, then a fresh reviewer subagent per task). Each task follows its plan steps EXACTLY (failing test first, migration, db reset, test pass, commit with the plan's commit message). Reviewer checks per task:
- Task 1: RLS/grants match the spec's RPC-only write model (select grant ONLY, no write policies); NULL-safe role checks; pgTAP 17/17.
- Task 2: converts claim via DELETE...RETURNING (no read-then-delete); provenance — diff the customers insert against 0022's and the jobs insert against 0027's create_job semantics line-by-line; pgTAP 34/34.
- Task 3: function bodies are 0021's verbatim except v_admin→v_money (verify 0021 is the newest definition by grepping all migrations first); leads_rep policy scoped deleted_at is null; NO write-grant changes; pgTAP 7/7.
Fix all Critical/Important findings before the next task; note Minors as deferred in the ledger.

PHASE GATE (after Task 3): npx supabase db reset (0001-0029 + seed clean), npm run test:db (all files green — record exact counts), npm run lint, npx tsc --noEmit, npm test (unit suite untouched but must still pass), npm run build.

CLOSE: append a dated Phase A entry to .superpowers/sdd/progress.md in the file's existing style: WAVE-BASE SHA, per-task commits, review outcomes, battery numbers, deferred minors, "Phase B next: plan Tasks 4-6". Commit the ledger. Do NOT merge, do NOT push unless the remote branch already exists from a prior push.
```

---

## Phase B prompt (Tasks 4–6 — client building blocks)

```
You are working in D:\Development\ClearViewCRM (Next.js + Supabase CRM). Execute Phase B of the map-dots feature FULLY AUTONOMOUSLY — no user questions; undecidables get a ledger note + the plan's literal reading.

READ FIRST (in order):
1. docs/superpowers/plans/2026-07-14-map-dots.md — header, Global Constraints, File Structure, then Tasks 4-6 in full (also skim Task 7 so you know what consumes your interfaces — but do NOT implement any of it).
2. docs/superpowers/specs/2026-07-14-map-dots-design.md — Popup UI and Server flow sections.
3. Tail of .superpowers/sdd/progress.md — Phase A's entry (WAVE-BASE, deferred minors).

SETUP:
- git checkout feat/map-dots (must exist with Phase A's commits — migrations 0028/0029 present; verify with `git log --oneline main..HEAD` and `ls supabase/migrations`). If absent, STOP and record the blocker in the ledger.
- Pre-flight: npm test, npx tsc --noEmit, npm run lint all green before starting.

EXECUTE Tasks 4, 5, 6 from the plan, in order, using superpowers:subagent-driven-development (fresh implementer + fresh reviewer per task). Plan steps EXACTLY (failing test first; the plan contains the full test and implementation code). Reviewer checks per task:
- Task 4: DotStatus union matches the SQL enum values byte-for-byte (not_home underscore); buildMapPins dots param defaults [] (old callers unaffected); visibleMapPins is the ONLY filter (no ternary duplicates); parser edge cases match the plan's tests.
- Task 5: action signatures match the plan's Interfaces block exactly (Task 6/7 subagents will import them sight-unseen); revalidation matrix per the plan (dot CRUD → /map+/dashboard; convert lead adds /leads+/customers; convert job adds /jobs+/customers); redirect() not wrapped in try/catch.
- Task 6: popup views match the spec's field lists; status chip click saves immediately with current field values; Job form label is "Cleaners Pay"; cleaner read-only view has zero inputs/buttons besides close; render tests pass.
Fix Critical/Important before the next task; Minors → ledger.

PHASE GATE (after Task 6): npm test (all green — record count), npx tsc --noEmit, npm run lint, npm run build. NOTE: the map page is still on the OLD PinPopover flow — that is correct; integration is Phase C.

CLOSE: dated Phase B ledger entry (commits, reviews, battery, deferred minors, "Phase C next: plan Tasks 7-9"). Commit the ledger. No merge.
```

---

## Phase C prompt (Tasks 7–9 — integration wave)

```
You are working in D:\Development\ClearViewCRM (Next.js + Supabase CRM). Execute Phase C of the map-dots feature FULLY AUTONOMOUSLY — no user questions; undecidables get a ledger note + the plan's literal reading.

READ FIRST (in order):
1. docs/superpowers/plans/2026-07-14-map-dots.md — header, Global Constraints, File Structure, then Tasks 7-9 in full.
2. docs/superpowers/specs/2026-07-14-map-dots-design.md — Map interaction, Map chrome, Server flow, Dashboard MiniMap, and rep-quote sections.
3. Tail of .superpowers/sdd/progress.md — Phase A+B entries.

SETUP:
- git checkout feat/map-dots (Phases A+B present: migrations 0028/0029, lib/dots.ts, DotPopover, dot actions — verify). If absent, STOP with a ledger blocker note.
- Pre-flight battery green: npm test, npx tsc --noEmit, npm run lint, npm run build.

EXECUTE Tasks 7, 8, 9 from the plan, in order, using superpowers:subagent-driven-development (fresh implementer + fresh reviewer per task). Task 7 is the breaking-change task (onPinClick arity widens; PinPopover/createLeadFromPin/parsePinForm deleted) — its plan steps enumerate every consumer; the reviewer must additionally run `grep -rn "parsePinForm\|PinPopover\|createLeadFromPin" app components lib tests` and confirm ZERO hits, and confirm the DB function create_lead_from_pin was NOT dropped. Reviewer checks per task:
- Task 7: three renderers have the dot branch; MapView popup state machine implements BOTH close rules (drawer-key change; absence-from-props with the fresh exemption) as render-phase adjustments, not effects; Dots toggle + DotCounts + hint copy; MapView.dots tests green.
- Task 8: money prop gates ONLY quote view+input; Delete button still admin-gated; leads page history fetch/section untouched; both callers (leads + map pages) updated; pre-existing LeadDrawer tests updated to pass money explicitly.
- Task 9: MiniMap dot clicks route to plain /map (never ?l= — id collision); dashboard preserves the old lead-pin filter (lost + null-geo excluded) exactly; no second dots query.
Fix Critical/Important before the next task; Minors → ledger.

PHASE GATE (after Task 9): npm test, npx tsc --noEmit, npm run lint, npm run build, npx supabase db reset, npm run test:db — ALL green, record numbers.

CLOSE: dated Phase C ledger entry (commits, reviews, battery, deferred minors, "Phase D next: Task 10 closeout"). Commit the ledger. No merge.
```

---

## Phase D prompt (Task 10 — closeout)

```
You are working in D:\Development\ClearViewCRM (Next.js + Supabase CRM). Execute Phase D (final) of the map-dots feature FULLY AUTONOMOUSLY — no user questions.

READ FIRST:
1. docs/superpowers/plans/2026-07-14-map-dots.md — Task 10 + Global Constraints.
2. docs/superpowers/specs/2026-07-14-map-dots-design.md — in full (the review benchmark).
3. .superpowers/sdd/progress.md — Phase A-C entries, especially WAVE-BASE SHA and every deferred Minor.

SETUP: git checkout feat/map-dots; verify Phases A-C commits present.

EXECUTE Task 10:
1. Full battery in the plan's order (lint, tsc, unit, build, db reset 0001-0029 + seed, test:db) — all green before review; fix anything red first.
2. Whole-branch review via superpowers:requesting-code-review — diff WAVE-BASE..HEAD (the SHA from Phase A's ledger entry). Reviewer brief: verify the diff against the SPEC section by section (convert atomicity, RLS/grant deltas exactly as specced, popup state machine, PinPopover retirement completeness, rep quote gating with Delete still admin-only, MiniMap collision routing) AND triage every deferred Minor from the ledger — fix now or explicitly carry with a reason.
3. Fix all Critical/Important findings (single fixer subagent, reviewer re-verifies), re-run the FULL battery after fixes.
4. Append the closing ledger entry: branch commit range, battery numbers, review verdict, carried minors, and the owner walkthrough checklist from the plan's Task 10 Step 4 (verbatim, so the owner can run it from the ledger). State "AWAITING owner walkthrough — do NOT merge".
5. Commit the ledger. Push feat/map-dots to origin so the owner can inspect. Do NOT merge, do NOT open a PR — owner decides after the walkthrough.

FINAL OUTPUT to the session log: commit range, battery numbers, review verdict, carried minors, and the walkthrough checklist.
```

---

## Sequencing notes

- Phases run strictly A → B → C → D; each verifies its predecessor's artifacts at setup and STOPS with a ledger note if missing (no improvising a missing phase).
- The small-changes plan (`2026-07-14-small-changes.md`, 7 tasks) starts only after Phase D + owner walkthrough; its Task 6 needs the dots dashboard fetch, Task 3 the grown mapbox mock. When the owner asks, phase it the same way: Tasks 1–3 (independent tweaks) / Tasks 4–5 (calendar) / Tasks 6–7 (win rate + closeout).
