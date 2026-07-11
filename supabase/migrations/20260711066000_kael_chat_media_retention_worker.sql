-- Independent retention worker for private Kael media.
-- Object bytes are deleted through the Storage API; Postgres only provides a
-- durable lease/queue. Scheduling is installed only after the deployment has
-- provisioned both Vault secrets named `project_url` and
-- `kael_media_retention_secret`.

begin;

alter table public.kael_chat_media_upload_intents
  add column if not exists cleanup_claim_token uuid,
  add column if not exists cleanup_claimed_at timestamptz,
  add column if not exists cleanup_attempts integer not null default 0,
  add column if not exists cleaned_at timestamptz;

drop index if exists public.idx_kael_chat_media_intents_retention;
create index idx_kael_chat_media_intents_retention
  on public.kael_chat_media_upload_intents(delete_after, created_at)
  where cleaned_at is null;

create or replace function public.claim_kael_chat_media_cleanup_batch(
  p_claim_token uuid,
  p_now timestamptz default now(),
  p_limit integer default 50
)
returns table (
  intent_id uuid,
  object_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_claim_token is null then
    raise exception 'claim token is required' using errcode = '22023';
  end if;

  return query
  with due as (
    select intent.id
    from public.kael_chat_media_upload_intents as intent
    where intent.cleaned_at is null
      and intent.delete_after <= p_now
      and (
        intent.cleanup_claim_token is null
        or intent.cleanup_claimed_at < p_now - interval '15 minutes'
      )
    order by intent.delete_after, intent.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ), claimed as (
    update public.kael_chat_media_upload_intents as intent
    set cleanup_claim_token = p_claim_token,
        cleanup_claimed_at = p_now,
        cleanup_attempts = intent.cleanup_attempts + 1,
        updated_at = p_now
    from due
    where intent.id = due.id
    returning intent.id, intent.object_path
  )
  select claimed.id, claimed.object_path
  from claimed
  order by claimed.object_path;
end;
$$;

create or replace function public.complete_kael_chat_media_cleanup(
  p_claim_token uuid,
  p_intent_ids uuid[],
  p_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_completed integer;
begin
  if p_claim_token is null then
    raise exception 'claim token is required' using errcode = '22023';
  end if;

  update public.kael_chat_media_upload_intents
  set status = 'expired',
      cleaned_at = p_now,
      cleanup_claim_token = null,
      cleanup_claimed_at = null,
      updated_at = p_now
  where cleanup_claim_token = p_claim_token
    and id = any(coalesce(p_intent_ids, array[]::uuid[]))
    and cleaned_at is null;

  get diagnostics v_completed = row_count;
  return v_completed;
end;
$$;

-- Rebuild consume with row locks and cleanup-lease checks. This makes
-- consume-vs-revoke-vs-retention atomic and verifies the affected row count.
create or replace function public.consume_kael_chat_media_uploads(
  p_customer_id uuid,
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
set search_path = public, pg_temp
as $$
declare
  v_expected integer;
  v_valid integer;
  v_updated integer;
begin
  select count(distinct value)::integer
    into v_expected
  from unnest(coalesce(p_object_paths, array[]::text[])) as refs(value)
  where value is not null and btrim(value) <> '';

  if p_customer_id is null or v_expected = 0 or v_expected > 20 then
    return query select false, 'INVALID_MEDIA_INTENT', 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 63000));

  select count(*)::integer
    into v_valid
  from (
    select intent.id
    from public.kael_chat_media_upload_intents as intent
    join storage.objects as object
      on object.bucket_id = intent.bucket_id
      and object.name = intent.object_path
    where intent.customer_id = p_customer_id
      and intent.object_path = any(p_object_paths)
      and intent.status in ('reserved', 'consumed')
      and intent.cleaned_at is null
      and intent.cleanup_claim_token is null
      and (intent.status = 'consumed' or intent.expires_at > p_now)
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
  ) as locked_intents;

  if v_valid <> v_expected then
    return query select false, 'MEDIA_INTENT_MISSING_OR_EXPIRED', v_valid;
    return;
  end if;

  update public.kael_chat_media_upload_intents
  set status = 'consumed',
      consumed_at = coalesce(consumed_at, p_now),
      delete_after = greatest(
        delete_after,
        p_now + case
          when purpose = 'private_video_original' then interval '30 days'
          else interval '7 days'
        end
      ),
      updated_at = p_now
  where customer_id = p_customer_id
    and object_path = any(p_object_paths)
    and status in ('reserved', 'consumed')
    and cleaned_at is null
    and cleanup_claim_token is null;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    return query select false, 'MEDIA_INTENT_STATE_CHANGED', v_updated;
    return;
  end if;

  return query select true, null::text, v_updated;
end;
$$;

revoke all on function public.claim_kael_chat_media_cleanup_batch(
  uuid, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.claim_kael_chat_media_cleanup_batch(
  uuid, timestamptz, integer
) to service_role;

revoke all on function public.complete_kael_chat_media_cleanup(
  uuid, uuid[], timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_kael_chat_media_cleanup(
  uuid, uuid[], timestamptz
) to service_role;

revoke all on function public.consume_kael_chat_media_uploads(
  uuid, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.consume_kael_chat_media_uploads(
  uuid, text[], timestamptz
) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.schedule_kael_chat_media_retention()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_url text;
  v_retention_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null
    or to_regclass('cron.job') is null then
    return false;
  end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret into v_retention_secret
  from vault.decrypted_secrets
  where name = 'kael_media_retention_secret'
  limit 1;

  if nullif(btrim(v_project_url), '') is null
    or nullif(btrim(v_retention_secret), '') is null then
    return false;
  end if;

  if exists (
    select 1 from cron.job where jobname = 'kael-chat-media-retention'
  ) then
    perform cron.unschedule('kael-chat-media-retention');
  end if;

  perform cron.schedule(
    'kael-chat-media-retention',
    '*/15 * * * *',
    $cron$
      with retention_config as (
        select
          max(decrypted_secret) filter (where name = 'project_url') as project_url,
          max(decrypted_secret) filter (where name = 'kael_media_retention_secret') as retention_secret
        from vault.decrypted_secrets
      )
      select net.http_post(
        url := rtrim(project_url, '/') || '/functions/v1/kael-media-retention',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-kael-retention-secret', retention_secret
        ),
        body := '{"limit":50}'::jsonb
      )
      from retention_config
      where nullif(project_url, '') is not null
        and nullif(retention_secret, '') is not null;
    $cron$
  );
  return true;
end;
$$;

revoke all on function private.schedule_kael_chat_media_retention()
  from public, anon, authenticated;
grant execute on function private.schedule_kael_chat_media_retention()
  to service_role;

-- Safe no-op until both Vault secrets have been provisioned. Operators can
-- call this helper once after secret provisioning; it installs one named job.
select private.schedule_kael_chat_media_retention();

commit;
