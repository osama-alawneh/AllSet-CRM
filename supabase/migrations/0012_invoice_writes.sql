-- PRD §6.7: Admin creates/edits/deletes invoices + items. The invoices_admin / items_admin
-- FOR ALL policies (0002) already authorize admins for insert/update/delete/select — no new
-- policy, RPC, or view is needed. Local Supabase does not auto-grant table privileges, and
-- 0002 granted only SELECT, so add the write grants here (RLS still filters non-admin rows).
grant insert, update, delete on invoices, invoice_items to authenticated;

-- Human-facing invoice numbers INV-1001, INV-1002, … are assigned by a sequence-backed
-- column default so the app never computes the next number (no read-modify-write race).
create sequence invoice_number_seq start 1001;
alter table invoices alter column number set default 'INV-' || nextval('invoice_number_seq');

-- 0005 granted USAGE/SELECT on ALL sequences that EXISTED AT THAT TIME — a snapshot, not a
-- standing rule — so it does NOT cover this new sequence. Without this explicit grant an
-- admin insert that fires the default raises "permission denied for sequence invoice_number_seq".
grant usage, select on sequence invoice_number_seq to authenticated;
