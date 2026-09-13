-- @pillar id: P85-worker-memory-preference-sql
-- @pillar invariant: actor-bound memory preferences persist without clobbering unrelated metadata; direct client roles and invalid inputs cannot write
-- @pillar authority: governance/RULES.md #7
-- @pillar target: public.update_worker_kael_memory_preference
-- @pillar layer: sql
-- @pillar siblings: P71-worker-readiness-onboarding
-- @pillar mutation: remove the RPC or its role/input gates; this rollback-only suite fails

begin;
do $exists$
begin
  if pg_catalog.to_regprocedure('public.update_worker_kael_memory_preference(uuid,text,boolean)') is null then
    raise exception 'WORKER_MEMORY_PREFERENCE_RPC_MISSING';
  end if;
  if has_function_privilege('anon', 'public.update_worker_kael_memory_preference(uuid,text,boolean)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.update_worker_kael_memory_preference(uuid,text,boolean)', 'EXECUTE') then
    raise exception 'DIRECT_WORKER_MEMORY_MUTATION_ALLOWED';
  end if;
end;
$exists$;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d8500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'memory-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d8500000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'memory-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());
update public.profiles set role = 'worker' where id = 'd8500000-0000-4000-8000-000000000001';

set local role service_role;
do $verification$
declare
  v_worker uuid := 'd8500000-0000-4000-8000-000000000001';
  v_key text;
  v_metadata jsonb;
begin
  perform public.update_worker_kael_memory_preference(v_worker, 'area_preference', true);
  update public.worker_kael_memory
    set safe_metadata = safe_metadata || '{"existing_signal":{"retained":true}}'::jsonb
    where worker_id = v_worker;
  perform public.update_worker_kael_memory_preference(v_worker, 'travel_limit', false);
  perform public.update_worker_kael_memory_preference(v_worker, 'travel_limit', false);
  select safe_metadata into strict v_metadata from public.worker_kael_memory where worker_id = v_worker;
  if v_metadata <> '{"existing_signal":{"retained":true},"memory_preferences":{"area_preference":true,"travel_limit":false}}'::jsonb then
    raise exception 'WORKER_MEMORY_METADATA_WAS_CLOBBERED';
  end if;
  if (select count(*) from public.worker_kael_memory where worker_id = v_worker) <> 1 then
    raise exception 'WORKER_MEMORY_RETRY_DUPLICATED';
  end if;
  foreach v_key in array array['invalid_key', null]::text[] loop
    begin
      perform public.update_worker_kael_memory_preference(v_worker, v_key, true);
      raise exception 'INVALID_PREFERENCE_KEY_ACCEPTED';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.update_worker_kael_memory_preference(v_worker, 'area_preference', null);
    raise exception 'NULL_PREFERENCE_ACCEPTED';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.update_worker_kael_memory_preference('d8500000-0000-4000-8000-000000000002', 'area_preference', true);
    raise exception 'CUSTOMER_MEMORY_WRITE_ACCEPTED';
  exception when insufficient_privilege then null;
  end;
end;
$verification$;
reset role;
rollback;
