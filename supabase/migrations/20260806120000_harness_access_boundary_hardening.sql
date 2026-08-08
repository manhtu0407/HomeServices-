begin;

do $harness_security_definer_search_path_hardening$
declare
  item record;
begin
  for item in
    select routine.oid::regprocedure as routine_signature
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(routine.proconfig, '{}'::text[])) as setting(value)
        where setting.value like 'search_path=%'
      )
  loop
    execute format(
      'alter function %s set search_path = public, pg_catalog',
      item.routine_signature
    );
  end loop;
end;
$harness_security_definer_search_path_hardening$;

commit;
