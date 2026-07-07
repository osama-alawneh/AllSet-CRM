-- Hardening: column-scope the leads write grants so `quote_value` (money) can never be
-- blind-written by a rep via a direct PostgREST POST/PATCH on /rest/v1/leads.
--
-- The gap: 0006 did `grant insert, update on leads to authenticated` (TABLE-level = every
-- column). RLS (0002/0006) lets admin+rep INSERT/UPDATE leads rows, so a rep could PATCH
-- quote_value directly, bypassing the CRUD RPCs (0014) which deliberately ignore a rep's
-- quote. A rep can never READ quote_value back (base-table SELECT is admin-only, 0002;
-- leads_public omits it) — so this is an integrity gap, not a leak, but still a gap.
--
-- Why column-scoping breaks nothing: every APP write to leads now routes through a
-- SECURITY DEFINER function — create_lead/update_lead/delete_lead (0014),
-- create_lead_from_pin (0006), set_lead_status (0007). Definer functions run as the table
-- owner and are UNAFFECTED by these role grants, so quote_value keeps flowing through them
-- (admin-only, per their own role checks). The only direct authenticated-role writes that
-- remain anywhere are in the pgTAP suites (leads_map.sql: rep insert, admin status update),
-- which touch non-money columns only and stay green.
--
-- Grant decision (investigated the codebase — see report): a full REVOKE (no direct writes)
-- was rejected because leads_map.sql exercises legitimate direct writes (rep insert of
-- customer_id/status/service; admin update of status), so `status` and the other non-money
-- columns must stay grantable. We therefore re-grant every column EXCEPT:
--   * quote_value — the money column this migration exists to protect (definer RPCs only);
--   * id          — bigint GENERATED ALWAYS AS IDENTITY; not directly insertable/updatable
--                   by an authenticated caller anyway, so granting it is meaningless.
-- RLS (leads_insert/leads_update, 0006) still gates WHICH roles and rows may write.

revoke insert, update on leads from authenticated;

grant insert (customer_id, status, service, stories, panes, note, created_by, created_at, description, updated_at)
  on leads to authenticated;

grant update (customer_id, status, service, stories, panes, note, created_by, created_at, description, updated_at)
  on leads to authenticated;
