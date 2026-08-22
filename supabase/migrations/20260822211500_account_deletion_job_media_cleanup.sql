begin;

create or replace function private.scrub_disposable_account_job_media(
  p_owner_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_ids uuid[] := '{}'::uuid[];
  v_access_job_ids uuid[] := '{}'::uuid[];
  v_storage_refs text[] := '{}'::text[];
begin
  if p_owner_id is null then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_DELETION_OWNER_MISSING';
  end if;

  select
    coalesce(array_agg(distinct owned_media.job_id order by owned_media.job_id), '{}'::uuid[]),
    coalesce(array_agg(distinct owned_media.storage_ref order by owned_media.storage_ref), '{}'::text[])
  into v_job_ids, v_storage_refs
  from (
    select
      asset.job_id,
      'supabase://job-media/' || asset.object_path as storage_ref
    from public.job_media_assets asset
    where asset.owner_id = p_owner_id
      and asset.stage in ('kael_reference', 'access_check_in')
    union
    select
      intent.job_id,
      'supabase://job-media/' || intent.object_path as storage_ref
    from public.job_media_upload_intents intent
    where intent.owner_id = p_owner_id
      and intent.cleaned_at is null
      and (
        intent.status <> 'attached'
        or intent.stage in ('kael_reference', 'access_check_in')
      )
  ) owned_media;

  select coalesce(array_agg(distinct access_media.job_id order by access_media.job_id), '{}'::uuid[])
  into v_access_job_ids
  from (
    select asset.job_id
    from public.job_media_assets asset
    where asset.owner_id = p_owner_id
      and asset.stage = 'access_check_in'
    union
    select intent.job_id
    from public.job_media_upload_intents intent
    where intent.owner_id = p_owner_id
      and intent.cleaned_at is null
      and intent.stage = 'access_check_in'
  ) access_media;

  if cardinality(v_storage_refs) = 0 then
    return v_storage_refs;
  end if;

  update public.jobs job
  set
    photo_urls = array(
      select storage_ref
      from unnest(job.photo_urls) storage_ref
      where not (storage_ref = any(v_storage_refs))
    ),
    completion_photo_urls = array(
      select storage_ref
      from unnest(job.completion_photo_urls) storage_ref
      where not (storage_ref = any(v_storage_refs))
    ),
    apartment_access_state = case
      when job.id = any(v_access_job_ids) then '{}'::jsonb
      else job.apartment_access_state
    end
  where job.id = any(v_job_ids);

  update public.scope_change_requests scope_request
  set evidence_photo_urls = array(
    select storage_ref
    from unnest(scope_request.evidence_photo_urls) storage_ref
    where not (storage_ref = any(v_storage_refs))
  )
  where scope_request.job_id = any(v_job_ids);

  update public.scope_change_request_commands command
  set evidence_photo_urls = array(
    select storage_ref
    from unnest(command.evidence_photo_urls) storage_ref
    where not (storage_ref = any(v_storage_refs))
  )
  where command.job_id = any(v_job_ids);

  update public.worker_cancellation_requests cancellation
  set evidence_photo_urls = array(
    select storage_ref
    from unnest(cancellation.evidence_photo_urls) storage_ref
    where not (storage_ref = any(v_storage_refs))
  )
  where cancellation.job_id = any(v_job_ids);

  delete from public.job_media_assets asset
  where asset.owner_id = p_owner_id
    and ('supabase://job-media/' || asset.object_path) = any(v_storage_refs);

  delete from public.job_media_upload_intents intent
  where intent.owner_id = p_owner_id
    and ('supabase://job-media/' || intent.object_path) = any(v_storage_refs);

  return v_storage_refs;
end;
$$;

create or replace function private.collect_account_deletion_job_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_storage_refs text[] := '{}'::text[];
begin
  v_owner_id := case
    when tg_table_name = 'customer_account_deletion_requests' then new.customer_id
    when tg_table_name = 'worker_account_deletion_requests' then new.worker_id
    else null
  end;

  v_storage_refs := private.scrub_disposable_account_job_media(v_owner_id);
  new.storage_refs := array(
    select distinct storage_ref
    from unnest(coalesce(new.storage_refs, '{}'::text[]) || v_storage_refs) storage_ref
    order by storage_ref
  );
  return new;
end;
$$;

create or replace function private.backfill_processing_account_job_media()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_storage_refs text[] := '{}'::text[];
  v_updated integer := 0;
begin
  for v_request in
    select
      deletion_request.id,
      deletion_request.customer_id as owner_id,
      'customer'::text as actor_role
    from public.customer_account_deletion_requests deletion_request
    where deletion_request.status = 'processing'
    union all
    select
      deletion_request.id,
      deletion_request.worker_id as owner_id,
      'worker'::text as actor_role
    from public.worker_account_deletion_requests deletion_request
    where deletion_request.status = 'processing'
  loop
    v_storage_refs := private.scrub_disposable_account_job_media(v_request.owner_id);
    if cardinality(v_storage_refs) = 0 then
      continue;
    end if;

    if v_request.actor_role = 'customer' then
      update public.customer_account_deletion_requests deletion_request
      set storage_refs = array(
        select distinct storage_ref
        from unnest(coalesce(deletion_request.storage_refs, '{}'::text[]) || v_storage_refs) storage_ref
        order by storage_ref
      )
      where deletion_request.id = v_request.id;
    else
      update public.worker_account_deletion_requests deletion_request
      set storage_refs = array(
        select distinct storage_ref
        from unnest(coalesce(deletion_request.storage_refs, '{}'::text[]) || v_storage_refs) storage_ref
        order by storage_ref
      )
      where deletion_request.id = v_request.id;
    end if;
    v_updated := v_updated + 1;
  end loop;
  return v_updated;
end;
$$;

drop trigger if exists customer_account_deletion_collect_job_media
  on public.customer_account_deletion_requests;
create trigger customer_account_deletion_collect_job_media
  before insert on public.customer_account_deletion_requests
  for each row execute function private.collect_account_deletion_job_media();

drop trigger if exists worker_account_deletion_collect_job_media
  on public.worker_account_deletion_requests;
create trigger worker_account_deletion_collect_job_media
  before insert on public.worker_account_deletion_requests
  for each row execute function private.collect_account_deletion_job_media();

create or replace function public.prepare_customer_account_deletion_v2(
  p_customer_id uuid,
  p_client_request_id uuid
)
returns table (
  request_id uuid,
  request_status text,
  checkpoint text,
  avatar_storage_ref text,
  storage_refs text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_storage_refs text[] := '{}'::text[];
begin
  if (select auth.role()) <> 'service_role' then
    raise exception using errcode = '42501', message = 'ACCOUNT_DELETION_FORBIDDEN';
  end if;

  select coalesce(array_agg(distinct media_ref), '{}'::text[])
  into v_storage_refs
  from (
    select unnest(turn.media_refs) as media_ref
    from public.kael_chat_turns turn
    join public.kael_chat_sessions session on session.id = turn.session_id
    where session.customer_id = p_customer_id
  ) customer_media
  where media_ref like 'supabase://kael-chat-media/' || p_customer_id::text || '/kael-chat/%';

  select *
  into v_request
  from public.prepare_customer_account_deletion(
    p_customer_id,
    p_client_request_id
  );

  update public.customer_account_deletion_requests deletion_request
  set storage_refs = array(
    select distinct storage_ref
    from unnest(coalesce(deletion_request.storage_refs, '{}'::text[]) || v_storage_refs) storage_ref
    order by storage_ref
  )
  where deletion_request.id = v_request.request_id;

  delete from public.kael_voice_transcript
  where user_id = p_customer_id;

  update public.jobs
  set
    address_lat = null,
    address_lng = null,
    apartment_access_profile = '{}'::jsonb,
    apartment_access_state = '{}'::jsonb
  where customer_id = p_customer_id;

  return query
    select
      deletion_request.id,
      deletion_request.status,
      deletion_request.checkpoint,
      deletion_request.avatar_storage_ref,
      deletion_request.storage_refs
    from public.customer_account_deletion_requests deletion_request
    where deletion_request.id = v_request.request_id;
end;
$$;

revoke all on function private.scrub_disposable_account_job_media(uuid)
  from public, anon, authenticated;
revoke all on function private.collect_account_deletion_job_media()
  from public, anon, authenticated;
revoke all on function private.backfill_processing_account_job_media()
  from public, anon, authenticated;
revoke all on function public.prepare_customer_account_deletion_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.prepare_customer_account_deletion_v2(uuid, uuid)
  to service_role;

select private.backfill_processing_account_job_media();

commit;
