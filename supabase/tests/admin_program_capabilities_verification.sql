-- @pillar id: P290-program-capabilities-grantable-sql
-- @pillar invariant: Both sub-admin grant layers the team screen calls (the v2 wrapper and the base RPC) accept workers.bonus.manage and workers.discipline.manage and still refuse an unknown capability, so an owner can hand the program screens to a sub-admin
-- @pillar authority: governance/RULES.md #7 | OCR review 2026-09-28: the v2 wrapper kept its own list and refused both new capabilities
-- @pillar target: supabase/migrations/20260928116000_admin_capabilities_bonus_discipline.sql
-- @pillar layer: sql
-- @pillar siblings: P266-ambassador-edge-routes
-- @pillar mutation: Remove 'workers.discipline.manage' from the v2 wrapper's allowlist; the grant is refused as INVALID_INPUT and P290 raises P290_V2_REFUSES_PROGRAM_CAPABILITY

begin;
set local statement_timeout = '20s';

do $capabilities$
declare
  v_code text;
begin
  -- A random owner fails the owner check, which runs only after the capability list passed.
  select error_code into v_code from public.admin_set_sub_admin_access_v2_atomic(
    gen_random_uuid(), gen_random_uuid(), 'grant',
    array['workers.read', 'workers.bonus.manage', 'workers.discipline.manage'], null);
  if v_code is distinct from 'OWNER_REQUIRED' then
    raise exception 'P290_V2_REFUSES_PROGRAM_CAPABILITY: %', v_code;
  end if;

  select error_code into v_code from public.admin_set_sub_admin_access_atomic(
    gen_random_uuid(), gen_random_uuid(), 'grant',
    array['workers.read', 'workers.bonus.manage', 'workers.discipline.manage'], null);
  if v_code is distinct from 'OWNER_REQUIRED' then
    raise exception 'P290_BASE_REFUSES_PROGRAM_CAPABILITY: %', v_code;
  end if;

  select error_code into v_code from public.admin_set_sub_admin_access_v2_atomic(
    gen_random_uuid(), gen_random_uuid(), 'grant', array['workers.everything'], null);
  if v_code is distinct from 'INVALID_INPUT' then
    raise exception 'P290_UNKNOWN_CAPABILITY_ACCEPTED: %', v_code;
  end if;
end;
$capabilities$;

rollback;
