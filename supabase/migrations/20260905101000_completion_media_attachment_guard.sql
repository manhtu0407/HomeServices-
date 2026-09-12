create or replace function private.guard_job_completion_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status not in (
    'completed_by_worker'::public.job_status,
    'confirmed_by_customer'::public.job_status
  ) then
    return new;
  end if;

  if new.worker_id is null
    or coalesce(pg_catalog.cardinality(new.completion_photo_urls), 0) not between 1 and 10
    or exists (
      select 1
      from pg_catalog.unnest(new.completion_photo_urls) as evidence(ref)
      where not exists (
        select 1
        from public.job_media_assets as asset
        where asset.job_id = new.id
          and asset.owner_id = new.worker_id
          and asset.stage = 'after'
          and asset.bucket_id = 'job-media'
          and asset.object_path like new.id::text || '/after/%'
          and evidence.ref = 'supabase://job-media/' || asset.object_path
      )
    )
  then
    raise exception 'CUSTOMER_COMPLETION_EVIDENCE_REQUIRED' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_job_completion_media()
from public, anon, authenticated;

do $trigger_guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.jobs'::regclass
      and tgname = 'jobs_completion_media_attachment_guard'
      and not tgisinternal
  ) then
    create trigger jobs_completion_media_attachment_guard
      before update of status, worker_id, completion_photo_urls on public.jobs
      for each row execute function private.guard_job_completion_media();
  end if;
end;
$trigger_guard$;
