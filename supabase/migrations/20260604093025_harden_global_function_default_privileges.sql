-- ============================================================
-- Harden global default function privileges for migrations.
--
-- Postgres grants EXECUTE on newly-created functions to PUBLIC by
-- default. The schema-scoped default privilege revoke is not enough
-- to remove that global PUBLIC default for future functions.
-- ============================================================

begin;

alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;

commit;
