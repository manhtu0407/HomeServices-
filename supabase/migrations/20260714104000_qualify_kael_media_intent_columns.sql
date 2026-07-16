-- Keep the upload-intent reservation RPC executable under PL/pgSQL's
-- table-returning output variables. The `expires_at` output variable otherwise
-- collides with the table column used by the expiry sweep.

begin;

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
set search_path = ''
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

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 63000));

  update public.kael_chat_media_upload_intents as intent
  set status = 'expired', updated_at = p_now
  where intent.customer_id = p_customer_id
    and intent.status = 'reserved'
    and intent.expires_at <= p_now;

  select count(*)::integer, coalesce(sum(intent.file_size_bytes), 0)::bigint
    into v_active_count, v_active_bytes
  from public.kael_chat_media_upload_intents as intent
  where intent.customer_id = p_customer_id
    and intent.status = 'reserved'
    and intent.expires_at > p_now;

  if v_active_count >= 10 or v_active_bytes + p_file_size_bytes > 314572800 then
    return query select false, null::uuid, 'PENDING_MEDIA_QUOTA', null::timestamptz;
    return;
  end if;

  select count(*)::integer, coalesce(sum(intent.file_size_bytes), 0)::bigint
    into v_daily_count, v_daily_bytes
  from public.kael_chat_media_upload_intents as intent
  where intent.customer_id = p_customer_id
    and intent.created_at >= p_now - interval '24 hours';

  if v_daily_count >= 30 or v_daily_bytes + p_file_size_bytes > 943718400 then
    return query select false, null::uuid, 'DAILY_MEDIA_QUOTA', null::timestamptz;
    return;
  end if;

  insert into public.kael_chat_media_upload_intents as intent (
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
  ) returning intent.id into v_intent_id;

  return query select true, v_intent_id, null::text, v_expires_at;
end;
$$;

revoke all on function public.reserve_kael_chat_media_upload(
  uuid, text, text, text, bigint, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_kael_chat_media_upload(
  uuid, text, text, text, bigint, timestamptz
) to service_role;

commit;
