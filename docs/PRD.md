# ClearView CRM — Product Requirements Document

**Product:** ClearView CRM (working name)
**For:** A window-cleaning business
**Author:** Product/engineering
**Date:** 2026-07-02
**Status:** Draft v1 — for customer review
**Related:** Interactive prototype (Blueprint+ design), Architecture doc (to follow)

---

## 1. Overview

ClearView is a lightweight CRM built specifically for a window-cleaning business. It turns door-to-door and inbound interest into tracked **leads**, converts won leads into **jobs** that field crews claim and complete, bills them through **invoices**, and keeps every **customer's** full history in one place. A live neighborhood **map** is the heart of the system: the owner drops colored pins on houses (won / lost / follow-up / new) and each pin is a two-way link to a lead.

The product is **web-first and mobile-ready**: office staff use it on desktop; reps and cleaners use it on their phones. It ships first as an installable web app (PWA), with a native mobile app for field crews as a fast-follow.

**Design language:** "Blueprint+" — a precise, engineering-grade interface with a graph-paper grid, monospace type, and a switchable dark mode with glowing map pins. Approved by the customer.

### 1.1 Problem
Generic CRMs don't understand window cleaning: they can't price by pane count / stories / screens, don't map a neighborhood, don't let crews claim jobs, and don't model recurring service. Spreadsheets and a buggy hand-built HTML tool are the current state.

### 1.2 Vision
One place to run the business: see the neighborhood, win work, dispatch crews, get paid — on desktop or phone — while keeping money numbers visible only to the owner.

---

## 2. Goals & success metrics

| Goal | Metric |
|---|---|
| Never lose a lead | 100% of doorstep/inbound leads captured with a map pin |
| Faster dispatch | Crews self-claim jobs; zero double-booking |
| Owner sees the money, staff don't | Revenue/prices hidden from Rep & Cleaner roles (enforced server-side) |
| Get paid | Invoice created → PDF sent → marked paid, all tracked |
| Works in the field | Reps/cleaners fully operable on a phone |
| Cheap to run | MVP runs on free tiers (~$0/mo + domain) |

---

## 3. Users & roles

Three roles, one login system.

| Capability | Admin (owner) | Rep (sales) | Cleaner (field) |
|---|:--:|:--:|:--:|
| See revenue, prices, invoices | ✅ | ❌ | ❌ |
| Dashboard | ✅ (with money) | ✅ (no money) | ✅ (no money) |
| Map — view pins | ✅ | ✅ | ✅ |
| Map — drop pin / create lead | ✅ | ✅ | ❌ (view only) |
| Leads pipeline (kanban) | ✅ | ✅ | ❌ |
| Jobs — view / claim / update status | ✅ | ✅ (view) | ✅ (claim + update own) |
| Customers — view / edit | ✅ | ✅ | ✅ (view) |
| Invoices | ✅ | ❌ | ❌ |
| Users & settings | ✅ | ❌ | ❌ |

**Money visibility is a hard requirement** and must be enforced in the database (row-level security), not just hidden in the UI.

**Job claiming is a hard requirement:** once a cleaner claims a job it locks to them; no one else can claim it (enforced with a transactional check, not just UI state).

---

## 4. Scope

### 4.1 MVP (Phase 1 — build now)
- Auth + 3 roles with server-enforced permissions
- **Customers/Accounts**: profile, editable details, related jobs/invoices/leads, quick call/text/email
- **Leads**: pipeline kanban (New → Follow-up → Won → Lost) with drag-and-drop; won → auto-creates a job
- **Map**: neighborhood map, click house → drop colored pin → create lead; click pin → open lead (two-way linked); status colors
- **Jobs**: board with statuses (Unclaimed → Claimed → In progress → Done); claim-to-lock; job detail linked to customer + lead
- **Invoices** (Admin): create, line items, totals, status (draft/sent/paid), print to PDF
- **Dashboard**: revenue (Admin only), jobs this week, win rate, follow-ups/overdue invoices, revenue chart, claimable jobs, mini-map
- **Global search / typeahead**: type a name → cards with name/phone/address → open customer
- **Export to Excel**: leads, jobs, invoices, customers
- **Mobile**: responsive + installable **PWA** (home-screen icon, offline-light, push)
- Light + dark theme

### 4.2 Roadmap (later phases — in this PRD, built after MVP)
See §8 for phasing.
- **Recurring service** scheduling ("due again" every 4/8/12 wks) — highest-value follow-on
- **Before/after photos** on jobs
- **Today's route** — jobs grouped by neighborhood/proximity
- **Invoice extras**: tax, deposit, payment method, email invoice, online payment link
- **Duplicate-customer detection** on create
- **Tags/segments** (VIP, Commercial), **weather flag** on the day's board
- **Native mobile app** (iOS/Android via Expo) for field crews
- **Customer self-booking** link that feeds leads onto the map
- **Notifications/reminders** (follow-up due, invoice overdue)

### 4.3 Out of scope (v1)
Payroll, accounting integration, multi-company/franchise, marketing automation, inventory.

---

## 5. Domain model

### 5.1 Entities & relationships

```
User (role: Admin | Rep | Cleaner)
  └─ creates/claims ──> Jobs, Leads

Customer (Account/Contact)
  ├─ 1───* Lead
  ├─ 1───* Job
  ├─ 1───* Invoice
  └─ has location (lat/lng) shown as a Map Pin

Lead ──(won)──> Job ──(complete)──> Invoice
Lead 1───1 Map Pin (pin color = lead status)
Job  *───1 Customer,  Job 1───0..1 Lead (origin)
Invoice *───1 Customer, Invoice 1───0..1 Job, Invoice 1───* LineItem
```

### 5.2 Key fields

**Customer**: name, phone, email, address, type (Residential/Commercial), lat/lng, notes, tags*, created_at.

**Lead**: customer_id, status (new/follow/won/lost), service, stories, panes, quote_value, note, created_at. *(Window-specific fields drive pricing.)*

**Job**: customer_id, lead_id, status (unclaimed/claimed/in_progress/done), claimed_by (user), price, scheduled_date, service, photos* (roadmap).

**Invoice**: customer_id, job_id, number, date, status (draft/sent/paid), line_items[{desc, qty, price}], tax*/deposit* (roadmap). Total = derived.

**Map Pin**: derived from a Lead's customer location + lead status color. Not a separate stored entity — it's a rendering of the lead on the customer's coordinates.

*(\* = roadmap field.)*

---

## 6. Feature specifications

### 6.1 Authentication & roles
Email/password (magic-link optional). On login, role determines nav, screens, and data visibility. All money/permission rules enforced in the database via row-level security — the UI hiding is secondary.

### 6.2 Dashboard
Role-aware. Admin sees revenue MTD, overdue invoices (with $), revenue chart. Rep/Cleaner see the same layout with all money hidden (`•••••`). Everyone sees jobs/week, win rate, claimable jobs, and a mini neighborhood map (tap → full map).

### 6.3 Map & pins *(signature feature)*
- Neighborhood map (production: Mapbox satellite/street with real house imagery).
- **Drop a pin:** Admin/Rep clicks an empty spot → popover: address + status (Won 🟢 / Follow 🟡 / Lost 🔴 / New ⚪) → **Create lead**. A new customer + lead are created and the pin appears (animated).
- **Open a pin:** click any pin → opens its lead detail. Two-way link: lead ⇄ pin.
- Pin **color mirrors lead status**; changing status (e.g. on the kanban) recolors the pin.
- Cleaners: view-only.
- Dark mode: pins glow.
- Roadmap: filter by status, cluster, "jobs today" overlay, route lines.

### 6.4 Leads pipeline
Kanban with 4 columns (New / Follow-up / Won / Lost). **Drag a card** between columns to change status. Dropping into **Won auto-creates a Job** (unclaimed). Click a card → lead detail drawer (customer link, window details, notes, activity, quick call/text/email, "Mark won → job").

### 6.5 Jobs
Board with 4 statuses (Unclaimed → Claimed → In progress → Done). **Claim** button locks a job to the current user (server-enforced — first claim wins). Drag between statuses. Cleaners see only claimable + their own jobs and never see prices. Job detail: linked customer + origin lead, editable status, "Create invoice" (Admin).

### 6.6 Customers / accounts
List (filterable) → **customer profile**: editable phone/email/address/type/notes; tabs for **Jobs / Invoices / Leads** (full relationship history); quick call/text/email (`tel:` / `sms:` / `mailto:`). Every related item links back and forth — no dead ends.

### 6.7 Invoices (Admin only)
Create (from a job or blank), pick customer, add/edit line items with live totals, set status (draft/sent/paid). **Print → PDF** (clean invoice layout via browser print/save-as-PDF; production: server-rendered PDF). Feeds dashboard revenue + overdue tracking.

### 6.8 Global search / typeahead
Top-bar search: type a partial name/phone/address → result **cards showing name, phone, address** to confirm the right person → click → open that customer. Same typeahead used to attach a customer when creating leads/invoices. Also seeds duplicate-customer detection (roadmap).

### 6.9 Export to Excel
Every major list (Leads, Jobs, Invoices, Customers) exports to a spreadsheet file. MVP: CSV (opens in Excel). Production: formatted `.xlsx`.

---

## 7. Mobile strategy

**Phase 1 — PWA (installable web app):** one React codebase, responsive; "Add to Home Screen" gives an app icon, fullscreen, push notifications, light offline. Everyone (owner, reps, cleaners) gets an "app on their phone" immediately, for free, no app store.

**Phase 2 — Native app (Expo / React Native) for field crews:** where camera (before/after photos), reliable GPS/routing, robust offline sync, and app-store presence matter. Shares most logic/types with the web app. Adds store fees (Apple $99/yr, Google $25 once).

Rationale: PWA delivers the "app" experience at ~$0; native is added only when field features justify the cost.

---

## 8. Phased roadmap

**Phase 1 — MVP (this build):** auth+roles, customers, leads (kanban), map+pins, jobs (claim/status), invoices+PDF, dashboard, global search, Excel export, PWA, light/dark.

**Phase 2 — Field & recurring:** recurring service ("due again"), before/after photos, today's route, native Expo app, weather flag, tags.

**Phase 3 — Growth & money:** online payments + email invoices + tax/deposit, customer self-booking link, notifications/reminders, reporting/exports, duplicate detection.

---

## 9. Non-functional requirements

- **Security:** role-based access enforced at the database (row-level security). Revenue/prices/invoices never reach a non-Admin client. Job-claim is race-safe.
- **Performance:** dashboard and lists load fast on a mid-range phone; map handles a full neighborhood of pins.
- **Offline (PWA):** app shell loads offline; queued actions sync when back online (best-effort in v1, robust in native).
- **Accessibility:** keyboard focus states, reduced-motion support, readable contrast in both themes.
- **Responsive:** usable from ~360px phones to desktop.

---

## 10. Technology & cost

**Stack:** Next.js + TypeScript + Tailwind (web), shadcn/ui + Motion (UI/animation), **Mapbox** (map/pins), **Supabase** (Postgres + auth + storage + row-level security), **Expo/React Native** (Phase 2 native). Web hosted on Cloudflare Pages / Netlify.

**Running cost (MVP):**

| Item | Free tier | Notes |
|---|---|---|
| Supabase | ✅ | Pauses after ~1 wk inactivity; ~$25/mo when scaling |
| Mapbox | ✅ ~50k loads/mo | Ample for one business |
| Hosting | ✅ Cloudflare Pages / Netlify (commercial-OK) | Avoid Vercel hobby (non-commercial ToS) |
| PWA | ✅ free | No store fees |
| Domain | ~$12/yr | Only fixed cost |
| Native (Phase 2) | Expo free builds | + Apple $99/yr, Google $25 once |

**MVP ≈ free** (domain only). Native later adds store fees.

---

## 11. Assumptions & open questions

- Business name, branding colors, logo — TBD (placeholder "ClearView"). *(Customer to confirm.)*
- Single business / single neighborhood at launch (no multi-tenant).
- Pricing is manual per lead in v1 (no auto-pricing engine yet).
- Existing ChatGPT-built HTML tool to be reviewed for any missed requirements (git URL pending).
- Payment processor for Phase 3 (Stripe?) — TBD.

---

## 12. Acceptance (MVP "done")

- All three roles log in and see the correct nav + money visibility.
- A rep drops a pin → creates a lead → it appears on the map and in the pipeline.
- Dragging a lead to Won creates a job; a cleaner claims it and it locks.
- Admin creates an invoice from a job, prints a PDF, marks it paid; dashboard revenue updates.
- Any list exports to Excel.
- The whole thing is usable and installable on a phone.
