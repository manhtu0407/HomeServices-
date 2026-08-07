begin;

do $verification$
declare
  missing_rls text[];
  unsafe_definers text[];
  broad_definers text[];
begin
  select array_agg(format('%I.%I', namespace.nspname, relation.relname) order by relation.relname)
    into missing_rls
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and not relation.relrowsecurity;

  if coalesce(array_length(missing_rls, 1), 0) > 0 then
    raise exception 'public tables without RLS: %', missing_rls;
  end if;

  select array_agg(routine.oid::regprocedure::text order by routine.oid::regprocedure::text)
    into unsafe_definers
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(routine.proconfig, '{}'::text[])) as setting(value)
        where setting.value like 'search_path=%'
      );

  if coalesce(array_length(unsafe_definers, 1), 0) > 0 then
    raise exception 'SECURITY DEFINER functions without fixed search_path: %', unsafe_definers;
  end if;

  select array_agg(routine.oid::regprocedure::text order by routine.oid::regprocedure::text)
    into broad_definers
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.prosecdef
      and routine.proname <> 'is_admin'
      and (
        has_function_privilege('public', routine.oid, 'EXECUTE')
        or has_function_privilege('anon', routine.oid, 'EXECUTE')
        or has_function_privilege('authenticated', routine.oid, 'EXECUTE')
      );

  if coalesce(array_length(broad_definers, 1), 0) > 0 then
    raise exception 'SECURITY DEFINER functions with broad execute grants: %', broad_definers;
  end if;
end;
$verification$;

rollback;
