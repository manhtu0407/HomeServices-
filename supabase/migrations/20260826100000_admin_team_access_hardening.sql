begin;

alter table public.admin_operator_accounts
  add column if not exists version integer;

update public.admin_operator_accounts
set version = 1
where version is null or version < 1;

alter table public.admin_operator_accounts
  alter column version set default 1,
  alter column version set not null;

do $constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.admin_operator_accounts'::regclass
      and conname = 'admin_operator_accounts_version_check'
  ) then
    alter table public.admin_operator_accounts
      add constraint admin_operator_accounts_version_check check (version > 0);
  end if;
end;
$constraint$;

create index if not exists admin_operator_accounts_updated_cursor_idx
  on public.admin_operator_accounts (updated_at desc, user_id desc);

create table if not exists public.admin_team_mutation_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  client_request_id uuid not null,
  operation text not null check (operation = 'sub_admin_access'),
  subject_id uuid not null references public.profiles(id) on delete restrict,
  request jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (actor_id, client_request_id)
);

create index if not exists admin_team_mutation_receipts_subject_created_idx
  on public.admin_team_mutation_receipts (subject_id, created_at desc);

alter table public.admin_team_mutation_receipts enable row level security;
revoke all on public.admin_team_mutation_receipts from public, anon, authenticated;
grant all on public.admin_team_mutation_receipts to service_role;

create or replace function public.admin_set_sub_admin_access_v3_atomic(
  p_owner_id uuid,
  p_target_id uuid,
  p_action text,
  p_capabilities text[],
  p_reason text,
  p_expected_version integer,
  p_client_request_id uuid
)
returns table(
  ok boolean,
  error_code text,
  user_id uuid,
  status_out text,
  role_out public.user_role,
  capabilities_out text[],
  updated_at_out timestamptz,
  version_out integer,
  event_id_out uuid,
  generated_at_out timestamptz,
  replayed_out boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account public.admin_operator_accounts%rowtype;
  v_capabilities text[];
  v_current_version integer := 0;
  v_event_id uuid := gen_random_uuid();
  v_existing boolean := false;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_prior public.admin_team_mutation_receipts%rowtype;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_reason_hash text;
  v_request jsonb;
  v_response jsonb;
  v_result record;
  v_role public.user_role;
begin
  if p_owner_id is null
    or p_target_id is null
    or p_client_request_id is null
    or p_expected_version is null
    or p_expected_version < 0
  then
    return query select false, 'INVALID_INPUT', p_target_id, null::text,
      null::public.user_role, '{}'::text[], null::timestamptz, null::integer,
      null::uuid, v_now, false;
    return;
  end if;

  select coalesce(pg_catalog.array_agg(capability order by capability), '{}'::text[])
  into v_capabilities
  from pg_catalog.unnest(coalesce(p_capabilities, '{}'::text[])) as capability;

  v_reason_hash := case
    when v_reason = '' then null
    else pg_catalog.encode(extensions.digest(v_reason, 'sha256'), 'hex')
  end;
  v_request := pg_catalog.jsonb_build_object(
    'target_id', p_target_id,
    'action', lower(pg_catalog.btrim(coalesce(p_action, ''))),
    'capabilities', pg_catalog.to_jsonb(v_capabilities),
    'reason_hash', v_reason_hash
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_owner_id::text || ':' || p_client_request_id::text, 0)
  );

  select receipt.* into v_prior
  from public.admin_team_mutation_receipts as receipt
  where receipt.actor_id = p_owner_id
    and receipt.client_request_id = p_client_request_id;

  if found then
    if v_prior.operation <> 'sub_admin_access'
      or v_prior.subject_id <> p_target_id
      or v_prior.request <> v_request
    then
      return query select false, 'IDEMPOTENCY_CONFLICT', p_target_id, null::text,
        null::public.user_role, '{}'::text[], null::timestamptz, null::integer,
        null::uuid, v_now, false;
      return;
    end if;

    select coalesce(pg_catalog.array_agg(item.value order by item.ordinal), '{}'::text[])
    into v_capabilities
    from pg_catalog.jsonb_array_elements_text(v_prior.response -> 'capabilities')
      with ordinality as item(value, ordinal);

    return query select true, null::text,
      (v_prior.response ->> 'user_id')::uuid,
      v_prior.response ->> 'status',
      (v_prior.response ->> 'role')::public.user_role,
      v_capabilities,
      (v_prior.response ->> 'updated_at')::timestamptz,
      (v_prior.response ->> 'version')::integer,
      (v_prior.response ->> 'event_id')::uuid,
      (v_prior.response ->> 'generated_at')::timestamptz,
      true;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('admin_operator:' || p_target_id::text, 0)
  );

  select account.* into v_account
  from public.admin_operator_accounts as account
  where account.user_id = p_target_id
  for update;
  v_existing := found;
  v_current_version := case when v_existing then v_account.version else 0 end;

  if v_current_version <> p_expected_version then
    return query select false, 'VERSION_CONFLICT', p_target_id,
      case when v_existing then v_account.status else null end,
      null::public.user_role,
      case when v_existing then v_account.capabilities else '{}'::text[] end,
      case when v_existing then v_account.updated_at else null end,
      v_current_version, null::uuid, v_now, false;
    return;
  end if;

  select * into v_result
  from public.admin_set_sub_admin_access_v2_atomic(
    p_owner_id,
    p_target_id,
    p_action,
    coalesce(p_capabilities, '{}'::text[]),
    p_reason
  );

  if v_result.ok is distinct from true then
    return query select false, v_result.error_code, v_result.user_id,
      v_result.status_out, v_result.role_out, v_result.capabilities_out,
      v_result.updated_at_out, v_current_version, null::uuid, v_now, false;
    return;
  end if;

  if v_existing then
    update public.admin_operator_accounts as account
    set version = account.version + 1
    where account.user_id = p_target_id
    returning account.* into v_account;
  else
    select account.* into strict v_account
    from public.admin_operator_accounts as account
    where account.user_id = p_target_id;
  end if;

  select profile.role into strict v_role
  from public.profiles as profile
  where profile.id = p_target_id;

  v_response := pg_catalog.jsonb_build_object(
    'user_id', p_target_id,
    'status', v_account.status,
    'role', v_role,
    'capabilities', pg_catalog.to_jsonb(v_account.capabilities),
    'updated_at', v_account.updated_at,
    'version', v_account.version,
    'event_id', v_event_id,
    'generated_at', v_now
  );

  insert into public.admin_team_mutation_receipts (
    id, actor_id, client_request_id, operation, subject_id, request, response
  ) values (
    v_event_id, p_owner_id, p_client_request_id, 'sub_admin_access',
    p_target_id, v_request, v_response
  );

  return query select true, null::text, p_target_id, v_account.status,
    v_role, v_account.capabilities, v_account.updated_at, v_account.version,
    v_event_id, v_now, false;
end;
$function$;

revoke all on function public.admin_set_sub_admin_access_v3_atomic(uuid, uuid, text, text[], text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_sub_admin_access_v3_atomic(uuid, uuid, text, text[], text, integer, uuid)
  to service_role;

commit;
