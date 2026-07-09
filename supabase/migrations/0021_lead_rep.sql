-- Owner request #17 (2026-07-08): attribute a lead to the rep/admin who brought it in,
-- laying the foundation for Tier-3 rep commissions. rep_id is NOT money — safe to expose
-- to every role through leads_public, same as status/service/etc.
alter table leads add column rep_id uuid references profiles(id);
update leads set rep_id = created_by where rep_id is null;  -- backfill: creator ≈ getter

-- leads_public: recreate CURRENT definition verbatim (0020's — soft-delete `where` clause)
-- plus the new rep_id column appended. create or replace view may only APPEND columns;
-- existing column order preserved exactly, so no drop is needed.
create or replace view leads_public as
  select id, customer_id, status, service, stories, panes, note, created_at, description, updated_at, rep_id
  from leads
  where deleted_at is null;

grant select on leads_public to authenticated;

-- create_lead / update_lead: current bodies are 0014's and 0020's respectively (verified by
-- grepping every migration for the newest `create or replace function` of each — 0014 never
-- got a later override for create_lead; update_lead's newest is 0020's `and deleted_at is
-- null` sweep). Every existing check/behavior is kept verbatim; only p_rep_id is added.
--
-- Adding a parameter changes the argument-type signature, so CREATE OR REPLACE cannot be
-- used in place (same pattern as 0018's create_job/update_job datetime change) — the old
-- signatures are dropped first so no ambiguous overload is left behind.
drop function if exists create_lead(bigint, text, text, int, int, text, numeric);
drop function if exists update_lead(bigint, text, text, int, int, text, numeric);

create function create_lead(
  p_customer_id bigint, p_service text, p_description text,
  p_stories int, p_panes int, p_note text, p_quote numeric default null,
  p_rep_id uuid default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean := coalesce(public.auth_role() = 'admin', false);
  v_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to create leads';
  end if;
  -- money admin-only: a rep's p_quote is ignored, never stored. rep_id defaults to the
  -- caller (owner request #17: "by default the current logged-in user") when not supplied;
  -- an admin may attribute the lead to any rep by passing p_rep_id explicitly.
  insert into public.leads (customer_id, service, description, stories, panes, note, quote_value, status, created_by, rep_id)
  values (p_customer_id, p_service, p_description, p_stories, p_panes, p_note,
          case when v_admin then coalesce(p_quote, 0) else 0 end, 'new', auth.uid(),
          coalesce(p_rep_id, auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

create function update_lead(
  p_lead_id bigint, p_service text, p_description text,
  p_stories int, p_panes int, p_note text, p_quote numeric default null,
  p_rep_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean := coalesce(public.auth_role() = 'admin', false);
  updated int;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to update leads';
  end if;
  -- update_lead persists an explicit p_rep_id verbatim (no auth.uid() fallback here — a
  -- null means "leave rep_id unchanged", unlike create_lead's default-to-self).
  update public.leads
     set service = p_service, description = p_description, stories = p_stories,
         panes = p_panes, note = p_note,
         quote_value = case when v_admin and p_quote is not null then p_quote else quote_value end,
         rep_id = coalesce(p_rep_id, rep_id)
   where id = p_lead_id and deleted_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Lead % not found', p_lead_id; end if;
end $$;

grant execute on function create_lead(bigint, text, text, int, int, text, numeric, uuid) to authenticated;
grant execute on function update_lead(bigint, text, text, int, int, text, numeric, uuid) to authenticated;

-- Column-scoped lead grants: CURRENT list is 0016's SEC-4 narrowing (created_by/created_at/
-- updated_at were dropped there to stop a rep spoofing authorship via direct PostgREST
-- writes) — NOT 0015's original wider list. Extend 0016's list with rep_id (not money —
-- safe to grant like every other non-quote_value column; direct writes still gated by the
-- leads_insert/leads_update RLS policies from 0006).
revoke insert, update on leads from authenticated;

grant insert (customer_id, status, service, stories, panes, note, description, rep_id)
  on leads to authenticated;

grant update (customer_id, status, service, stories, panes, note, description, rep_id)
  on leads to authenticated;
