-- §50 K4.1: retain Kael/API telemetry for 90 days.

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'api-logs-cleanup') then
    perform cron.unschedule('api-logs-cleanup');
  end if;
end $$;

select cron.schedule(
  'api-logs-cleanup',
  '41 3 * * *',
  $$delete from public.api_logs where created_at < now() - interval '90 days'$$
);
