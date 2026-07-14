-- Rep = admin on lead quote (owner decision 2026-07-14, consistent with 0025's
-- rep job-money widening). Two changes ONLY:
--   1) leads_rep SELECT policy (mirrors 0023's jobs_rep), scoped deleted_at is
--      null — deleted-leads history/restore stays structurally admin-only
--      (0025 precedent). The 0004 table-level `grant select on leads to
--      authenticated` already covers quote_value; NO grant changes here, and
--      the INSERT/UPDATE column grants (0016/0021, quote_value deliberately
--      absent) are untouched — direct-PATCH protection stays, writes keep
--      flowing through the RPCs.
--   2) create_lead / update_lead money gate v_admin -> v_money (admin OR rep).
--      Bodies are 0021's verbatim otherwise; signatures unchanged, so CREATE
--      OR REPLACE in place is safe (0022 precedent).
create policy leads_rep on leads for select
  using (auth_role() = 'rep' and deleted_at is null);

create or replace function create_lead(
  p_customer_id bigint, p_service text, p_description text,
  p_stories int, p_panes int, p_note text, p_quote numeric default null,
  p_rep_id uuid default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_money boolean := coalesce(public.auth_role() in ('admin','rep'), false);
  v_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to create leads';
  end if;
  insert into public.leads (customer_id, service, description, stories, panes, note, quote_value, status, created_by, rep_id)
  values (p_customer_id, p_service, p_description, p_stories, p_panes, p_note,
          case when v_money then coalesce(p_quote, 0) else 0 end, 'new', auth.uid(),
          coalesce(p_rep_id, auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

create or replace function update_lead(
  p_lead_id bigint, p_service text, p_description text,
  p_stories int, p_panes int, p_note text, p_quote numeric default null,
  p_rep_id uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_money boolean := coalesce(public.auth_role() in ('admin','rep'), false);
  updated int;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to update leads';
  end if;
  update public.leads
     set service = p_service, description = p_description, stories = p_stories,
         panes = p_panes, note = p_note,
         quote_value = case when v_money and p_quote is not null then p_quote else quote_value end,
         rep_id = coalesce(p_rep_id, rep_id)
   where id = p_lead_id and deleted_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Lead % not found', p_lead_id; end if;
end $$;

grant execute on function create_lead(bigint, text, text, int, int, text, numeric, uuid) to authenticated;
grant execute on function update_lead(bigint, text, text, int, int, text, numeric, uuid) to authenticated;
