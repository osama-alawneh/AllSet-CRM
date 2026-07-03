-- Locked chips on the jobs board show the claimer's first name, so every authenticated
-- user must read profile names, not just their own row. The 0002 profiles_self policy
-- (id = auth.uid() or admin) is too narrow. Widen SELECT to any logged-in user.
-- auth_role() is SECURITY DEFINER, so it does not recurse through this policy — no loop.
drop policy profiles_self on profiles;
create policy profiles_read on profiles for select using (auth.uid() is not null);
