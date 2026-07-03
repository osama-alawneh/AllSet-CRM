-- Rep status changes can't go through a plain UPDATE: UPDATE ... WHERE requires the
-- rows to be SELECT-visible, and base leads SELECT is admin-only to protect
-- quote_value (see 0002). A SECURITY DEFINER function (claim_job precedent, 0003)
-- performs the update under definer rights; the NULL-safe role check gates callers.
create or replace function set_lead_status(p_lead_id bigint, p_status lead_status)
returns void language plpgsql security definer set search_path = '' as $$
declare updated int;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to update leads';
  end if;
  update public.leads set status = p_status where id = p_lead_id;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'Lead % not found', p_lead_id;
  end if;
end $$;
grant execute on function set_lead_status(bigint, lead_status) to authenticated;
comment on function set_lead_status is 'Status changes for kanban/drawer; definer because reps lack SELECT on base leads (money columns).';

-- Note: 0006's leads_update policy remains for admins (who pass the SELECT policy) but
-- app code routes all status changes through this RPC.
