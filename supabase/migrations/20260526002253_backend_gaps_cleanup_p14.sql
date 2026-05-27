-- Phase P14: backend gaps cleanup.
-- - Backfill and enforce api_logs.purpose for telemetry.
-- - Align staging worker district seed data with concrete job districts.
-- - Add scheduled cleanup for jobs stuck in analyzing for more than 24 hours.

-- Legacy rows before P3 did not always carry purpose. Backfill with the
-- closest provider-owned Kael purpose so future telemetry can treat purpose as
-- a required field.
update public.api_logs
set purpose = case
  when provider = 'deepseek'::public.api_provider then 'intent_classification'
  when provider = 'perplexity'::public.api_provider then 'market_lookup'
  when provider = 'anthropic'::public.api_provider then 'vision_analysis'
  else 'legacy_ai_provider_call'
end
where purpose is null or btrim(purpose) = '';

alter table public.api_logs
  drop constraint if exists api_logs_purpose_non_empty;

alter table public.api_logs
  add constraint api_logs_purpose_non_empty
  check (btrim(purpose) <> '') not valid;

alter table public.api_logs validate constraint api_logs_purpose_non_empty;

alter table public.api_logs alter column purpose set not null;

-- Staging carried a broad hcmc_all worker seed alongside the concrete q7 job
-- district. Keep concrete coverage and remove broad fallback when present.
update public.worker_profiles
set
  districts = array_remove(districts, 'hcmc_all'),
  updated_at = now()
where 'hcmc_all' = any(districts)
  and cardinality(array_remove(districts, 'hcmc_all')) > 0;

create or replace function public.cleanup_orphan_analyzing_jobs(
  p_cutoff timestamptz default now() - interval '24 hours'
)
returns table(cleaned_count integer)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  with stale as (
    select id
    from public.jobs
    where status = 'analyzing'::public.job_status
      and created_at < p_cutoff
    for update
  ),
  updated as (
    update public.jobs as j
    set
      status = 'cancelled'::public.job_status,
      cancelled_at = coalesce(j.cancelled_at, now()),
      updated_at = now()
    from stale
    where j.id = stale.id
    returning j.id
  ),
  events as (
    insert into public.job_events (
      job_id,
      actor_id,
      actor_role,
      event_type,
      from_status,
      to_status,
      safe_metadata
    )
    select
      id,
      null,
      null,
      'orphan_analyzing_cleanup',
      'analyzing'::public.job_status,
      'cancelled'::public.job_status,
      jsonb_build_object(
        'cutoff', p_cutoff,
        'cleanup', 'p14_backend_gaps',
        'reason', 'job stuck analyzing for more than 24 hours'
      )
    from updated
    returning id
  )
  select count(*)::integer from updated;
end;
$$;

revoke all on function public.cleanup_orphan_analyzing_jobs(timestamptz) from public;
revoke all on function public.cleanup_orphan_analyzing_jobs(timestamptz) from anon;
revoke all on function public.cleanup_orphan_analyzing_jobs(timestamptz) from authenticated;
grant execute on function public.cleanup_orphan_analyzing_jobs(timestamptz) to service_role;

create extension if not exists pg_cron;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'kael-cleanup-orphan-analyzing-jobs';
  end if;
end $$;

select cron.schedule(
  'kael-cleanup-orphan-analyzing-jobs',
  '17 * * * *',
  $$select public.cleanup_orphan_analyzing_jobs();$$
);
