begin;

do $$
declare
  v_command text;
begin
  select command into v_command from cron.job where jobname = 'api-logs-cleanup';
  if v_command is null then
    raise exception 'api_logs cleanup cron is missing';
  end if;
  if position('90 days' in v_command) = 0 or position('public.api_logs' in v_command) = 0 then
    raise exception 'api_logs cleanup cron does not enforce the 90-day retention window';
  end if;
end;
$$;

rollback;
