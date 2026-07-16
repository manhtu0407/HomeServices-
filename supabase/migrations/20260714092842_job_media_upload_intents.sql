begin;

create table public.job_media_upload_intents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null default 'job-media' check (bucket_id = 'job-media'),
  object_path text not null unique,
  stage text not null check (stage in (
    'before',
    'after',
    'kael_reference',
    'cancellation_evidence',
    'scope_change_evidence',
    'access_check_in'
  )),
  mime_type text not null check (mime_type in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4'
  )),
  file_size_bytes bigint not null
    check (file_size_bytes > 0 and file_size_bytes <= 26214400),
  status text not null default 'reserved' check (status in (
    'reserved',
    'attached',
    'cleanup_pending',
    'cleaned'
  )),
  expires_at timestamptz not null,
  delete_after timestamptz,
  attached_at timestamptz,
  cleanup_claim_token uuid,
  cleanup_claimed_at timestamptz,
  cleaned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_media_upload_intents_job_created_idx
  on public.job_media_upload_intents(job_id, created_at desc);
create index job_media_upload_intents_owner_created_idx
  on public.job_media_upload_intents(owner_id, created_at desc);
create index job_media_upload_intents_cleanup_idx
  on public.job_media_upload_intents(delete_after, cleanup_claimed_at)
  where cleaned_at is null;

alter table public.job_media_upload_intents enable row level security;
revoke all on table public.job_media_upload_intents
  from public, anon, authenticated;
grant select, insert, update, delete on table public.job_media_upload_intents
  to service_role;

create or replace function public.reserve_job_media_upload(
  p_job_id uuid,
  p_owner_id uuid,
  p_object_path text,
  p_stage text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_now timestamptz default now()
)
returns table (
  allowed boolean,
  intent_id uuid,
  reason text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_daily_bytes bigint;
  v_daily_count integer;
  v_expires_at timestamptz := p_now + interval '2 hours';
  v_intent_id uuid;
  v_job_bytes bigint;
  v_job_count integer;
  v_pending_bytes bigint;
  v_pending_count integer;
  v_role text;
begin
  select case
      when profile.role = 'admin' then 'admin'
      when job.customer_id = p_owner_id then 'customer'
      when job.worker_id = p_owner_id then 'worker'
      else null
    end
    into v_role
  from public.jobs as job
  left join public.profiles as profile
    on profile.id = p_owner_id
  where job.id = p_job_id;

  if p_job_id is null
     or p_owner_id is null
     or v_role is null
     or p_stage is null
     or p_stage not in (
       'before',
       'after',
       'kael_reference',
       'cancellation_evidence',
       'scope_change_evidence',
       'access_check_in'
     )
     or p_mime_type is null
     or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4')
     or p_file_size_bytes is null
     or p_file_size_bytes not between 1 and 26214400
     or p_object_path is null
     or char_length(coalesce(p_object_path, '')) not between 10 and 500
     or p_object_path not like p_job_id::text || '/' || p_stage || '/%'
     or split_part(p_object_path, '/', 3) = ''
     or split_part(p_object_path, '/', 4) <> ''
     or p_object_path ~ '(\.\.|[\s?#])'
  then
    return query select false, null::uuid, 'INVALID_JOB_MEDIA_UPLOAD', null::timestamptz;
    return;
  end if;

  if not (
    v_role = 'admin'
    or (v_role = 'customer' and p_stage in ('before', 'kael_reference'))
    or (v_role = 'worker' and p_stage in (
      'after',
      'kael_reference',
      'cancellation_evidence',
      'scope_change_evidence',
      'access_check_in'
    ))
  ) then
    return query select false, null::uuid, 'FORBIDDEN_JOB_MEDIA_STAGE', null::timestamptz;
    return;
  end if;

  if p_mime_type = 'video/mp4' and not (
    (p_stage = 'before' and v_role in ('customer', 'admin'))
    or (p_stage = 'kael_reference' and v_role in ('customer', 'admin'))
  ) then
    return query select false, null::uuid, 'UNSUPPORTED_JOB_MEDIA', null::timestamptz;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('job_media_owner:' || p_owner_id::text, 92842));
  perform pg_advisory_xact_lock(hashtextextended('job_media:' || p_job_id::text, 92842));

  select count(*)::integer, coalesce(sum(intent.file_size_bytes), 0)::bigint
    into v_pending_count, v_pending_bytes
  from public.job_media_upload_intents as intent
  where intent.job_id = p_job_id
    and intent.owner_id = p_owner_id
    and intent.status = 'reserved'
    and intent.expires_at > p_now;

  if v_pending_count >= 10 or v_pending_bytes + p_file_size_bytes > 131072000 then
    return query select false, null::uuid, 'PENDING_JOB_MEDIA_QUOTA', null::timestamptz;
    return;
  end if;

  select count(*)::integer, coalesce(sum(intent.file_size_bytes), 0)::bigint
    into v_job_count, v_job_bytes
  from public.job_media_upload_intents as intent
  where intent.job_id = p_job_id
    and intent.status <> 'cleaned';

  if v_job_count >= 40 or v_job_bytes + p_file_size_bytes > 524288000 then
    return query select false, null::uuid, 'JOB_MEDIA_QUOTA', null::timestamptz;
    return;
  end if;

  select count(*)::integer, coalesce(sum(intent.file_size_bytes), 0)::bigint
    into v_daily_count, v_daily_bytes
  from public.job_media_upload_intents as intent
  where intent.owner_id = p_owner_id
    and intent.created_at >= p_now - interval '24 hours';

  if v_daily_count >= 60 or v_daily_bytes + p_file_size_bytes > 1073741824 then
    return query select false, null::uuid, 'DAILY_JOB_MEDIA_QUOTA', null::timestamptz;
    return;
  end if;

  insert into public.job_media_upload_intents (
    job_id,
    owner_id,
    object_path,
    stage,
    mime_type,
    file_size_bytes,
    expires_at,
    delete_after
  ) values (
    p_job_id,
    p_owner_id,
    p_object_path,
    p_stage,
    p_mime_type,
    p_file_size_bytes,
    v_expires_at,
    v_expires_at + interval '5 minutes'
  ) returning id into v_intent_id;

  return query select true, v_intent_id, null::text, v_expires_at;
end;
$$;

create or replace function public.consume_job_media_uploads(
  p_job_id uuid,
  p_owner_id uuid,
  p_object_paths text[],
  p_now timestamptz default now()
)
returns table (
  ok boolean,
  reason text,
  consumed_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_updated integer;
  v_valid integer;
begin
  select count(distinct value)::integer
    into v_expected
  from unnest(coalesce(p_object_paths, array[]::text[])) as refs(value)
  where value is not null and btrim(value) <> '';

  if p_job_id is null or p_owner_id is null or v_expected = 0 or v_expected > 5 then
    return query select false, 'INVALID_JOB_MEDIA_INTENT', 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('job_media:' || p_job_id::text, 92842));

  select count(*)::integer
    into v_valid
  from (
    select intent.id
    from public.job_media_upload_intents as intent
    join storage.objects as object
      on object.bucket_id = intent.bucket_id
      and object.name = intent.object_path
    where intent.job_id = p_job_id
      and intent.owner_id = p_owner_id
      and intent.object_path = any(p_object_paths)
      and intent.status in ('reserved', 'attached')
      and intent.expires_at > p_now
      and (
        intent.status = 'reserved'
        or (
          intent.status = 'attached'
          and intent.attached_at <= p_now - interval '2 minutes'
        )
      )
      and intent.cleanup_claim_token is null
      and lower(coalesce(object.metadata ->> 'mimetype', '')) = intent.mime_type
      and coalesce(
        case
          when coalesce(object.metadata ->> 'size', '') ~ '^[0-9]+$'
            then (object.metadata ->> 'size')::bigint
          else null
        end,
        -1
      ) = intent.file_size_bytes
    for update of intent
  ) as valid_intents;

  if v_valid <> v_expected then
    return query select false, 'MEDIA_INTENT_MISSING_OR_EXPIRED', v_valid;
    return;
  end if;

  update public.job_media_upload_intents as intent
  set status = 'attached',
      attached_at = p_now,
      delete_after = greatest(intent.expires_at, p_now) + interval '5 minutes',
      updated_at = p_now
  where intent.job_id = p_job_id
    and intent.owner_id = p_owner_id
    and intent.object_path = any(p_object_paths)
    and intent.status in ('reserved', 'attached')
    and intent.expires_at > p_now
    and (
      intent.status = 'reserved'
      or (
        intent.status = 'attached'
        and intent.attached_at <= p_now - interval '2 minutes'
      )
    )
    and intent.cleanup_claim_token is null;
  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    return query select false, 'MEDIA_INTENT_STATE_CHANGED', v_updated;
    return;
  end if;

  return query select true, null::text, v_updated;
end;
$$;

create or replace function public.revoke_job_media_uploads(
  p_job_id uuid,
  p_owner_id uuid,
  p_object_paths text[],
  p_now timestamptz default now()
)
returns table (
  ok boolean,
  reason text,
  revoked_paths text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_revoked text[];
  v_valid integer;
begin
  select count(distinct value)::integer
    into v_expected
  from unnest(coalesce(p_object_paths, array[]::text[])) as refs(value)
  where value is not null and btrim(value) <> '';

  if p_job_id is null or p_owner_id is null or v_expected = 0 or v_expected > 5 then
    return query select false, 'INVALID_JOB_MEDIA_INTENT', array[]::text[];
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('job_media:' || p_job_id::text, 92842));

  select count(*)::integer
    into v_valid
  from (
    select intent.id
    from public.job_media_upload_intents as intent
    where intent.job_id = p_job_id
      and intent.owner_id = p_owner_id
      and intent.object_path = any(p_object_paths)
      and intent.status in ('reserved', 'cleanup_pending')
      and not exists (
        select 1
        from public.job_media_assets as asset
        where asset.bucket_id = intent.bucket_id
          and asset.object_path = intent.object_path
      )
    for update of intent
  ) as valid_intents;

  if v_valid <> v_expected then
    return query select false, 'MEDIA_INTENT_STATE_CHANGED', array[]::text[];
    return;
  end if;

  begin
    with revoked as (
      update public.job_media_upload_intents as intent
      set status = 'cleanup_pending',
          delete_after = greatest(intent.expires_at, p_now) + interval '5 minutes',
          cleanup_claim_token = null,
          cleanup_claimed_at = null,
          updated_at = p_now
      where intent.job_id = p_job_id
        and intent.owner_id = p_owner_id
        and intent.object_path = any(p_object_paths)
        and intent.status in ('reserved', 'cleanup_pending')
        and not exists (
          select 1
          from public.job_media_assets as asset
          where asset.bucket_id = intent.bucket_id
            and asset.object_path = intent.object_path
        )
      returning intent.object_path
    )
    select array_agg(object_path order by object_path)
      into v_revoked
    from revoked;

    if coalesce(cardinality(v_revoked), 0) <> v_expected then
      raise exception using errcode = 'P1001', message = 'MEDIA_INTENT_STATE_CHANGED';
    end if;
  exception
    when sqlstate 'P1001' then
      return query select false, 'MEDIA_INTENT_STATE_CHANGED', array[]::text[];
      return;
  end;

  return query select true, null::text, v_revoked;
end;
$$;

create or replace function public.fail_job_media_uploads(
  p_job_id uuid,
  p_owner_id uuid,
  p_object_paths text[],
  p_now timestamptz default now()
)
returns table (
  ok boolean,
  reason text,
  revoked_paths text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_revoked text[];
  v_valid integer;
begin
  select count(distinct value)::integer
    into v_expected
  from unnest(coalesce(p_object_paths, array[]::text[])) as refs(value)
  where value is not null and btrim(value) <> '';

  if p_job_id is null or p_owner_id is null or v_expected = 0 or v_expected > 5 then
    return query select false, 'INVALID_JOB_MEDIA_INTENT', array[]::text[];
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('job_media:' || p_job_id::text, 92842));

  select count(*)::integer
    into v_valid
  from (
    select intent.id
    from public.job_media_upload_intents as intent
    where intent.job_id = p_job_id
      and intent.owner_id = p_owner_id
      and intent.object_path = any(p_object_paths)
      and intent.status in ('reserved', 'attached', 'cleanup_pending')
      and not exists (
        select 1
        from public.job_media_assets as asset
        where asset.bucket_id = intent.bucket_id
          and asset.object_path = intent.object_path
      )
    for update of intent
  ) as valid_intents;

  if v_valid <> v_expected then
    return query select false, 'MEDIA_INTENT_STATE_CHANGED', array[]::text[];
    return;
  end if;

  begin
    with revoked as (
      update public.job_media_upload_intents as intent
      set status = 'cleanup_pending',
          delete_after = greatest(intent.expires_at, p_now) + interval '5 minutes',
          cleanup_claim_token = null,
          cleanup_claimed_at = null,
          updated_at = p_now
      where intent.job_id = p_job_id
        and intent.owner_id = p_owner_id
        and intent.object_path = any(p_object_paths)
        and intent.status in ('reserved', 'attached', 'cleanup_pending')
        and not exists (
          select 1
          from public.job_media_assets as asset
          where asset.bucket_id = intent.bucket_id
            and asset.object_path = intent.object_path
        )
      returning intent.object_path
    )
    select array_agg(object_path order by object_path)
      into v_revoked
    from revoked;

    if coalesce(cardinality(v_revoked), 0) <> v_expected then
      raise exception using errcode = 'P1001', message = 'MEDIA_INTENT_STATE_CHANGED';
    end if;
  exception
    when sqlstate 'P1001' then
      return query select false, 'MEDIA_INTENT_STATE_CHANGED', array[]::text[];
      return;
  end;

  return query select true, null::text, v_revoked;
end;
$$;

create or replace function public.claim_job_media_cleanup_batch(
  p_claim_token uuid,
  p_limit integer default 50,
  p_now timestamptz default now()
)
returns table (
  intent_id uuid,
  object_path text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_claim_token is null or p_limit not between 1 and 100 then
    return;
  end if;

  return query
  with due as (
    select intent.id
    from public.job_media_upload_intents as intent
    where intent.cleaned_at is null
      and intent.delete_after is not null
      and intent.delete_after <= p_now
      and intent.status in ('reserved', 'attached', 'cleanup_pending')
      and (
        intent.cleanup_claim_token is null
        or intent.cleanup_claimed_at < p_now - interval '15 minutes'
      )
      and not exists (
        select 1
        from public.job_media_assets as asset
        where asset.bucket_id = intent.bucket_id
          and asset.object_path = intent.object_path
      )
    order by intent.delete_after, intent.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.job_media_upload_intents as intent
    set status = 'cleanup_pending',
        cleanup_claim_token = p_claim_token,
        cleanup_claimed_at = p_now,
        updated_at = p_now
    from due
    where intent.id = due.id
    returning intent.id, intent.object_path
  )
  select claimed.id, claimed.object_path
  from claimed;
end;
$$;

create or replace function public.complete_job_media_cleanup(
  p_claim_token uuid,
  p_intent_ids uuid[],
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completed integer;
begin
  if p_claim_token is null or coalesce(cardinality(p_intent_ids), 0) = 0 then
    return 0;
  end if;

  update public.job_media_upload_intents as intent
  set status = 'cleaned',
      cleaned_at = p_now,
      cleanup_claim_token = null,
      cleanup_claimed_at = null,
      updated_at = p_now
  where intent.id = any(p_intent_ids)
    and intent.cleanup_claim_token = p_claim_token
    and intent.status = 'cleanup_pending'
    and not exists (
      select 1
      from public.job_media_assets as asset
      where asset.bucket_id = intent.bucket_id
        and asset.object_path = intent.object_path
    );
  get diagnostics v_completed = row_count;
  return v_completed;
end;
$$;

revoke all on function public.reserve_job_media_upload(
  uuid, uuid, text, text, text, bigint, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_job_media_upload(
  uuid, uuid, text, text, text, bigint, timestamptz
) to service_role;

revoke all on function public.consume_job_media_uploads(
  uuid, uuid, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.consume_job_media_uploads(
  uuid, uuid, text[], timestamptz
) to service_role;

revoke all on function public.revoke_job_media_uploads(
  uuid, uuid, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.revoke_job_media_uploads(
  uuid, uuid, text[], timestamptz
) to service_role;

revoke all on function public.fail_job_media_uploads(
  uuid, uuid, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.fail_job_media_uploads(
  uuid, uuid, text[], timestamptz
) to service_role;

revoke all on function public.claim_job_media_cleanup_batch(
  uuid, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_job_media_cleanup_batch(
  uuid, integer, timestamptz
) to service_role;

revoke all on function public.complete_job_media_cleanup(
  uuid, uuid[], timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_job_media_cleanup(
  uuid, uuid[], timestamptz
) to service_role;

drop policy if exists "Participants upload job media files" on storage.objects;

commit;
