-- Durable, server-issued upload intents for Kael case-work evidence.
--
-- The client may upload only with a short-lived token minted by mobile-api.
-- Reservation rows provide atomic per-customer object/byte quotas and a
-- durable retention queue for unconsumed or expired private media.

begin;

create table if not exists public.kael_chat_media_upload_intents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null default 'kael-chat-media'
    check (bucket_id = 'kael-chat-media'),
  object_path text not null unique,
  purpose text not null
    check (purpose in ('model_vision', 'private_video_original')),
  mime_type text not null,
  file_size_bytes bigint not null
    check (file_size_bytes > 0 and file_size_bytes <= 52428800),
  status text not null default 'reserved'
    check (status in ('reserved', 'consumed', 'revoked', 'expired')),
  expires_at timestamptz not null,
  delete_after timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    object_path like customer_id::text || '/kael-chat/' || purpose || '/%'
    and object_path not like '%..%'
    and object_path not like '%//%'
  )
);

create index if not exists idx_kael_chat_media_intents_customer_created
  on public.kael_chat_media_upload_intents(customer_id, created_at desc);

create index if not exists idx_kael_chat_media_intents_retention
  on public.kael_chat_media_upload_intents(delete_after)
  where status in ('reserved', 'consumed');

alter table public.kael_chat_media_upload_intents enable row level security;

revoke all on table public.kael_chat_media_upload_intents
  from public, anon, authenticated;
grant select, insert, update, delete on table public.kael_chat_media_upload_intents
  to service_role;

create or replace function public.reserve_kael_chat_media_upload(
  p_customer_id uuid,
  p_object_path text,
  p_purpose text,
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
set search_path = public, pg_temp
as $$
declare
  v_active_count integer;
  v_active_bytes bigint;
  v_daily_count integer;
  v_daily_bytes bigint;
  v_intent_id uuid;
  v_expires_at timestamptz := p_now + interval '2 hours';
begin
  if p_customer_id is null
    or p_object_path is null
    or p_object_path not like p_customer_id::text || '/kael-chat/' || p_purpose || '/%'
    or p_object_path like '%..%'
    or p_object_path like '%//%'
    or p_purpose not in ('model_vision', 'private_video_original')
    or (p_purpose = 'model_vision' and lower(trim(p_mime_type)) not in (
      'image/jpeg', 'image/png', 'image/webp'
    ))
    or (p_purpose = 'private_video_original' and lower(trim(p_mime_type)) not in (
      'video/mp4', 'video/quicktime', 'video/webm'
    ))
    or p_file_size_bytes is null
    or p_file_size_bytes <= 0
    or p_file_size_bytes > 52428800
  then
    return query select false, null::uuid, 'INVALID_UPLOAD_INTENT', null::timestamptz;
    return;
  end if;

  -- Serialize quota check + reservation for one customer.
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 63000));

  update public.kael_chat_media_upload_intents
  set status = 'expired', updated_at = p_now
  where customer_id = p_customer_id
    and status = 'reserved'
    and expires_at <= p_now;

  select count(*)::integer, coalesce(sum(file_size_bytes), 0)::bigint
    into v_active_count, v_active_bytes
  from public.kael_chat_media_upload_intents
  where customer_id = p_customer_id
    and status = 'reserved'
    and expires_at > p_now;

  if v_active_count >= 10 or v_active_bytes + p_file_size_bytes > 314572800 then
    return query select false, null::uuid, 'PENDING_MEDIA_QUOTA', null::timestamptz;
    return;
  end if;

  select count(*)::integer, coalesce(sum(file_size_bytes), 0)::bigint
    into v_daily_count, v_daily_bytes
  from public.kael_chat_media_upload_intents
  where customer_id = p_customer_id
    and created_at >= p_now - interval '24 hours';

  if v_daily_count >= 30 or v_daily_bytes + p_file_size_bytes > 943718400 then
    return query select false, null::uuid, 'DAILY_MEDIA_QUOTA', null::timestamptz;
    return;
  end if;

  insert into public.kael_chat_media_upload_intents (
    customer_id,
    object_path,
    purpose,
    mime_type,
    file_size_bytes,
    expires_at,
    delete_after
  ) values (
    p_customer_id,
    p_object_path,
    p_purpose,
    lower(trim(p_mime_type)),
    p_file_size_bytes,
    v_expires_at,
    v_expires_at
  ) returning id into v_intent_id;

  return query select true, v_intent_id, null::text, v_expires_at;
end;
$$;

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
  from public.kael_chat_media_upload_intents as intent
  join storage.objects as object
    on object.bucket_id = intent.bucket_id
    and object.name = intent.object_path
  where intent.customer_id = p_customer_id
    and intent.object_path = any(p_object_paths)
    and intent.status in ('reserved', 'consumed')
    and (intent.status = 'consumed' or intent.expires_at > p_now)
    and lower(coalesce(object.metadata ->> 'mimetype', '')) = intent.mime_type
    and coalesce(
      case
        when coalesce(object.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (object.metadata ->> 'size')::bigint
        else null
      end,
      -1
    ) = intent.file_size_bytes;

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
    and status in ('reserved', 'consumed');

  return query select true, null::text, v_expected;
end;
$$;

create or replace function public.revoke_kael_chat_media_uploads(
  p_customer_id uuid,
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
set search_path = public, pg_temp
as $$
declare
  v_expected integer;
  v_revoked text[];
begin
  select count(distinct value)::integer
    into v_expected
  from unnest(coalesce(p_object_paths, array[]::text[])) as refs(value)
  where value is not null and btrim(value) <> '';

  if p_customer_id is null or v_expected = 0 or v_expected > 20 then
    return query select false, 'INVALID_MEDIA_INTENT', array[]::text[];
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 63000));

  with revoked as (
    update public.kael_chat_media_upload_intents
    set status = 'revoked',
        -- A signed upload token may remain valid until expires_at. Keep the row
        -- in the durable cleanup queue so a late re-upload is removed again.
        delete_after = greatest(expires_at, p_now) + interval '5 minutes',
        updated_at = p_now
    where customer_id = p_customer_id
      and object_path = any(p_object_paths)
      and status in ('reserved', 'consumed', 'revoked')
    returning object_path
  )
  select array_agg(object_path order by object_path)
    into v_revoked
  from revoked;

  if coalesce(cardinality(v_revoked), 0) <> v_expected then
    return query select false, 'MEDIA_INTENT_MISSING', coalesce(v_revoked, array[]::text[]);
    return;
  end if;

  return query select true, null::text, v_revoked;
end;
$$;

revoke all on function public.reserve_kael_chat_media_upload(
  uuid, text, text, text, bigint, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_kael_chat_media_upload(
  uuid, text, text, text, bigint, timestamptz
) to service_role;

revoke all on function public.consume_kael_chat_media_uploads(
  uuid, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.consume_kael_chat_media_uploads(
  uuid, text[], timestamptz
) to service_role;

revoke all on function public.revoke_kael_chat_media_uploads(
  uuid, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.revoke_kael_chat_media_uploads(
  uuid, text[], timestamptz
) to service_role;

-- Direct authenticated inserts were the legacy bypass. Signed-upload tokens do
-- not need an objects INSERT policy when the upload itself is performed.
drop policy if exists "Users upload own kael chat media" on storage.objects;
drop policy if exists "Users read own kael chat media" on storage.objects;

commit;
