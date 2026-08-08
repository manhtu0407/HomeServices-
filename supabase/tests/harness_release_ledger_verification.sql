begin;

do $verification$
declare
  release_rls boolean;
  event_rls boolean;
  mutation_grant_count integer;
begin
  select relrowsecurity into release_rls
    from pg_class where oid = 'public.harness_releases'::regclass;
  select relrowsecurity into event_rls
    from pg_class where oid = 'public.harness_release_events'::regclass;
  if not release_rls or not event_rls then
    raise exception 'Harness release ledger tables must have RLS enabled';
  end if;

  select count(*) into mutation_grant_count
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('harness_releases', 'harness_release_events')
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if mutation_grant_count <> 0 then
    raise exception 'Actor roles must not mutate the Harness release ledger';
  end if;



  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'harness_releases'
      and column_name = 'release_artifact'
      and data_type = 'jsonb'
  ) then
    raise exception 'Harness release ledger must store the complete immutable artifact';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.register_harness_release(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Release registration must remain service-role-only';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.harness_releases'::regclass
      and tgname = 'harness_releases_append_only'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.harness_release_events'::regclass
      and tgname = 'harness_release_events_append_only'
      and not tgisinternal
  ) then
    raise exception 'Harness release ledger append-only triggers are missing';
  end if;
end;
$verification$;

rollback;
