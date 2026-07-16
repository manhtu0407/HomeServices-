create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

begin;

lock table public.device_push_tokens in share row exclusive mode;

alter table public.device_push_tokens
  drop constraint if exists device_push_tokens_user_id_token_hash_key;

update public.device_push_tokens
set token_hash = pg_catalog.encode(
  extensions.digest(push_token, 'sha256'),
  'hex'
);

with duplicate_rows as (
  select
    id,
    row_number() over (
      partition by user_id, token_hash
      order by enabled desc, last_seen_at desc, updated_at desc, created_at desc, id desc
    ) as duplicate_rank
  from public.device_push_tokens
)
delete from public.device_push_tokens as dpt
using duplicate_rows as duplicates
where dpt.id = duplicates.id
  and duplicates.duplicate_rank > 1;

alter table public.device_push_tokens
  add constraint device_push_tokens_user_id_token_hash_key
  unique (user_id, token_hash);

with enabled_token_owners as (
  select
    id,
    row_number() over (
      partition by token_hash
      order by last_seen_at desc, updated_at desc, created_at desc, id desc
    ) as owner_rank
  from public.device_push_tokens
  where enabled is true
)
update public.device_push_tokens as dpt
set
  enabled = false,
  push_token = '',
  updated_at = pg_catalog.now()
from enabled_token_owners as owners
where dpt.id = owners.id
  and owners.owner_rank > 1;

update public.device_push_tokens
set
  push_token = '',
  updated_at = pg_catalog.now()
where enabled is false
  and push_token <> '';

create unique index device_push_tokens_enabled_token_hash_uidx
  on public.device_push_tokens (token_hash)
  where enabled;

create or replace function public.register_device_push_token_atomic(
  p_user_id uuid,
  p_platform text,
  p_push_token text,
  p_permission_status text,
  p_safe_metadata jsonb default '{}'::jsonb
) returns table (
  token_id uuid,
  enabled_out boolean,
  updated_at_ts timestamptz
) language plpgsql security invoker
set search_path = pg_catalog
as $func$
declare
  v_hash text;
  v_last4 text;
  v_now timestamptz := pg_catalog.now();
  v_safe_metadata jsonb := coalesce(p_safe_metadata, '{}'::jsonb);
begin
  if p_user_id is null then
    return;
  end if;
  if p_platform is null or p_platform not in ('ios', 'android', 'web', 'unknown') then
    return;
  end if;
  if p_permission_status is null or p_permission_status not in ('granted', 'denied', 'undetermined') then
    return;
  end if;
  if pg_catalog.jsonb_typeof(v_safe_metadata) <> 'object'
    or pg_catalog.octet_length(v_safe_metadata::text) > 4096
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(v_safe_metadata) as metadata(key)
      where metadata.key not in ('project_id_available', 'role', 'source')
    )
    or (
      v_safe_metadata ? 'project_id_available'
      and pg_catalog.jsonb_typeof(v_safe_metadata -> 'project_id_available') <> 'boolean'
    )
    or (
      v_safe_metadata ? 'role'
      and pg_catalog.jsonb_typeof(v_safe_metadata -> 'role') not in ('string', 'null')
    )
    or (
      pg_catalog.jsonb_typeof(v_safe_metadata -> 'role') = 'string'
      and v_safe_metadata ->> 'role' not in ('customer', 'worker', 'admin')
    )
    or (
      v_safe_metadata ? 'source'
      and (
        pg_catalog.jsonb_typeof(v_safe_metadata -> 'source') <> 'string'
        or v_safe_metadata ->> 'source' <> 'expo-notifications'
      )
    )
  then
    return;
  end if;
  if p_push_token is null
    or pg_catalog.char_length(p_push_token) < 8
    or pg_catalog.char_length(p_push_token) > 4096
  then
    return;
  end if;

  v_hash := pg_catalog.encode(extensions.digest(p_push_token, 'sha256'), 'hex');
  v_last4 := pg_catalog.right(p_push_token, 4);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('device_push_token:' || v_hash, 0)
  );

  update public.device_push_tokens
  set
    enabled = false,
    push_token = '',
    updated_at = v_now
  where token_hash = v_hash
    and user_id <> p_user_id
    and enabled is true;

  insert into public.device_push_tokens (
    user_id,
    platform,
    push_token,
    token_hash,
    token_last4,
    permission_status,
    enabled,
    safe_metadata,
    last_seen_at
  ) values (
    p_user_id,
    p_platform,
    case when p_permission_status = 'granted' then p_push_token else '' end,
    v_hash,
    v_last4,
    p_permission_status,
    p_permission_status = 'granted',
    v_safe_metadata,
    v_now
  )
  on conflict (user_id, token_hash) do update
  set
    platform = excluded.platform,
    push_token = excluded.push_token,
    token_last4 = excluded.token_last4,
    permission_status = excluded.permission_status,
    enabled = excluded.enabled,
    safe_metadata = excluded.safe_metadata,
    last_seen_at = excluded.last_seen_at,
    updated_at = v_now
  returning id, enabled, updated_at into token_id, enabled_out, updated_at_ts;

  return next;
end;
$func$;

revoke execute on function public.register_device_push_token_atomic(uuid, text, text, text, jsonb) from public;
revoke execute on function public.register_device_push_token_atomic(uuid, text, text, text, jsonb) from anon;
revoke execute on function public.register_device_push_token_atomic(uuid, text, text, text, jsonb) from authenticated;
grant execute on function public.register_device_push_token_atomic(uuid, text, text, text, jsonb) to service_role;

create or replace function public.unregister_device_push_token_atomic(
  p_user_id uuid,
  p_push_token text
) returns table (
  token_id uuid,
  unregistered_out boolean,
  updated_at_ts timestamptz
) language plpgsql security invoker
set search_path = pg_catalog
as $func$
declare
  v_hash text;
  v_now timestamptz := pg_catalog.now();
begin
  if p_user_id is null
    or p_push_token is null
    or pg_catalog.char_length(p_push_token) < 8
    or pg_catalog.char_length(p_push_token) > 4096
  then
    return;
  end if;

  v_hash := pg_catalog.encode(extensions.digest(p_push_token, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('device_push_token:' || v_hash, 0)
  );

  update public.device_push_tokens
  set
    enabled = false,
    push_token = '',
    updated_at = v_now
  where user_id = p_user_id
    and token_hash = v_hash
    and enabled is true
  returning id, true, updated_at
    into token_id, unregistered_out, updated_at_ts;

  if found then
    return next;
    return;
  end if;

  token_id := null;
  unregistered_out := false;
  updated_at_ts := v_now;
  return next;
end;
$func$;

revoke execute on function public.unregister_device_push_token_atomic(uuid, text) from public;
revoke execute on function public.unregister_device_push_token_atomic(uuid, text) from anon;
revoke execute on function public.unregister_device_push_token_atomic(uuid, text) from authenticated;
grant execute on function public.unregister_device_push_token_atomic(uuid, text) to service_role;

commit;
