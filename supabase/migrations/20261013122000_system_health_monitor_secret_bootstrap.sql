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
    or to_regprocedure('vault.create_secret(text,text,text)') is null
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

create or replace function public.disable_system_health_monitor()
returns boolean
language plpgsql
security definer
set search_path = ''
as $func$
begin
  if to_regclass('cron.job') is null then
    return false;
  end if;

  if exists (select 1 from cron.job where jobname = 'system-health-monitor') then
    perform cron.unschedule('system-health-monitor');
  end if;

  return true;
end;
$func$;

revoke all on function public.disable_system_health_monitor() from public, anon, authenticated;
grant execute on function public.disable_system_health_monitor() to service_role;

comment on function public.disable_system_health_monitor() is
  'Stops only the minute system health collector schedule during rollback and preserves all monitoring evidence.';

commit;
