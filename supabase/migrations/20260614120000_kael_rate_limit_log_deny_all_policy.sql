-- S2/F5 (Plan.md §38 security hardening — 2026-06-14): explicit deny-all RLS policy +
-- intent comment on the two Edge-only rate-limit log tables.
--
-- These tables already have RLS enabled with all privileges revoked from
-- anon/authenticated (see 20260529110000 and 20260604224500), so direct clients
-- are already denied; only the service-role Edge function touches them (service_role
-- has BYPASSRLS). The Supabase security advisor still raised `rls_enabled_no_policy`
-- (INFO, both envs) because no explicit policy exists. This migration encodes the
-- deny-all intent as a real policy to document it and silence the linter.
--
-- Behavior change: none. Service-role access is unaffected (BYPASSRLS); anon/authenticated
-- were already denied and remain denied.

-- kael_chat_rate_limit_log ---------------------------------------------------
drop policy if exists "deny all direct client access kael_chat_rate_limit_log"
  on public.kael_chat_rate_limit_log;
create policy "deny all direct client access kael_chat_rate_limit_log"
  on public.kael_chat_rate_limit_log
  for all
  to anon, authenticated
  using (false)
  with check (false);
comment on table public.kael_chat_rate_limit_log is
  'Edge-only rate-limit log for /kael/chat. RLS deny-all for anon/authenticated; only the service-role Edge function writes/reads via check_kael_chat_rate(). Never expose to clients.';

-- kael_worker_chat_rate_limit_log --------------------------------------------
drop policy if exists "deny all direct client access kael_worker_chat_rate_limit_log"
  on public.kael_worker_chat_rate_limit_log;
create policy "deny all direct client access kael_worker_chat_rate_limit_log"
  on public.kael_worker_chat_rate_limit_log
  for all
  to anon, authenticated
  using (false)
  with check (false);
comment on table public.kael_worker_chat_rate_limit_log is
  'Edge-only rate-limit log for worker Kael chat. RLS deny-all for anon/authenticated; only the service-role Edge function writes/reads. Never expose to clients.';
