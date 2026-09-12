-- Forward repair for a hosted ledger entry whose worker preference RPC is absent.
-- Preserve unrelated memory and keep all writes behind the actor-bound Edge route.
begin;

create or replace function public.update_worker_kael_memory_preference(
  p_worker_id uuid, p_key text, p_enabled boolean
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_worker_id is null or p_enabled is null or p_key is null or p_key not in (
    'area_preference', 'income_preference', 'travel_limit',
    'skill_preference', 'opportunity_filter', 'auto_accept_work'
  ) then
    raise exception 'WORKER_MEMORY_PREFERENCE_INVALID' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_worker_id and role = 'worker'
  ) then
    raise exception 'WORKER_ROLE_REQUIRED' using errcode = '42501';
  end if;

  insert into public.worker_kael_memory as memory (worker_id, safe_metadata)
  values (p_worker_id, pg_catalog.jsonb_build_object(
    'memory_preferences', pg_catalog.jsonb_build_object(p_key, p_enabled)
  ))
  on conflict (worker_id) do update
  set safe_metadata = pg_catalog.jsonb_set(
    case when pg_catalog.jsonb_typeof(memory.safe_metadata) = 'object'
      then memory.safe_metadata else '{}'::jsonb end,
    '{memory_preferences}',
    (case when pg_catalog.jsonb_typeof(memory.safe_metadata->'memory_preferences') = 'object'
      then memory.safe_metadata->'memory_preferences' else '{}'::jsonb end)
      || pg_catalog.jsonb_build_object(p_key, p_enabled),
    true
  ), updated_at = pg_catalog.clock_timestamp();
  return true;
end;
$function$;

revoke all on function public.update_worker_kael_memory_preference(uuid,text,boolean)
  from public, anon, authenticated;
grant execute on function public.update_worker_kael_memory_preference(uuid,text,boolean)
  to service_role;

commit;
