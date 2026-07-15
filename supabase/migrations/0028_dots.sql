-- Map dots: door-knocking canvassing markers BELOW leads in the funnel
-- (spec docs/superpowers/specs/2026-07-14-map-dots-design.md). Scratch data:
-- hard delete, no soft-delete. Writes are RPC-only — no insert/update/delete
-- grants and no write policies (security definer RPCs bypass RLS; write
-- policies without grants would be unreachable decoration).
create type dot_status as enum ('unmarked','yes','no','not_home','callback');

create table dots (
  id          bigint generated always as identity primary key,
  lat         double precision not null,
  lng         double precision not null,
  label       text not null default '',
  notes       text not null default '',
  status      dot_status not null default 'unmarked',
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table dots enable row level security;
-- Owner decision: EVERYONE (cleaners included) sees all dots.
create policy dots_read on dots for select using (auth.uid() is not null);
grant select on dots to authenticated;

create function create_dot(p_lat float8, p_lng float8) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to create dots';
  end if;
  insert into public.dots (lat, lng, created_by)
  values (p_lat, p_lng, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function update_dot(p_id bigint, p_label text, p_notes text, p_status public.dot_status) returns void
language plpgsql security definer set search_path = '' as $$
declare updated int;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to update dots';
  end if;
  update public.dots
     set label = p_label, notes = p_notes, status = p_status, updated_at = now()
   where id = p_id;
  get diagnostics updated = row_count;
  if updated = 0 then raise exception 'Dot % not found', p_id; end if;
end $$;

create function delete_dot(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to delete dots';
  end if;
  -- Idempotent by design: deleting an already-gone dot is a silent success
  -- (popup Delete after a teammate's delete should not error).
  delete from public.dots where id = p_id;
end $$;

grant execute on function create_dot(float8, float8) to authenticated;
grant execute on function update_dot(bigint, text, text, public.dot_status) to authenticated;
grant execute on function delete_dot(bigint) to authenticated;

-- ==== Atomic converts ========================================================
-- The claiming read IS the delete: `delete ... returning` under READ COMMITTED
-- means two concurrent converts of one dot cannot both proceed — the loser's
-- DELETE matches 0 rows and raises instead of minting a duplicate customer.
-- Coordinates are NOT parameters; the dot row is their single source.
-- Provenance: customers insert mirrors 0022 create_lead_from_pin (newest);
-- leads insert mirrors 0021 create_lead's column set (quote stored directly —
-- the role check already restricts callers to admin/rep, the widened money
-- rule of 0029); jobs insert mirrors 0027 create_job (price coalesce-to-0,
-- status unclaimed; no recur — the dot form doesn't offer it).
create function convert_dot_to_lead(
  p_dot_id bigint, p_name text, p_phone text, p_address text,
  p_service text, p_status lead_status, p_note text, p_quote numeric default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lat float8; v_lng float8;
  v_customer_id bigint; v_lead_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to convert dots';
  end if;
  delete from public.dots where id = p_dot_id returning lat, lng into v_lat, v_lng;
  if not found then raise exception 'Dot % not found', p_dot_id; end if;
  insert into public.customers (name, address, phone, lat, lng, type, created_by)
  values (p_name, p_address, p_phone, v_lat, v_lng, 'residential', v_uid)
  returning id into v_customer_id;
  -- status 'won' fires the existing won->job trigger (0006) — intended.
  insert into public.leads (customer_id, service, note, quote_value, status, created_by, rep_id)
  values (v_customer_id, p_service, p_note, coalesce(p_quote, 0), p_status, v_uid, v_uid)
  returning id into v_lead_id;
  return v_lead_id;
end $$;

create function convert_dot_to_job(
  p_dot_id bigint, p_name text, p_phone text, p_address text,
  p_service text, p_description text, p_scheduled timestamptz,
  p_price numeric default null, p_cleaner_amount numeric default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lat float8; v_lng float8;
  v_customer_id bigint; v_job_id bigint;
begin
  if coalesce(public.auth_role() in ('admin','rep'), false) is not true then
    raise exception 'Not authorized to convert dots';
  end if;
  delete from public.dots where id = p_dot_id returning lat, lng into v_lat, v_lng;
  if not found then raise exception 'Dot % not found', p_dot_id; end if;
  insert into public.customers (name, address, phone, lat, lng, type, created_by)
  values (p_name, p_address, p_phone, v_lat, v_lng, 'residential', v_uid)
  returning id into v_customer_id;
  insert into public.jobs (customer_id, service, description, scheduled_date, price, cleaner_amount, status)
  values (v_customer_id, p_service, p_description, p_scheduled, coalesce(p_price, 0), p_cleaner_amount, 'unclaimed')
  returning id into v_job_id;
  return v_job_id;
end $$;

grant execute on function convert_dot_to_lead(bigint, text, text, text, text, lead_status, text, numeric) to authenticated;
grant execute on function convert_dot_to_job(bigint, text, text, text, text, text, timestamptz, numeric, numeric) to authenticated;
