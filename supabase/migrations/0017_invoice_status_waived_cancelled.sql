-- Owner request 2026-07-08: two DISTINCT terminal states (different logic later:
-- waived = forgiven debt, cancelled = void). ALTER TYPE ADD VALUE is fine inside
-- a migration as long as the new values aren't USED in this same migration.
alter type invoice_status add value if not exists 'waived';
alter type invoice_status add value if not exists 'cancelled';
