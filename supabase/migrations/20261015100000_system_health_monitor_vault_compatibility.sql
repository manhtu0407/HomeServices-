begin;

create or replace function public.configure_system_health_monitor_secret(p_secret text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
    or to_regclass('vault.secrets') is null
    or to_regclass('vault.decrypted_secrets') is null
    or not (
      to_regprocedure('vault.create_secret(text,text,text)') is not null
      or exists (
        select 1
        from pg_catalog.pg_proc
        where oid = to_regprocedure('vault.create_secret(text,text,text,uuid)')
          and pronargdefaults >= 1
      )
    )
    or to_regprocedure('private.schedule_system_health_monitor()') is null
  then
    return false;
  end if;

  execute 'delete from vault.secrets where name = $1' using 'system_health_monitor_secret';
  execute 'select vault.create_secret($1, $2, $3)'
    using p_secret, 'system_health_monitor_secret', 'Server credential for the system health Cron collector';

  return private.schedule_system_health_monitor();
end;
$func$;

revoke all on function public.configure_system_health_monitor_secret(text) from public, anon, authenticated;
grant execute on function public.configure_system_health_monitor_secret(text) to service_role;

comment on function public.configure_system_health_monitor_secret(text) is
  'Stores the server-only health Cron credential in Vault and registers the minute schedule without returning the credential.';

commit;
