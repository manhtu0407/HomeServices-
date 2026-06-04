-- ============================================================
-- Harden GLOBAL default function privileges for migrations.
--
-- Postgres grants EXECUTE on newly-created functions to PUBLIC by
-- default. A schema-scoped ALTER DEFAULT PRIVILEGES is additive and
-- cannot remove that global PUBLIC default. The previous hardening
-- migration correctly fixed existing functions and future table/sequence
-- grants, but a staging probe showed new public functions still inherited
-- EXECUTE via PUBLIC.
--
-- This global default-ACL revoke is intentionally separate so staging,
-- which already applied 20260604091224, converges without history edits.
-- ============================================================

begin;

alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;

commit;
