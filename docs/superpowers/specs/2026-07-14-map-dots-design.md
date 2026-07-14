# Map Dots (Door-Knocking Canvassing) — Design

**Date:** 2026-07-14
**Status:** Approved by owner (brainstorm session 2026-07-14)
**Source:** Owner request + three screenshots of the old Rep-Portal (all-set-rep-portal.vercel.app) dot feature. First of a new change batch; owner says remaining changes are much smaller.

## Problem

Reps canvass door-to-door. They need to mark every door they knock — before anything is a lead — and record the outcome (Yes / No / Not Home / Callback / Unmarked). Today a map click immediately creates a customer + lead (PinPopover), which is too heavy for a knock record and offers no outcome options. The old CRM had "dots" for this; the new app must too.

Dots sit **below** leads in the funnel: dot → (maybe) lead → (maybe) job. The Leads and Jobs tabs keep their existing create flows unchanged; the map becomes dot-first.

## Owner decisions (locked 2026-07-14)

1. Map click flow **replaces** the current direct create-lead popover. Leads/Jobs tab flows unchanged; leads/jobs created from a dot land in the same tables and pages as any other.
2. On convert, the **dot disappears** and the normal lead (or job) pin appears at that spot.
3. Dots are colored by status (legend screenshot: Yes green, No red, Not Home blue, Callback purple; Unmarked gray) and the map shows a **counts pill** per status.
4. **Roles:** admin + rep create dots; **everyone** (cleaners included) sees all dots. Any admin/rep can edit or delete **any** dot.
5. Dot's **Job button creates customer + job directly** — no lead row behind it.
6. The Lead form's dropdown is the **lead status** select (`lead_status`, default `new`). It writes the same lead row, so map and leads page always agree — no sync mechanism needed.
7. **Rep quote widening:** reps can set AND read lead `quote_value` (was admin-only per 0021, rep's value silently stored as 0). Consistent with 0025 where rep = admin on job money. Applies app-wide, not only to dots.
8. Surfaces: **map page + dashboard MiniMap**. No dots list page (YAGNI; revisit if callback follow-up rounds need one).

## Approach

New `dots` table + atomic convert RPCs (chosen over lead-status overloading, which pollutes the funnel, and over client-composed create-then-delete, which is non-atomic).

## Data model (migration 0028)

```sql
create type dot_status as enum ('unmarked','yes','no','not_home','callback');

create table dots (
  id          bigint generated always as identity primary key,
  lat         double precision not null,
  lng         double precision not null,
  label       text not null default '',   -- address / free label
  notes       text not null default '',
  status      dot_status not null default 'unmarked',
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

- **No soft-delete.** Dots are scratch canvassing data, not business records. Delete Dot = hard delete.
- **Access model:** select — any authenticated user (RLS select policy + select grant). Writes — RPC-only: NO insert/update/delete grants are issued and no write policies are created (definer RPCs bypass RLS; write policies would be unreachable decoration). The pgTAP write matrix therefore exercises the RPCs (role checks inside them), not direct DML.

### RPCs

- `create_dot(p_lat, p_lng) returns bigint` — inserts unmarked dot, `created_by = auth.uid()`; admin/rep only.
- `update_dot(p_id, p_label, p_notes, p_status)` — admin/rep only; bumps `updated_at`; **raises "not found"** on a missing dot (house precedent: `update_lead`, 0021).
- `delete_dot(p_id)` — admin/rep only; **idempotent** (deleting an already-deleted dot succeeds silently).
- `convert_dot_to_lead(p_dot_id, p_name, p_phone, p_address, p_service, p_status, p_note, p_quote) returns bigint` — in ONE transaction: **claim the dot with `delete from public.dots where id = p_dot_id returning lat, lng into …; if not found then raise`** (the DELETE is the claiming read — two concurrent converts cannot both pass; the loser raises instead of minting a duplicate customer+lead), then create customer at the returned coordinates, create lead (`rep_id`/`created_by` = caller, per 0021/0022 conventions), return lead id. Coordinates are NOT parameters — the dot row is their single source.
- `convert_dot_to_job(p_dot_id, p_name, p_phone, p_address, p_service, p_description, p_scheduled, p_price, p_cleaner_amount) returns bigint` — same claiming-DELETE shape; creates customer + job (status `unclaimed`, no lead row), returns job id. Money params follow 0025 (rep = admin on job money).
- Form-field → param mapping: Lead page Notes → `p_note` (leads.note; the lead RPC takes no `p_description` — the form has no Description field); Job page Notes → `p_description` (jobs have no note column).
- Convert RPCs are `security definer`, `set search_path = ''`, role-checked (admin/rep), matching every prior RPC. Provenance rule applies: new bodies derive from the NEWEST version of each helper/RPC they mirror (customer insert per 0022's `create_lead_from_pin`, job insert per 0027's `create_job`).

### Rep quote widening (same migration or 0029)

- `create_lead` / `update_lead`: money gate `v_admin` → admin-or-rep (rep's `p_quote` stored instead of coerced to 0/ignored).
- Rep gains read on `leads.quote_value`: add a `leads_rep` **select policy** on the base `leads` table mirroring 0023's `jobs_rep`, scoped `deleted_at is null` — deleted-leads reads stay structurally admin-only, not just UI-gated. That is the ONLY mechanism needed — the 0004 table-level `grant select on leads to authenticated` already covers every column; what 0015/0016/0021 withheld was `quote_value` from the INSERT/UPDATE column grants, and those **write grants stay unchanged** (do not add `quote_value` to them — direct-PATCH protection stays; writes keep flowing through the RPCs). `leads_public` stays quote-free for cleaners.
- Everywhere the app gates lead-quote UI on `admin`, widen to admin-or-rep (leads page quote column/field, map page `quoteById`, LeadDrawer). **Deleted-leads history/restore stays admin-only** (0025 precedent: rep job-write widened but delete/history/restore stayed admin) — the leads page rep branch fetches base `leads` scoped to `deleted_at is null` for quotes; it does NOT adopt the admin branch's deleted-leads section.

## Map interaction

- **Admin/rep click empty map** → dot created immediately (server action → RPC), popup opens on it. No pending ghost state; misclicks are cleaned up with Delete Dot.
- **Click a dot** → popup opens on it.
- **Cleaner:** map click does nothing; dot click opens a read-only popup (status, label, notes visible; no inputs, no buttons).
- Existing lead/job pin behavior unchanged (navigate to `?l=` / `?j=` drawers).

## Popup UI

Reuses the existing `.pop box` overlay positioning (xPct/yPct clamp). Three views, client state:

**Main view** (screenshot 2):
- Label/address input, Notes textarea.
- Status grid of five colored chips — ● Yes ● No ● Not Home ● Callback ● Unmarked — current status highlighted. Clicking a chip saves the status immediately.
- **Save** — persists label/notes edits.
- **Lead** / **Job** — switch to that page view.
- **Delete Dot** — `.btn-danger`, hard delete, popup closes.

**Lead page** (screenshot 1):
- Fields: Name, Number (phone), House number / address (pre-filled from dot label), Quote, Service (`SERVICE_TYPES` select + legacy-value option pattern from Task 17; default `SERVICE_TYPES[0]` = Window Cleaning, matching old CRM), Status (`lead_status` select, default `new`), Notes (pre-filled from dot notes).
- **Save Lead** → `convertDotToLead` → redirect `/map?l=<id>` (dot pin gone, lead pin + LeadDrawer appear — same redirect the old pin-create used).
- **Back** → main view. **Delete Dot** present here too (per screenshot).

**Job page** (same layout):
- Fields: Name, Number, Address (pre-filled from label), Price, Cleaner pot (optional), Service, Scheduled date-time (optional, `datetime-local` per Task 18), Notes.
- **Save Job** → `convertDotToJob` → redirect `/map?j=<id>` (JobDrawer opens).

## Map chrome

- **Counts pill** in the maptools row: per-status colored dot + count, all five statuses (gray unmarked included). Counts are layer-toggle-visible dots, viewport-independent (no bounds tracking).
- **Layer toggle chip** "● Dots" alongside ◆ Leads / ● Jobs (default on).
- Hint text: "click empty space to drop a dot".

## Server flow

- `MapPin` union gains `{ kind: 'dot'; id; lat; lng; status: DotStatus; label }`; `pinKey` already namespaces by kind.
- **Three render sites need a third branch** (today they hard-code a lead/job binary): `pinColor` in `lib/mapPins.ts` gains a `DotStatus` → color map (tokens consistent with existing status colors: yes `--won`, no `--lost`, not_home `--prog`, callback `--sched`, unmarked `--new`); the class ternaries in `MapboxMap.tsx` and `SchematicMap.tsx` (`pin.kind === 'job' ? 'mpin mpin-job' : 'mpin'`) gain a dot case. NOTE: bare `.mpin` is the lead DIAMOND (rotate 45deg); the circle is `.mpin-job` — dots render as a round marker (reuse `.mpin-job`'s shape via a `.mpin-dot` class or share the class).
- **`MapImplProps.onPinClick` widens to `(pin, xPct, yPct)`** — each impl computes container-% at the pin (Mapbox via `map.project`, schematic from its own layout) so MapView can position the dot popup; MiniMap's no-op/router usage updates to the new arity.
- **MapView `visible` filter becomes three-way** (`MapView.tsx:61` currently buckets non-leads under the Jobs toggle) — dots follow the new Dots chip.
- `/map` page adds one `dots` select to the existing `Promise.all`; `buildMapPins` (or a sibling) appends dot pins.
- New server actions in `app/(app)/map/actions.ts`: `createDot`, `updateDot`, `deleteDot`, `convertDotToLead`, `convertDotToJob`. Converts call the RPCs then `redirect`. Revalidation follows the `createLeadFromPin` precedent: dot CRUD revalidates `/map` + `/dashboard`; `convertDotToLead` also `/leads` + `/customers`; `convertDotToJob` also `/jobs` + `/customers`.
- Dot click routing: popup opens client-side (dot pins do NOT navigate to a `?param` drawer; popup state lives in MapView, keyed by dot id). Map click → `createDot` action → refresh → popup opens on the new id. **Popup open-state is derived-safe: it closes whenever its dot id is absent from `pins`** (covers convert-to-job's `?j=` redirect, teammate deletes, and convert-to-lead uniformly — the exact stale-popover class MapView already documents).
- `create_lead_from_pin` (0022) retired from the UI: `createLeadFromPin` action, `PinPopover` component, and `parsePinForm` in `lib/leads.ts` deleted. DB function kept (no destructive migration needed).

## Dashboard MiniMap

- Dashboard page fetches dots and passes them through. MiniMap's prop shape changes: today it takes lead-only `Pin[]` and wraps them as `kind:'lead'`, and routes pin clicks to `/map?l=<id>` — a dot pin passed through unchanged would open the WRONG lead drawer on id collision. Fix in the same change: MiniMap accepts dots (widened prop or separate `dots` prop) and dot-pin clicks route to plain `/map`.

## Error handling

- RPC/action failures render in the popup via the existing `form-err` `role="alert"` pattern.
- Convert on a dot a teammate already deleted/converted → RPC raises → error shown in popup; refresh clears the stale dot.
- `deleteDot` idempotent — no error for already-gone dots.

## Testing

- **pgTAP:** dots read matrix via RLS (all roles select; anon nothing) + direct-DML writes REJECTED for every role (no write grants); write matrix via RPCs (cleaner calls raise; rep/admin succeed incl. on foreign dots); `update_dot` missing-dot raise, `delete_dot` idempotent; `convert_dot_to_lead` and `convert_dot_to_job` happy paths asserting atomicity (customer + lead/job exist AND dot gone) + missing-dot raise + double-convert (second call raises, no duplicate customer); rep quote stored by `create_lead`/`update_lead` after widening; rep can read `quote_value`; rep cannot read soft-deleted leads (policy-scoped, assertion below).
- **Unit:** popup render states (main / lead page / job page / cleaner read-only), status→color map, counts pill, dot `MapPin` construction, MiniMap includes dots, layer toggle filters dots.
- **Battery before review:** lint, tsc, unit, build, `db reset` through the last new migration + seed, pgTAP.

## Out of scope

- Dots list/table page (callback follow-up list) — revisit on demand.
- Territories, dot expiry/cleanup, dot history/undo.
- Rep commissions (separate future spec).
