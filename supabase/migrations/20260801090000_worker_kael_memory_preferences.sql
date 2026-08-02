-- Persist Worker Kael memory permissions without replacing other safe metadata.
-- The mobile Edge service validates the signed-in worker before calling this RPC.
create or replace function public.update_worker_kael_memory_preference(
  p_worker_id uuid,
  p_key text,
  p_enabled boolean
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_key not in (
    'area_preference',
    'income_preference',
    'travel_limit',
    'skill_preference',
    'opportunity_filter',
    'auto_accept_work'
  ) then
    raise exception 'invalid worker memory preference key' using errcode = '22023';
  end if;

  insert into public.worker_kael_memory (worker_id, safe_metadata)
  values (
    p_worker_id,
    jsonb_build_object('memory_preferences', jsonb_build_object(p_key, p_enabled))
  )
  on conflict (worker_id) do update
  set safe_metadata = jsonb_set(
    case
      when jsonb_typeof(coalesce(worker_kael_memory.safe_metadata, '{}'::jsonb)) = 'object'
        then coalesce(worker_kael_memory.safe_metadata, '{}'::jsonb)
      else '{}'::jsonb
    end,
    '{memory_preferences}',
    (
      case
        when jsonb_typeof(
          coalesce(worker_kael_memory.safe_metadata, '{}'::jsonb)->'memory_preferences'
        ) = 'object'
          then coalesce(worker_kael_memory.safe_metadata, '{}'::jsonb)->'memory_preferences'
        else '{}'::jsonb
      end
    ) || jsonb_build_object(p_key, p_enabled),
    true
  ), updated_at = now();

  return true;
end;
$$;

revoke all on function public.update_worker_kael_memory_preference(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.update_worker_kael_memory_preference(uuid, text, boolean)
  to service_role;
