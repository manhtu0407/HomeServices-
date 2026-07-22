-- Nothing was watching the learning loop on a schedule.
--
-- Promotion happens inline on every reviewed job, but monitorLearningRules — the piece
-- that spots a degraded rule and reports queue health — was reachable only through an
-- admin HTTP endpoint. Automatic in, manual out.
--
-- The job posts to a secret-authenticated Edge Function rather than to mobile-api,
-- because mobile-api authenticates a user JWT and resolves the caller's role from
-- profiles; pg_cron has no such token and minting a standing admin one would be worse.
-- This mirrors kael-chat-media-retention, the existing cron-driven function.
--
-- IMPORTANT: whether a run rolls anything back is decided by KAEL_LEARNING_AUTO_ROLLBACK
-- on the Edge Function, and that flag DEFAULTS TO TRUE. Set it to false before
-- provisioning the secrets below unless autonomous rollback is genuinely wanted from the
-- first run; with it false the call is observe-only and returns loop_health.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.schedule_kael_learning_monitor()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_url text;
  v_monitor_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null
    or to_regclass('cron.job') is null then
    return false;
  end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret into v_monitor_secret
  from vault.decrypted_secrets
  where name = 'kael_learning_monitor_secret'
  limit 1;

  if nullif(btrim(v_project_url), '') is null
    or nullif(btrim(v_monitor_secret), '') is null then
    return false;
  end if;

  if exists (
    select 1 from cron.job where jobname = 'kael-learning-monitor'
  ) then
    perform cron.unschedule('kael-learning-monitor');
  end if;

  -- 02:00 UTC is 09:00 Ho Chi Minh City: a degraded rule surfaces at the start of the
  -- working day rather than overnight.
  perform cron.schedule(
    'kael-learning-monitor',
    '0 2 * * *',
    $cron$
      with monitor_config as (
        select
          max(decrypted_secret) filter (where name = 'project_url') as project_url,
          max(decrypted_secret) filter (where name = 'kael_learning_monitor_secret') as monitor_secret
        from vault.decrypted_secrets
      )
      select net.http_post(
        url := rtrim(project_url, '/') || '/functions/v1/kael-learning-monitor',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-kael-learning-monitor-secret', monitor_secret
        ),
        body := '{"limit":50}'::jsonb
      )
      from monitor_config
      where nullif(project_url, '') is not null
        and nullif(monitor_secret, '') is not null;
    $cron$
  );
  return true;
end;
$$;

revoke all on function private.schedule_kael_learning_monitor()
  from public, anon, authenticated;
grant execute on function private.schedule_kael_learning_monitor()
  to service_role;

comment on function private.schedule_kael_learning_monitor() is
  'Installs the daily kael-learning-monitor cron job. No-op until the project_url and kael_learning_monitor_secret Vault secrets exist.';

-- Safe no-op until both Vault secrets have been provisioned.
select private.schedule_kael_learning_monitor();

-- Rollback: select cron.unschedule('kael-learning-monitor');
-- drop function private.schedule_kael_learning_monitor();
