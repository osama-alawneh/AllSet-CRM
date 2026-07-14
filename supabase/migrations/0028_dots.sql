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
