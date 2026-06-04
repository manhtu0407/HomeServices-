-- ============================================================
-- Revoke residual authenticated table DDL-style privileges.
--
-- Earlier hardening removed direct workflow DML but left Supabase default
-- table privileges such as TRUNCATE, REFERENCES, and TRIGGER on several
-- legacy tables. These are not part of the mobile runtime contract, and
-- TRUNCATE in particular must never depend on RLS.
--
-- Preserve the intentional exceptions:
--   - SELECT remains available where previous migrations granted it.
--   - source_trust_registry keeps admin-only DML via RLS.
--   - customer_kael_feedback keeps column-scoped admin update.
-- ============================================================

begin;

revoke truncate, references, trigger on all tables in schema public
  from authenticated;

grant select, insert, update, delete on public.source_trust_registry
  to authenticated;

grant select on public.customer_kael_feedback to authenticated;
grant update (status, safe_metadata) on public.customer_kael_feedback
  to authenticated;

commit;
