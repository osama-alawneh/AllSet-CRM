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
- **RLS:** select — any authenticated user; insert/update/delete — admin or rep, any dot (no ownership restriction).
- Writes go through RPCs (house pattern), not direct table grants beyond what RLS allows for reads.

### RPCs

- `create_dot(p_lat, p_lng) returns bigint` — inserts unmarked dot, `created_by = auth.uid()`; admin/rep only.
- `update_dot(p_id, p_label, p_notes, p_status)` — admin/rep only; bumps `updated_at`.
- `delete_dot(p_id)` — admin/rep only; **idempotent** (deleting an already-deleted dot succeeds silently).
- `convert_dot_to_lead(p_dot_id, p_name, p_phone, p_address, p_service, p_description, p_status, p_note, p_quote) returns bigint` — in ONE transaction: read the dot's lat/lng (raising if the dot no longer exists — teammate deleted/converted it first), create customer at those coordinates, create lead (`rep_id`/`created_by` = caller, per 0021/0022 conventions), delete dot, return lead id. Coordinates are NOT parameters — the dot row is their single source.
- `convert_dot_to_job(p_dot_id, p_name, p_phone, p_address, p_service, p_description, p_scheduled, p_price, p_cleaner_amount) returns bigint` — same shape; creates customer + job (status `unclaimed`, no lead row), deletes dot, returns job id. Money params follow 0025 (rep = admin on job money). Raises on missing dot.
- Convert RPCs are `security definer`, `set search_path = ''`, role-checked (admin/rep), matching every prior RPC. Provenance rule applies: new bodies derive from the NEWEST version of each helper/RPC they mirror (customer insert per 0022's `create_lead_from_pin`, job insert per 0027's `create_job`).

### Rep quote widening (same migration or 0029)

- `create_lead` / `update_lead`: money gate `v_admin` → admin-or-rep (rep's `p_quote` stored instead of coerced to 0/ignored).
- Rep gains read on `leads.quote_value`: a rep select policy on the base `leads` table plus the `quote_value` column grant (the grant 0015/0021 deliberately withheld), mirroring how 0023's `jobs_rep` policy gave reps base-table job money. `leads_public` stays quote-free for cleaners.
- Everywhere the app gates lead-quote UI on `admin`, widen to admin-or-rep (leads page quote column/field, map page `quoteById`, LeadDrawer).

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
- Fields: Name, Number (phone), House number / address (pre-filled from dot label), Quote, Service (`SERVICE_TYPES` select + legacy-value option pattern from Task 17), Status (`lead_status` select, default `new`), Notes (pre-filled from dot notes).
- **Save Lead** → `convertDotToLead` → redirect `/map?l=<id>` (dot pin gone, lead pin + LeadDrawer appear — same redirect the old pin-create used).
- **Back** → main view. **Delete Dot** present here too (per screenshot).

**Job page** (same layout):
- Fields: Name, Number, Address (pre-filled from label), Price, Cleaner pot (optional), Service, Scheduled date-time (optional, `datetime-local` per Task 18), Notes.
- **Save Job** → `convertDotToJob` → redirect `/map?j=<id>` (JobDrawer opens).

## Map chrome

- **Counts pill** in the maptools row: per-status colored dot + count, all five statuses (gray unmarked included), counting currently visible dots.
- **Layer toggle chip** "● Dots" alongside ◆ Leads / ● Jobs (default on).
- Hint text: "click empty space to drop a dot".

## Server flow

- `MapPin` union gains `{ kind: 'dot'; id; lat; lng; status: DotStatus; label }`; `pinKey` already namespaces by kind. Marker uses existing `.mpin` circle styling with `--pc` from a dot-status → color map (tokens consistent with lead/job status colors).
- `/map` page adds one `dots` select to the existing `Promise.all`; `buildMapPins` (or a sibling) appends dot pins.
- New server actions in `app/(app)/map/actions.ts`: `createDot`, `updateDot`, `deleteDot`, `convertDotToLead`, `convertDotToJob`. Converts call the RPCs then `redirect`. All revalidate `/map` and `/dashboard`.
- Dot click routing: popup opens client-side (dot pins do NOT navigate to a `?param` drawer; popup state lives in MapView, keyed by dot id). Map click → `createDot` action → refresh → popup opens on the new id.
- `create_lead_from_pin` (0022) retired from the UI: `createLeadFromPin` action + `PinPopover` component deleted. DB function kept (no destructive migration needed).

## Dashboard MiniMap

- Dashboard page fetches dots and passes them through; MiniMap renders them read-only (it is already non-interactive; any click navigates to `/map`).

## Error handling

- RPC/action failures render in the popup via the existing `form-err` `role="alert"` pattern.
- Convert on a dot a teammate already deleted/converted → RPC raises → error shown in popup; refresh clears the stale dot.
- `deleteDot` idempotent — no error for already-gone dots.

## Testing

- **pgTAP:** dots RLS matrix (cleaner select-only; rep/admin full CRUD incl. foreign dots; anon nothing); create/update/delete RPC role checks; `convert_dot_to_lead` and `convert_dot_to_job` happy paths asserting atomicity (customer + lead/job exist AND dot gone); missing-dot raise; rep quote stored by `create_lead`/`update_lead` after widening; rep can read `quote_value`.
- **Unit:** popup render states (main / lead page / job page / cleaner read-only), status→color map, counts pill, dot `MapPin` construction, MiniMap includes dots, layer toggle filters dots.
- **Battery before review:** lint, tsc, unit, build, `db reset` 0001–0028 + seed, pgTAP.

## Out of scope

- Dots list/table page (callback follow-up list) — revisit on demand.
- Territories, dot expiry/cleanup, dot history/undo.
- Rep commissions (separate future spec).
