-- The cron request can only be scheduled after both Vault values are configured.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.schedule_payment_maintainer()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_project_url text;
  v_maintainer_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null
    or to_regclass('cron.job') is null then
    return false;
  end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret into v_maintainer_secret
  from vault.decrypted_secrets
  where name = 'payment_maintainer_secret'
  limit 1;

  if nullif(btrim(v_project_url), '') is null
    or nullif(btrim(v_maintainer_secret), '') is null then
    return false;
  end if;

  if exists (select 1 from cron.job where jobname = 'payment-maintainer') then
    perform cron.unschedule('payment-maintainer');
  end if;

  perform cron.schedule(
    'payment-maintainer',
    '*/5 * * * *',
    $cron$
      with maintainer_config as (
        select
          max(decrypted_secret) filter (where name = 'project_url') as project_url,
          max(decrypted_secret) filter (where name = 'payment_maintainer_secret') as maintainer_secret
        from vault.decrypted_secrets
      )
      select net.http_post(
        url := rtrim(project_url, '/') || '/functions/v1/payment-maintainer',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-payment-maintainer-secret', maintainer_secret
        ),
        body := '{}'::jsonb
      )
      from maintainer_config
      where nullif(project_url, '') is not null
        and nullif(maintainer_secret, '') is not null;
    $cron$
  );
  return true;
end;
$function$;

revoke all on function private.schedule_payment_maintainer()
  from public, anon, authenticated;
grant execute on function private.schedule_payment_maintainer()
  to service_role;

select private.schedule_payment_maintainer();
