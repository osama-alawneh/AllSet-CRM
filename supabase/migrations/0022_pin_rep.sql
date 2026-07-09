-- Owner request #17 follow-up (2026-07-08 final review): map-pin leads were bypassing rep
-- attribution. create_lead_from_pin (0006) inserts a lead with created_by but never rep_id,
-- so a rep-dropped pin renders Rep "—" in the drawer and would be invisible to the future
-- commission model. Provenance: grepped every migration for `create or replace function
-- create_lead_from_pin` — 0006 is the only definition; no later migration recreated it
-- (0015/0021 touch create_lead/update_lead, not the pin RPC). Body below is 0006's CURRENT
-- body verbatim (lines 38-61 of 0006_lead_writes.sql), with the single change: the leads
-- insert also stamps rep_id from v_uid — the function's existing "caller" variable, same
-- one already used for created_by on both inserts. Matches 0021's backfill semantics
-- (rep_id = created_by, i.e. creator ≈ getter) and the owner's locked-in default ("current
-- logged-in user"). Signature, security definer, search_path, and role check are unchanged,
-- so CREATE OR REPLACE is safe in place (no drop/re-grant of a new signature needed) — but
-- we re-grant execute anyway to keep this migration self-contained or verify the same
-- grant.
create or replace function create_lead_from_pin(
  p_name text, p_address text, p_lat float8, p_lng float8, p_status lead_status
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_customer_id bigint;
  v_lead_id bigint;
begin
  -- NULL-safe deny: auth_role() is NULL for an authenticated user with no profiles
  -- row, and `NULL NOT IN (...)` is NULL, so a bare `not in` check is silently
  -- skipped and would let roleless callers through. coalesce(...) treats a NULL
  -- role as denied, matching the implicit NULL-deny of the RLS policies.
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to create leads';
  end if;
  insert into public.customers (name, address, lat, lng, type, created_by)
  values (p_name, p_address, p_lat, p_lng, 'residential', v_uid)
  returning id into v_customer_id;
  insert into public.leads (customer_id, status, service, created_by, rep_id)
  values (v_customer_id, p_status, 'TBD', v_uid, v_uid)
  returning id into v_lead_id;
  return v_lead_id;
end $$;

grant execute on function create_lead_from_pin(text, text, float8, float8, lead_status) to authenticated;
