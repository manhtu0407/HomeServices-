begin;

alter table public.admin_operator_accounts
  drop constraint if exists admin_operator_accounts_operations_triage_requires_read;
alter table public.admin_operator_accounts
  add constraint admin_operator_accounts_operations_triage_requires_read
  check (
    not ('operations.triage' = any(capabilities))
    or 'operations.read' = any(capabilities)
  );

alter table public.admin_operator_provisioning
  drop constraint if exists admin_operator_provisioning_capabilities_check;

alter table public.admin_operator_provisioning
  add constraint admin_operator_provisioning_capabilities_check
  check (
    cardinality(capabilities) between 1 and 12
    and 'finance.read' = any(capabilities)
    and (
      not ('operations.triage' = any(capabilities))
      or 'operations.read' = any(capabilities)
    )
  );

create table public.admin_support_case_preparations (
  source_kind text not null check (source_kind in ('dispute', 'queue')),
  source_id uuid not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'acknowledged', 'in_review', 'ready')),
  checklist jsonb not null default jsonb_build_object(
    'opening_request_reviewed', false,
    'counterparty_response_reviewed_or_missing', false,
    'locked_evidence_reviewed', false,
    'job_timeline_reviewed', false,
    'scope_and_payment_reviewed', false,
    'ready_for_next_step', false
  ),
  version integer not null default 0 check (version >= 0),
  last_idempotency_key uuid,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_kind, source_id),
  check (jsonb_typeof(checklist) = 'object'),
  check (
    checklist ?& array[
      'opening_request_reviewed',
      'counterparty_response_reviewed_or_missing',
      'locked_evidence_reviewed',
      'job_timeline_reviewed',
      'scope_and_payment_reviewed',
      'ready_for_next_step'
    ]::text[]
  ),
  check (
    checklist - array[
      'opening_request_reviewed',
      'counterparty_response_reviewed_or_missing',
      'locked_evidence_reviewed',
      'job_timeline_reviewed',
      'scope_and_payment_reviewed',
      'ready_for_next_step'
    ]::text[] = '{}'::jsonb
  ),
  check (
    jsonb_typeof(checklist -> 'opening_request_reviewed') = 'boolean'
    and jsonb_typeof(checklist -> 'counterparty_response_reviewed_or_missing') = 'boolean'
    and jsonb_typeof(checklist -> 'locked_evidence_reviewed') = 'boolean'
    and jsonb_typeof(checklist -> 'job_timeline_reviewed') = 'boolean'
    and jsonb_typeof(checklist -> 'scope_and_payment_reviewed') = 'boolean'
    and jsonb_typeof(checklist -> 'ready_for_next_step') = 'boolean'
  )
);

create index admin_support_case_preparations_status_updated_idx
  on public.admin_support_case_preparations (status, updated_at asc, source_kind, source_id);
create index admin_support_case_preparations_assigned_updated_idx
  on public.admin_support_case_preparations (assigned_to, updated_at asc)
  where assigned_to is not null;

create table public.admin_support_case_notes (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('dispute', 'queue')),
  source_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (source_kind, source_id, created_by, idempotency_key)
);

create index admin_support_case_notes_case_created_idx
  on public.admin_support_case_notes (source_kind, source_id, created_at asc, id asc);

alter table public.admin_support_case_preparations enable row level security;
alter table public.admin_support_case_notes enable row level security;
revoke all on public.admin_support_case_preparations from public, anon, authenticated;
revoke all on public.admin_support_case_notes from public, anon, authenticated;
grant all on public.admin_support_case_preparations to service_role;
grant select, insert on public.admin_support_case_notes to service_role;

create or replace function private.prevent_admin_support_note_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'ADMIN_SUPPORT_NOTES_APPEND_ONLY' using errcode = 'P0001';
end;
$function$;

create trigger admin_support_case_notes_append_only
  before update or delete on public.admin_support_case_notes
  for each row execute function private.prevent_admin_support_note_mutation();

revoke all on function private.prevent_admin_support_note_mutation() from public, anon, authenticated;

create or replace function private.scrub_admin_support_note(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  v_text text := pg_catalog.btrim(coalesce(p_value, ''));
begin
  v_text := pg_catalog.regexp_replace(
    v_text,
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
    '[email da an]',
    'gi'
  );
  v_text := pg_catalog.regexp_replace(
    v_text,
    '(\+?84|0)([ .-]?[0-9]){8,10}',
    '[so dien thoai da an]',
    'g'
  );
  v_text := pg_catalog.regexp_replace(
    v_text,
    '\m[0-9]{9,16}\M',
    '[du lieu nhay cam da an]',
    'g'
  );
  v_text := pg_catalog.regexp_replace(
    v_text,
    '(họ[[:space:]]*tên|ho[[:space:]]*ten|tên|ten|name)[[:space:]]*[:=-][[:space:]]*[^,;]{2,100}',
    '[ten da an]',
    'gi'
  );
  v_text := pg_catalog.regexp_replace(
    v_text,
    '(địa[[:space:]]*chỉ|dia[[:space:]]*chi|address)[[:space:]]*[:=-][[:space:]]*[^;]{2,200}',
    '[dia chi da an]',
    'gi'
  );
  return pg_catalog.left(v_text, 1000);
end;
$function$;

revoke all on function private.scrub_admin_support_note(text) from public, anon, authenticated;
grant execute on function private.scrub_admin_support_note(text) to service_role;

create or replace function public.admin_update_support_case_preparation_atomic(
  p_actor_id uuid,
  p_source_kind text,
  p_source_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_assignment text default 'keep',
  p_status text default null,
  p_checklist_patch jsonb default '{}'::jsonb,
  p_note text default null
)
returns table(
  ok boolean,
  error_code text,
  source_kind_out text,
  source_id_out uuid,
  assigned_to_out uuid,
  status_out text,
  checklist_out jsonb,
  version_out integer,
  updated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_is_owner boolean := false;
  v_preparation public.admin_support_case_preparations%rowtype;
  v_checklist jsonb;
  v_job_id uuid;
  v_note text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_sensitive text;
begin
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = p_actor_id
      and profile.role = 'admin'::public.user_role
  ) into v_is_owner;

  if not v_is_owner and not exists (
    select 1
    from public.profiles as profile
    join public.admin_operator_accounts as operator_account
      on operator_account.user_id = profile.id
    where profile.id = p_actor_id
      and profile.role = 'admin_operator'::public.user_role
      and operator_account.status = 'active'
      and 'operations.read' = any(operator_account.capabilities)
      and 'operations.triage' = any(operator_account.capabilities)
  ) then
    return query select false, 'OPERATIONS_TRIAGE_REQUIRED', p_source_kind, p_source_id,
      null::uuid, null::text, null::jsonb, null::integer, null::timestamptz;
    return;
  end if;

  if p_source_kind not in ('dispute', 'queue')
    or p_source_id is null
    or p_expected_version is null
    or p_expected_version < 0
    or p_idempotency_key is null
    or p_assignment not in ('claim', 'unclaim', 'keep')
    or (p_status is not null and p_status not in ('new', 'acknowledged', 'in_review', 'ready'))
    or p_checklist_patch is null
    or jsonb_typeof(p_checklist_patch) <> 'object'
    or p_checklist_patch - array[
      'opening_request_reviewed',
      'counterparty_response_reviewed_or_missing',
      'locked_evidence_reviewed',
      'job_timeline_reviewed',
      'scope_and_payment_reviewed',
      'ready_for_next_step'
    ]::text[] <> '{}'::jsonb
    or exists (
      select 1
      from jsonb_each(p_checklist_patch) as item
      where jsonb_typeof(item.value) <> 'boolean'
    )
    or (p_note is not null and char_length(btrim(p_note)) = 0)
    or (p_note is not null and char_length(p_note) > 1000)
  then
    return query select false, 'INVALID_INPUT', p_source_kind, p_source_id,
      null::uuid, null::text, null::jsonb, null::integer, null::timestamptz;
    return;
  end if;

  if p_source_kind = 'dispute' then
    select dispute.job_id into v_job_id
    from public.disputes as dispute
    where dispute.id = p_source_id;
    if not found then
      return query select false, 'CASE_NOT_FOUND', p_source_kind, p_source_id,
        null::uuid, null::text, null::jsonb, null::integer, null::timestamptz;
      return;
    end if;
  else
    select queue.job_id into v_job_id
    from public.kael_admin_queue as queue
    where queue.id = p_source_id
      and queue.queue_type in (
        'demanding_customer',
        'worker_cancellation_review',
        'worker_no_show',
        'customer_cancellation_review',
        'disintermediation_risk',
        'autonomy_escalation'
      );
    if not found then
      return query select false, 'CASE_NOT_FOUND', p_source_kind, p_source_id,
        null::uuid, null::text, null::jsonb, null::integer, null::timestamptz;
      return;
    end if;
  end if;

  insert into public.admin_support_case_preparations (
    source_kind, source_id, updated_by
  ) values (
    p_source_kind, p_source_id, p_actor_id
  ) on conflict (source_kind, source_id) do nothing;

  select preparation.* into v_preparation
  from public.admin_support_case_preparations as preparation
  where preparation.source_kind = p_source_kind
    and preparation.source_id = p_source_id
  for update;

  if v_preparation.last_idempotency_key = p_idempotency_key then
    return query select true, null::text, v_preparation.source_kind, v_preparation.source_id,
      v_preparation.assigned_to, v_preparation.status, v_preparation.checklist,
      v_preparation.version, v_preparation.updated_at;
    return;
  end if;

  if v_preparation.version <> p_expected_version then
    return query select false, 'VERSION_CONFLICT', v_preparation.source_kind, v_preparation.source_id,
      v_preparation.assigned_to, v_preparation.status, v_preparation.checklist,
      v_preparation.version, v_preparation.updated_at;
    return;
  end if;

  if p_assignment = 'claim'
    and v_preparation.assigned_to is not null
    and v_preparation.assigned_to <> p_actor_id
  then
    return query select false, 'ASSIGNED_TO_ANOTHER', v_preparation.source_kind, v_preparation.source_id,
      v_preparation.assigned_to, v_preparation.status, v_preparation.checklist,
      v_preparation.version, v_preparation.updated_at;
    return;
  end if;

  if p_assignment = 'unclaim'
    and v_preparation.assigned_to is not null
    and v_preparation.assigned_to <> p_actor_id
  then
    return query select false, 'ASSIGNED_TO_ANOTHER', v_preparation.source_kind, v_preparation.source_id,
      v_preparation.assigned_to, v_preparation.status, v_preparation.checklist,
      v_preparation.version, v_preparation.updated_at;
    return;
  end if;

  v_checklist := v_preparation.checklist || p_checklist_patch;
  if coalesce(p_status, v_preparation.status) = 'ready'
    and not (
      (v_checklist ->> 'opening_request_reviewed')::boolean
      and (v_checklist ->> 'counterparty_response_reviewed_or_missing')::boolean
      and (v_checklist ->> 'locked_evidence_reviewed')::boolean
      and (v_checklist ->> 'job_timeline_reviewed')::boolean
      and (v_checklist ->> 'scope_and_payment_reviewed')::boolean
      and (v_checklist ->> 'ready_for_next_step')::boolean
    )
  then
    return query select false, 'INVALID_INPUT', v_preparation.source_kind, v_preparation.source_id,
      v_preparation.assigned_to, v_preparation.status, v_preparation.checklist,
      v_preparation.version, v_preparation.updated_at;
    return;
  end if;

  update public.admin_support_case_preparations as preparation
  set assigned_to = case
        when p_assignment = 'claim' then p_actor_id
        when p_assignment = 'unclaim' then null
        else preparation.assigned_to
      end,
      status = coalesce(p_status, preparation.status),
      checklist = v_checklist,
      version = preparation.version + 1,
      last_idempotency_key = p_idempotency_key,
      updated_by = p_actor_id,
      updated_at = v_now
  where preparation.source_kind = p_source_kind
    and preparation.source_id = p_source_id
  returning preparation.* into v_preparation;

  v_note := private.scrub_admin_support_note(p_note);
  for v_sensitive in
    select sensitive_value
    from (
      select profile.full_name as sensitive_value
      from public.jobs as job
      join public.profiles as profile
        on profile.id = job.customer_id or profile.id = job.worker_id
      where job.id = v_job_id
      union all
      select profile.phone
      from public.jobs as job
      join public.profiles as profile
        on profile.id = job.customer_id or profile.id = job.worker_id
      where job.id = v_job_id
      union all
      select job.address_building from public.jobs as job where job.id = v_job_id
      union all
      select job.address_unit from public.jobs as job where job.id = v_job_id
      union all
      select job.address_floor from public.jobs as job where job.id = v_job_id
      union all
      select job.address_district from public.jobs as job where job.id = v_job_id
    ) as sensitive_values
    where sensitive_value is not null
      and pg_catalog.char_length(pg_catalog.btrim(sensitive_value)) >= 3
  loop
    v_note := pg_catalog.replace(v_note, v_sensitive, '[du lieu nhay cam da an]');
  end loop;
  if v_note <> '' then
    insert into public.admin_support_case_notes (
      source_kind, source_id, body, created_by, idempotency_key
    ) values (
      p_source_kind, p_source_id, v_note, p_actor_id, p_idempotency_key
    ) on conflict (source_kind, source_id, created_by, idempotency_key) do nothing;
  end if;

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id,
    case when v_is_owner then 'admin' else 'admin_operator' end,
    'admin_support_case_preparation',
    'update',
    'support_case',
    'allow',
    'support_preparation_updated',
    jsonb_build_object(
      'source_kind', p_source_kind,
      'source_id', p_source_id,
      'version', v_preparation.version,
      'note_added', v_note <> ''
    )
  );

  return query select true, null::text, v_preparation.source_kind, v_preparation.source_id,
    v_preparation.assigned_to, v_preparation.status, v_preparation.checklist,
    v_preparation.version, v_preparation.updated_at;
end;
$function$;

revoke all on function public.admin_update_support_case_preparation_atomic(
  uuid, text, uuid, integer, uuid, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.admin_update_support_case_preparation_atomic(
  uuid, text, uuid, integer, uuid, text, text, jsonb, text
) to service_role;

create or replace function public.admin_set_sub_admin_access_v2_atomic(
  p_owner_id uuid,
  p_target_id uuid,
  p_action text,
  p_capabilities text[] default '{}',
  p_reason text default null
)
returns table(
  ok boolean,
  error_code text,
  user_id uuid,
  status_out text,
  role_out public.user_role,
  capabilities_out text[],
  updated_at_out timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result record;
  v_capabilities text[] := coalesce(p_capabilities, '{}'::text[]);
  v_base_capabilities text[];
begin
  if pg_catalog.cardinality(v_capabilities) > 12
    or exists (
      select 1 from pg_catalog.unnest(v_capabilities) as capability
      where capability not in (
        'operations.read', 'operations.triage',
        'workers.read', 'workers.review', 'workers.manage',
        'transactions.read', 'finance.read', 'finance.reconcile',
        'finance.tax.manage', 'payouts.read', 'payouts.process', 'team.read'
      )
    )
    or (select count(*) from pg_catalog.unnest(v_capabilities))
      <> (select count(distinct capability) from pg_catalog.unnest(v_capabilities) as capability)
    or ('operations.triage' = any(v_capabilities) and not ('operations.read' = any(v_capabilities)))
  then
    return query select false, 'INVALID_INPUT', p_target_id, null::text,
      null::public.user_role, '{}'::text[], null::timestamptz;
    return;
  end if;

  select coalesce(array_agg(capability order by ordinal), '{}'::text[])
  into v_base_capabilities
  from unnest(v_capabilities) with ordinality as item(capability, ordinal)
  where capability <> 'operations.triage';

  select * into v_result
  from public.admin_set_sub_admin_access_atomic(
    p_owner_id,
    p_target_id,
    p_action,
    v_base_capabilities,
    p_reason
  );

  if v_result.ok is distinct from true then
    return query select v_result.ok, v_result.error_code, v_result.user_id,
      v_result.status_out, v_result.role_out, v_result.capabilities_out,
      v_result.updated_at_out;
    return;
  end if;

  if p_action in ('grant', 'update') and 'operations.triage' = any(v_capabilities) then
    update public.admin_operator_accounts as operator_account
    set capabilities = array_append(operator_account.capabilities, 'operations.triage')
    where operator_account.user_id = p_target_id
      and not ('operations.triage' = any(operator_account.capabilities));
  end if;

  return query
  select v_result.ok, v_result.error_code, v_result.user_id,
    v_result.status_out, v_result.role_out,
    coalesce(operator_account.capabilities, v_result.capabilities_out),
    coalesce(operator_account.updated_at, v_result.updated_at_out)
  from (select 1) as singleton
  left join public.admin_operator_accounts as operator_account
    on operator_account.user_id = p_target_id;
end;
$function$;

revoke all on function public.admin_set_sub_admin_access_v2_atomic(uuid, uuid, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.admin_set_sub_admin_access_v2_atomic(uuid, uuid, text, text[], text)
  to service_role;

create index if not exists scope_change_admin_status_updated_idx
  on public.scope_change_requests (status, updated_at asc, id asc);
create index if not exists scope_change_admin_timing_updated_idx
  on public.scope_change_requests (request_timing, updated_at asc, id asc);
create index if not exists disputes_admin_status_deadline_updated_idx
  on public.disputes (status, counter_party_response_deadline asc, updated_at asc, id asc);
create index if not exists kael_admin_queue_support_open_idx
  on public.kael_admin_queue (queue_type, status, priority, updated_at asc, id asc)
  where queue_type in (
    'demanding_customer',
    'worker_cancellation_review',
    'worker_no_show',
    'customer_cancellation_review',
    'disintermediation_risk',
    'autonomy_escalation',
    'dispute_review'
  );

commit;
