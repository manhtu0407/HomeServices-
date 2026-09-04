begin;

alter table public.kael_chat_sessions
  add column if not exists synthetic_cohort_id text;

alter table public.jobs
  add column if not exists quote_mode public.service_quote_mode,
  add column if not exists synthetic_cohort_id text,
  add column if not exists intake_scope_snapshot jsonb;

alter table public.jobs add constraint jobs_intake_scope_snapshot_shape_check check (
  intake_scope_snapshot is null or (
    jsonb_typeof(intake_scope_snapshot) = 'object'
    and intake_scope_snapshot ->> 'version' = '1'
    and intake_scope_snapshot ->> 'case_phase' in ('offer_review', 'matching')
  )
);

alter table public.worker_profiles
  add column if not exists matching_push_proven_at timestamptz,
  add column if not exists matching_foreground_active_until timestamptz,
  add column if not exists synthetic_cohort_id text;

alter table public.job_broadcasts
  add column if not exists synthetic_cohort_id text;

alter table public.job_worker_candidates
  add column if not exists synthetic_cohort_id text;

create table public.synthetic_matching_cohorts (
  cohort_id text primary key check (cohort_id ~ '^synthetic-[a-z0-9-]{8,100}$'),
  created_at timestamptz not null default now()
);

create table public.synthetic_matching_cohort_members (
  cohort_id text not null references public.synthetic_matching_cohorts(cohort_id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_role public.user_role not null check (member_role in ('customer', 'worker')),
  created_at timestamptz not null default now(),
  primary key (cohort_id, profile_id),
  unique (profile_id)
);

create table public.confirmation_operations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (length(idempotency_key) between 16 and 160),
  session_id uuid not null references public.kael_chat_sessions(id) on delete cascade,
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  job_id uuid unique references public.jobs(id) on delete cascade,
  quote_mode public.service_quote_mode not null,
  confirmation_kind text not null check (confirmation_kind in (
    'priced_offer', 'rfq_request', 'inspection_request'
  )),
  state text not null check (state in (
    'confirmation_pending', 'job_created', 'matching_queued', 'broadcasting',
    'candidate_ready', 'official_match', 'no_reachable_worker',
    'recovery_required', 'stopped'
  )),
  support_code text not null check (support_code ~ '^[A-Z0-9]{8}$'),
  last_error_code text,
  retry_after_ms integer check (retry_after_ms between 100 and 30000),
  synthetic_cohort_id text,
  release_metadata jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, customer_id)
);

create table public.confirmation_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.confirmation_operations(id) on delete cascade,
  request_fingerprint text not null,
  response_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workflow_outbox (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.confirmation_operations(id) on delete cascade,
  event_type text not null check (event_type in (
    'confirmation_accepted', 'matching_requested', 'matching_reconcile'
  )),
  status text not null default 'queued' check (status in (
    'queued', 'processing', 'completed', 'failed'
  )),
  safe_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, event_type)
);

create table public.matching_operations (
  id uuid primary key default gen_random_uuid(),
  confirmation_operation_id uuid references public.confirmation_operations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  state text not null default 'queued' check (state in (
    'queued', 'broadcasting', 'candidate_ready', 'official_match',
    'no_reachable_worker', 'recovery_required', 'stopped'
  )),
  synthetic_cohort_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index matching_operations_one_active_per_job_idx
  on public.matching_operations(job_id)
  where state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required');

create table public.matching_recipient_deliveries (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.matching_operations(id) on delete cascade,
  broadcast_id uuid not null unique references public.job_broadcasts(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  status text not null default 'queued' check (status in (
    'queued', 'delivered', 'seen', 'accepted', 'expired'
  )),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  delivered_at timestamptz,
  seen_at timestamptz,
  accepted_at timestamptz,
  synthetic_cohort_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, worker_id),
  check (expires_at > created_at)
);

create table public.worker_matching_proposals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  broadcast_id uuid not null unique references public.job_broadcasts(id) on delete cascade,
  candidate_id uuid not null unique references public.job_worker_candidates(id) on delete cascade,
  worker_id uuid not null references public.worker_profiles(id) on delete cascade,
  scope_summary text not null check (length(btrim(scope_summary)) between 3 and 2000),
  price_min integer check (price_min is null or price_min > 0),
  price_max integer check (price_max is null or price_max >= price_min),
  status text not null default 'proposed' check (status in (
    'proposed', 'customer_confirmed', 'customer_declined', 'expired', 'withdrawn'
  )),
  synthetic_cohort_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workflow_outbox_claim_idx
  on public.workflow_outbox(status, next_attempt_at, created_at);
create index matching_deliveries_worker_status_idx
  on public.matching_recipient_deliveries(worker_id, status, expires_at desc);
create index confirmation_operations_customer_updated_idx
  on public.confirmation_operations(customer_id, updated_at desc);

alter table public.confirmation_operations enable row level security;
alter table public.confirmation_operation_receipts enable row level security;
alter table public.workflow_outbox enable row level security;
alter table public.matching_operations enable row level security;
alter table public.matching_recipient_deliveries enable row level security;
alter table public.worker_matching_proposals enable row level security;
alter table public.synthetic_matching_cohorts enable row level security;
alter table public.synthetic_matching_cohort_members enable row level security;

revoke all on public.confirmation_operations, public.confirmation_operation_receipts,
  public.workflow_outbox, public.matching_operations,
  public.matching_recipient_deliveries, public.worker_matching_proposals
  , public.synthetic_matching_cohorts, public.synthetic_matching_cohort_members
  from public, anon, authenticated;
grant select, insert, update, delete on public.confirmation_operations,
  public.confirmation_operation_receipts, public.workflow_outbox,
  public.matching_operations, public.matching_recipient_deliveries,
  public.worker_matching_proposals to service_role;
grant select, insert, update, delete on public.synthetic_matching_cohorts,
  public.synthetic_matching_cohort_members to service_role;
grant select on public.synthetic_matching_cohort_members to authenticated;

create policy synthetic_matching_cohort_members_read_self
on public.synthetic_matching_cohort_members
for select
to authenticated
using (profile_id = (select auth.uid()));

create or replace function public.guard_synthetic_matching_identity()
returns trigger language plpgsql security definer set search_path = '' as $func$
declare v_profile_id uuid; v_expected text; v_member text;
begin
  if tg_table_name = 'kael_chat_sessions' then
    v_profile_id := new.customer_id;
  elsif tg_table_name = 'jobs' then
    v_profile_id := new.customer_id;
  else
    v_profile_id := new.id;
  end if;
  select member.cohort_id into v_member
  from public.synthetic_matching_cohort_members member
  where member.profile_id = v_profile_id
    and member.member_role = case when tg_table_name = 'worker_profiles'
      then 'worker'::public.user_role else 'customer'::public.user_role end;
  v_expected := v_member;
  if new.synthetic_cohort_id is null and v_expected is not null then
    new.synthetic_cohort_id := v_expected;
  elsif new.synthetic_cohort_id is not null
    and new.synthetic_cohort_id is distinct from v_expected
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_COHORT_IDENTITY_REQUIRED';
  end if;
  return new;
end;
$func$;

create trigger kael_chat_sessions_synthetic_identity_guard
before insert or update of customer_id, synthetic_cohort_id on public.kael_chat_sessions
for each row execute function public.guard_synthetic_matching_identity();

create trigger jobs_synthetic_identity_guard
before insert or update of customer_id, synthetic_cohort_id on public.jobs
for each row execute function public.guard_synthetic_matching_identity();

create trigger worker_profiles_synthetic_identity_guard
before update of synthetic_cohort_id on public.worker_profiles
for each row execute function public.guard_synthetic_matching_identity();

create or replace function public.confirm_kael_chat_durable_atomic(
  p_session_id uuid,
  p_customer_id uuid,
  p_idempotency_key text,
  p_confirmation_kind text,
  p_price_reasoning_receipt_id text default null
) returns table (
  ok boolean,
  error_code text,
  operation_id uuid,
  receipt_id uuid,
  job_id uuid,
  job_status public.job_status,
  quote_mode public.service_quote_mode,
  operation_state text,
  already_applied boolean,
  accepted_at timestamptz,
  updated_at timestamptz
) language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare
  v_session public.kael_chat_sessions%rowtype;
  v_policy public.service_intake_policies%rowtype;
  v_operation public.confirmation_operations%rowtype;
  v_receipt public.confirmation_operation_receipts%rowtype;
  v_old record;
  v_service_problem_id uuid;
  v_description text;
  v_district text;
  v_problem_chips text[];
  v_photo_urls text[];
  v_missing_field text;
  v_job_id uuid;
begin
  if p_idempotency_key is distinct from ('kael-confirm:' || p_session_id::text || ':' || p_customer_id::text)
    or p_confirmation_kind not in ('priced_offer', 'rfq_request', 'inspection_request')
  then
    return query select false, 'IDEMPOTENCY_INVALID', null::uuid, null::uuid,
      null::uuid, null::public.job_status, null::public.service_quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_session from public.kael_chat_sessions
    where id = p_session_id for update;
  if not found or v_session.customer_id <> p_customer_id then
    return query select false, 'NOT_FOUND', null::uuid, null::uuid,
      null::uuid, null::public.job_status, null::public.service_quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_operation from public.confirmation_operations
    where idempotency_key = p_idempotency_key for update;
  if found then
    select * into strict v_receipt from public.confirmation_operation_receipts
      where operation_id = v_operation.id;
    return query select true, null::text, v_operation.id, v_receipt.id,
      v_operation.job_id, coalesce((select status from public.jobs where id = v_operation.job_id),
        'awaiting_customer_confirm'::public.job_status), v_operation.quote_mode,
      v_operation.state, true, v_operation.accepted_at, v_operation.updated_at;
    return;
  end if;

  select nullif(turn.safe_metadata ->> 'service_problem_id', '')::uuid
    into v_service_problem_id
  from public.kael_chat_turns turn
  where turn.session_id = p_session_id
    and nullif(turn.safe_metadata ->> 'service_problem_id', '') is not null
  order by turn.turn_index desc limit 1;

  if v_service_problem_id is null then
    return query select false, 'POLICY_UNAVAILABLE', null::uuid, null::uuid,
      null::uuid, null::public.job_status, null::public.service_quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;
  select * into v_policy from public.service_intake_policies
    where service_problem_id = v_service_problem_id and status = 'active'
    order by version desc limit 1;
  if not found then
    return query select false, 'POLICY_UNAVAILABLE', null::uuid, null::uuid,
      null::uuid, null::public.job_status, null::public.service_quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_policy.quote_mode = 'blocked' then
    return query select false, 'POLICY_BLOCKED', null::uuid, null::uuid,
      null::uuid, null::public.job_status, v_policy.quote_mode,
      'stopped', false, null::timestamptz, null::timestamptz;
    return;
  end if;
  if (v_policy.quote_mode = 'kael_auto_quote' and p_confirmation_kind <> 'priced_offer')
    or (v_policy.quote_mode = 'rfq' and p_confirmation_kind <> 'rfq_request')
    or (v_policy.quote_mode = 'inspection_only' and p_confirmation_kind <> 'inspection_request')
  then
    return query select false, 'CONFIRMATION_KIND_MISMATCH', null::uuid, null::uuid,
      null::uuid, null::public.job_status, v_policy.quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;

  v_description := nullif(btrim(v_session.diagnosis_scope ->> 'scope_summary'), '');
  v_district := nullif(btrim(v_session.safe_metadata ->> 'address_district'), '');
  select field.value into v_missing_field
  from jsonb_array_elements_text(v_policy.tier_a_fields) field(value)
  where case field.value
    when 'service_type' then v_session.service_type is null
    when 'problem_slug' then v_policy.problem_slug is null
    when 'address_district' then v_district is null
    when 'address_label' then nullif(btrim(v_session.safe_metadata ->> 'address_label'), '') is null
    when 'scheduled_at' then v_session.scheduled_at is null
    when 'description_min' then v_description is null or length(v_description) < 10
    else nullif(btrim(coalesce(v_session.safe_metadata ->> field.value,
      v_session.diagnosis_scope -> 'facts' ->> field.value)), '') is null
  end limit 1;
  if v_missing_field is not null then
    return query select false, 'TIER_A_INCOMPLETE', null::uuid, null::uuid,
      null::uuid, null::public.job_status, v_policy.quote_mode,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;
  if v_session.safe_metadata #> '{intake_coverage,safety_blocker}' is not null
    and v_session.safe_metadata #> '{intake_coverage,safety_blocker}' <> 'null'::jsonb
  then
    return query select false, 'SAFETY_BLOCKED', null::uuid, null::uuid,
      null::uuid, null::public.job_status, v_policy.quote_mode,
      'stopped', false, null::timestamptz, null::timestamptz;
    return;
  end if;

  insert into public.confirmation_operations(
    idempotency_key, session_id, customer_id, quote_mode, confirmation_kind,
    state, support_code, synthetic_cohort_id
  ) values (
    p_idempotency_key, p_session_id, p_customer_id, v_policy.quote_mode,
    p_confirmation_kind, 'confirmation_pending', upper(substr(md5(gen_random_uuid()::text), 1, 8)),
    v_session.synthetic_cohort_id
  ) returning * into v_operation;

  if v_policy.quote_mode = 'kael_auto_quote' then
    if not exists (
      select 1 from public.price_baseline_versions baseline
      where baseline.service_problem_id = v_service_problem_id
        and baseline.status = 'active'
        and public.price_evidence_has_quorum(baseline.price_evidence)
    ) then
      raise exception using errcode = '23514', message = 'KAEL_PRICE_EVIDENCE_REQUIRED';
    end if;
    select * into v_old from public.confirm_kael_chat_atomic(
      p_session_id, p_customer_id, p_price_reasoning_receipt_id
    );
    if not coalesce(v_old.ok, false) then
      raise exception using errcode = '55000', message = coalesce(v_old.error_code, 'KAEL_CONFIRM_FAILED');
    end if;
    v_job_id := v_old.job_id;
    update public.jobs set quote_mode = v_policy.quote_mode,
      synthetic_cohort_id = v_session.synthetic_cohort_id where id = v_job_id;
  else
    v_problem_chips := coalesce(array(
      select jsonb_array_elements_text(v_session.safe_metadata -> 'problem_chips')
    ), array[v_policy.problem_slug]);
    if cardinality(v_problem_chips) = 0 then v_problem_chips := array[v_policy.problem_slug]; end if;
    v_photo_urls := coalesce(array(
      select distinct evidence ->> 'ref'
      from jsonb_array_elements(coalesce(v_session.diagnosis_scope -> 'evidence', '[]'::jsonb)) evidence
      where evidence ->> 'kind' in ('photo', 'video_frame')
        and nullif(evidence ->> 'ref', '') is not null
    ), array[]::text[]);
    insert into public.jobs(
      customer_id, service_type, description, problem_chips, photo_urls,
      address_district, scheduled_at, status, service_problem_id, diagnosis_scope,
      intake_scope_snapshot, kael_problem_identified, quote_mode, synthetic_cohort_id
    ) values (
      p_customer_id, v_session.service_type, v_description, v_problem_chips, v_photo_urls,
      v_district, v_session.scheduled_at, 'awaiting_customer_confirm',
      v_service_problem_id, null, v_session.diagnosis_scope, v_description,
      v_policy.quote_mode, v_session.synthetic_cohort_id
    ) returning id into v_job_id;
    update public.kael_chat_sessions set job_id = v_job_id, status = 'confirmed',
      case_phase = 'matching', updated_at = now() where id = p_session_id;
  end if;

  update public.confirmation_operations set job_id = v_job_id,
    state = 'matching_queued', updated_at = now()
    where id = v_operation.id returning * into v_operation;
  insert into public.confirmation_operation_receipts(
    operation_id, request_fingerprint, response_snapshot
  ) values (
    v_operation.id, md5(p_idempotency_key || ':' || p_confirmation_kind),
    jsonb_build_object('accepted', true, 'quote_mode', v_policy.quote_mode)
  ) returning * into v_receipt;
  insert into public.workflow_outbox(operation_id, event_type, status, safe_payload)
    values (v_operation.id, 'confirmation_accepted', 'completed',
      jsonb_build_object('job_id', v_job_id))
    on conflict do nothing;
  insert into public.workflow_outbox(operation_id, event_type, safe_payload)
    values (v_operation.id, 'matching_requested', jsonb_build_object('job_id', v_job_id))
    on conflict do nothing;
  insert into public.matching_operations(
    confirmation_operation_id, job_id, state, synthetic_cohort_id
  ) values (v_operation.id, v_job_id, 'queued', v_session.synthetic_cohort_id)
    on conflict (job_id) where state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required')
    do nothing;

  return query select true, null::text, v_operation.id, v_receipt.id,
    v_job_id, 'awaiting_customer_confirm'::public.job_status, v_policy.quote_mode,
    v_operation.state, false, v_operation.accepted_at, v_operation.updated_at;
end;
$func$;

create or replace function public.get_kael_confirmation_operation(
  p_session_id uuid, p_customer_id uuid
) returns table (
  operation_id uuid, idempotency_key text, session_id uuid, job_id uuid,
  quote_mode public.service_quote_mode, operation_state text, terminal boolean,
  accepted_at timestamptz, updated_at timestamptz, retry_after_ms integer,
  support_code text
) language sql security invoker set search_path = public, pg_catalog stable as $func$
  select op.id, op.idempotency_key, op.session_id, op.job_id, op.quote_mode,
    op.state, op.state in ('official_match', 'no_reachable_worker', 'stopped'),
    op.accepted_at, op.updated_at, op.retry_after_ms, op.support_code
  from public.confirmation_operations op
  where op.session_id = p_session_id and op.customer_id = p_customer_id
  limit 1;
$func$;

create or replace function public.claim_confirmation_matching_outbox(
  p_session_id uuid, p_customer_id uuid, p_lease_seconds integer default 30
) returns table (
  operation_id uuid, job_id uuid, operation_state text, claimed boolean
) language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare
  v_operation public.confirmation_operations%rowtype;
  v_outbox public.workflow_outbox%rowtype;
  v_has_active_delivery boolean;
begin
  if p_lease_seconds not between 5 and 60 then
    raise exception using errcode = '22023', message = 'OUTBOX_LEASE_INVALID';
  end if;
  select * into v_operation from public.confirmation_operations
    where session_id = p_session_id and customer_id = p_customer_id for update;
  if not found then return; end if;
  select * into v_outbox from public.workflow_outbox
    where workflow_outbox.operation_id = v_operation.id
      and event_type = 'matching_requested' for update;
  if not found then
    return query select v_operation.id, v_operation.job_id, v_operation.state, false;
    return;
  end if;
  select exists (
    select 1 from public.matching_recipient_deliveries delivery
    where delivery.job_id = v_operation.job_id
      and delivery.status in ('queued', 'delivered', 'seen')
      and delivery.expires_at > now()
  ) into v_has_active_delivery;
  if v_operation.state in ('broadcasting', 'candidate_ready', 'official_match',
      'no_reachable_worker', 'stopped')
    or (v_operation.state in ('matching_queued', 'recovery_required') and v_has_active_delivery)
  then
    if v_operation.state in ('matching_queued', 'recovery_required') and v_has_active_delivery then
      update public.confirmation_operations set state = 'broadcasting',
        last_error_code = null, retry_after_ms = null, updated_at = now()
        where id = v_operation.id;
      update public.matching_operations set state = 'broadcasting', updated_at = now()
        where confirmation_operation_id = v_operation.id
          and state in ('queued', 'recovery_required');
      v_operation.state := 'broadcasting';
    end if;
    update public.workflow_outbox set status = 'completed', lease_expires_at = null,
      last_error_code = null, updated_at = now() where id = v_outbox.id;
    return query select v_operation.id, v_operation.job_id, v_operation.state, false;
    return;
  end if;
  if v_outbox.status in ('queued', 'failed')
    and v_outbox.next_attempt_at <= now()
    or v_outbox.status = 'processing'
      and coalesce(v_outbox.lease_expires_at, '-infinity'::timestamptz) <= now()
  then
    update public.workflow_outbox set status = 'processing',
      attempt_count = attempt_count + 1,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error_code = null, updated_at = now()
      where id = v_outbox.id;
    return query select v_operation.id, v_operation.job_id, v_operation.state, true;
    return;
  end if;
  return query select v_operation.id, v_operation.job_id, v_operation.state, false;
end;
$func$;

create or replace function public.settle_confirmation_matching_operation(
  p_operation_id uuid, p_state text, p_error_code text default null
) returns boolean language plpgsql security invoker set search_path = public, pg_catalog as $func$
begin
  if p_state not in ('broadcasting', 'candidate_ready', 'official_match',
    'no_reachable_worker', 'recovery_required', 'stopped')
  then raise exception using errcode = '22023', message = 'OPERATION_STATE_INVALID'; end if;
  update public.confirmation_operations set state = p_state,
    last_error_code = case when p_state = 'recovery_required' then p_error_code else null end,
    retry_after_ms = case when p_state = 'recovery_required' then 1000 else null end,
    updated_at = now() where id = p_operation_id;
  if not found then return false; end if;
  update public.matching_operations set state = p_state, updated_at = now()
    where confirmation_operation_id = p_operation_id
      and state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required');
  update public.workflow_outbox set
    status = case when p_state = 'recovery_required' then 'failed' else 'completed' end,
    last_error_code = case when p_state = 'recovery_required' then p_error_code else null end,
    next_attempt_at = case when p_state = 'recovery_required'
      then now() + interval '1 second' else next_attempt_at end,
    lease_expires_at = null, updated_at = now()
    where operation_id = p_operation_id and event_type = 'matching_requested';
  return true;
end;
$func$;

create or replace function private.worker_meets_job_matching_requirements(
  p_quote_mode public.service_quote_mode,
  p_diagnosis_scope jsonb,
  p_intake_scope_snapshot jsonb,
  p_problem_specializations text[]
) returns boolean
language sql immutable
set search_path = ''
as $func$
  select case
    when p_quote_mode is null then true
    else not exists (
      select 1
      from jsonb_array_elements_text(coalesce(
        coalesce(p_diagnosis_scope, p_intake_scope_snapshot)
          -> 'worker_requirements',
        '[]'::jsonb
      )) requirement
      where not exists (
        select 1
        from unnest(coalesce(p_problem_specializations, array[]::text[])) capability
        where lower(btrim(capability)) = lower(btrim(requirement))
      )
    )
  end
$func$;

create or replace function public.activate_job_broadcast_batch_durable_atomic(
  p_job_id uuid, p_worker_ids uuid[], p_batch_id uuid,
  p_sent_at timestamptz, p_expires_at timestamptz
) returns table (
  id uuid, worker_id uuid, delivery_id uuid, operation_id uuid,
  confirmed_recipient_count integer
) language plpgsql security definer set search_path = '' as $func$
declare
  v_job public.jobs%rowtype;
  v_matching public.matching_operations%rowtype;
  v_recipient_count integer;
begin
  if p_job_id is null or cardinality(p_worker_ids) not between 1 and 5
    or p_expires_at is distinct from p_sent_at + interval '5 minutes'
  then raise exception using errcode = '22023', message = 'MATCHING_BATCH_INVALID'; end if;
  select * into strict v_job from public.jobs where id = p_job_id for update;
  if v_job.status <> 'broadcasting' then
    raise exception using errcode = '55000', message = 'MATCHING_JOB_NOT_ACTIVE';
  end if;
  if v_job.quote_mode = 'kael_auto_quote' and (
    v_job.kael_price_min is null or v_job.kael_price_min <= 0
    or v_job.kael_price_max is null or v_job.kael_price_max < v_job.kael_price_min
  ) then raise exception using errcode = '23514', message = 'KAEL_PRICE_EVIDENCE_REQUIRED'; end if;

  select * into v_matching from public.matching_operations
    where job_id = p_job_id and state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required')
    order by created_at desc limit 1 for update;
  if not found then
    insert into public.matching_operations(job_id, state, synthetic_cohort_id)
      values (p_job_id, 'queued', v_job.synthetic_cohort_id) returning * into v_matching;
  end if;

  with eligible as (
    select distinct wp.id
    from unnest(p_worker_ids) requested(id)
    join public.worker_profiles wp on wp.id = requested.id
    where wp.is_approved and wp.is_available and not wp.is_suspended
      and v_job.service_type = any(wp.selected_service_types)
      and (
        public.normalize_hcmc_district_code(v_job.address_district) = any(wp.districts)
        or 'hcmc_all' = any(wp.districts)
      )
      and wp.synthetic_cohort_id is not distinct from v_job.synthetic_cohort_id
      and (
        (
          wp.matching_push_proven_at between p_sent_at - interval '24 hours' and p_sent_at
          and exists (
            select 1 from public.device_push_tokens push_token
            where push_token.user_id = wp.id
              and push_token.enabled
              and push_token.permission_status = 'granted'
              and push_token.updated_at <= wp.matching_push_proven_at
          )
        )
        or wp.matching_foreground_active_until >= p_sent_at
      )
      and not exists (
        select 1 from public.worker_service_quality_status quality
        where quality.worker_id = wp.id and quality.service_type = v_job.service_type
          and quality.is_locked
      )
      and not exists (
        select 1 from public.jobs busy where busy.worker_id = wp.id
          and busy.id <> p_job_id and busy.status in (
            'worker_matched', 'worker_on_way', 'arrived', 'inspecting',
            'repairing', 'scope_change_pending', 'completed_by_worker'
          )
      )
      and not exists (
        select 1 from public.job_worker_candidates reserved
        where reserved.worker_id = wp.id and reserved.status = 'proposed'
          and (reserved.expires_at is null or reserved.expires_at > p_sent_at)
          and reserved.job_id <> p_job_id
      )
      and private.worker_meets_job_matching_requirements(
        v_job.quote_mode,
        v_job.diagnosis_scope,
        v_job.intake_scope_snapshot,
        wp.problem_specializations
      )
  ), candidate as (
    select eligible.id as worker_id, gen_random_uuid() as broadcast_id,
      gen_random_uuid() as quote_id, tier.commission_level,
      tier.commission_rate_bps
    from eligible
    cross join lateral private.resolve_worker_commission_tier(eligible.id) tier
  ), inserted as (
    insert into public.job_broadcasts as existing(
      id, job_id, worker_id, status, broadcast_at, sent_at, expires_at, batch_id,
      original_scope_price_quote, synthetic_cohort_id
    )
    select candidate.broadcast_id, p_job_id, candidate.worker_id, 'sent', p_sent_at, p_sent_at, p_expires_at,
      p_batch_id,
      case when v_job.quote_mode = 'kael_auto_quote' then jsonb_build_object(
        'schema_version', 'original_scope_price_quote.v1',
        'quote_id', candidate.quote_id, 'job_id', p_job_id,
        'worker_id', candidate.worker_id, 'broadcast_id', candidate.broadcast_id,
        'reference_price_min', v_job.kael_price_min,
        'reference_price_max', v_job.kael_price_max,
        'customer_total', round(((v_job.kael_price_min + v_job.kael_price_max)::numeric / 2) / 1000)::integer * 1000,
        'platform_fee', round(
          (round(((v_job.kael_price_min + v_job.kael_price_max)::numeric / 2) / 1000)::integer * 1000)::numeric
            * candidate.commission_rate_bps / 10000.0
        )::integer,
        'worker_net', (round(((v_job.kael_price_min + v_job.kael_price_max)::numeric / 2) / 1000)::integer * 1000)
          - round(
            (round(((v_job.kael_price_min + v_job.kael_price_max)::numeric / 2) / 1000)::integer * 1000)::numeric
              * candidate.commission_rate_bps / 10000.0
          )::integer,
        'commission_level', candidate.commission_level,
        'commission_rate_bps', candidate.commission_rate_bps,
        'price_source', v_job.kael_estimate_card_v3 #>> '{card,price_reasoning_receipt,fairness,price_source}',
        'selection_rule', 'verified_neutral_midpoint_with_bilateral_confirmation',
        'worker_confirmation_required', true, 'customer_confirmation_required', true,
        'worker_confirmed_at', null,
        'expires_at', p_expires_at,
        'reasoning_receipt', v_job.kael_estimate_card_v3 #> '{card,price_reasoning_receipt}'
      ) else null end,
      v_job.synthetic_cohort_id
    from candidate
    on conflict on constraint job_broadcasts_job_id_worker_id_key do update set
      status = excluded.status, broadcast_at = excluded.broadcast_at,
      sent_at = excluded.sent_at, responded_at = null,
      expires_at = excluded.expires_at, batch_id = excluded.batch_id,
      original_scope_price_quote = case
        when excluded.original_scope_price_quote is null then null
        else jsonb_set(excluded.original_scope_price_quote, '{broadcast_id}',
          to_jsonb(existing.id), true)
      end,
      synthetic_cohort_id = excluded.synthetic_cohort_id
    where existing.status = 'expired'
    returning existing.id, existing.worker_id
  ), deliveries as (
    insert into public.matching_recipient_deliveries(
      operation_id, broadcast_id, job_id, worker_id, status, expires_at,
      synthetic_cohort_id
    ) select v_matching.id, inserted.id, p_job_id, inserted.worker_id,
      'queued', p_expires_at, v_job.synthetic_cohort_id from inserted
    on conflict (broadcast_id) do update set
      operation_id = excluded.operation_id, status = 'queued',
      expires_at = excluded.expires_at, delivered_at = null, seen_at = null,
      accepted_at = null, updated_at = now()
    returning id, broadcast_id, worker_id
  ) select count(*) into v_recipient_count from deliveries;

  if v_recipient_count = 0 then return; end if;
  update public.matching_operations set state = 'broadcasting', updated_at = now()
    where id = v_matching.id;
  update public.confirmation_operations set state = 'broadcasting', updated_at = now()
    where id = v_matching.confirmation_operation_id;
  return query select delivery.broadcast_id, delivery.worker_id, delivery.id,
    v_matching.id, v_recipient_count
  from public.matching_recipient_deliveries delivery
  where delivery.operation_id = v_matching.id and delivery.expires_at = p_expires_at
    and delivery.status = 'queued';
end;
$func$;

create or replace function public.record_worker_matching_heartbeat(
  p_worker_id uuid, p_observed_at timestamptz
) returns table(server_time timestamptz, active_until timestamptz)
language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare v_now timestamptz := now();
begin
  if p_observed_at is null or abs(extract(epoch from (v_now - p_observed_at))) > 60 then
    raise exception using errcode = '22023', message = 'HEARTBEAT_CLOCK_INVALID';
  end if;
  update public.worker_profiles set matching_foreground_active_until = v_now + interval '2 minutes',
    updated_at = v_now where id = p_worker_id;
  if not found then raise exception using errcode = 'P0002', message = 'WORKER_NOT_FOUND'; end if;
  return query select v_now, v_now + interval '2 minutes';
end;
$func$;

create or replace function public.mark_matching_delivery_delivered(p_delivery_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare v_worker_id uuid;
begin
  update public.matching_recipient_deliveries set status = case
      when status = 'queued' then 'delivered' else status end,
    delivered_at = coalesce(delivered_at, now()), updated_at = now()
    where id = p_delivery_id and status in ('queued', 'delivered', 'seen')
    returning worker_id into v_worker_id;
  if v_worker_id is not null then
    update public.worker_profiles set matching_push_proven_at = now(), updated_at = now()
      where id = v_worker_id;
  end if;
end;
$func$;

create or replace function public.mark_matching_delivery_seen(
  p_broadcast_id uuid, p_worker_id uuid
) returns setof public.matching_recipient_deliveries
language plpgsql security invoker set search_path = public, pg_catalog as $func$
begin
  return query update public.matching_recipient_deliveries delivery
    set status = 'seen', delivered_at = coalesce(delivered_at, now()),
      seen_at = coalesce(seen_at, now()), updated_at = now()
    where delivery.broadcast_id = p_broadcast_id and delivery.worker_id = p_worker_id
      and delivery.status in ('queued', 'delivered', 'seen')
      and delivery.expires_at > now()
    returning delivery.*;
end;
$func$;

create or replace function public.expire_worker_matching_deliveries(
  p_worker_id uuid, p_now timestamptz
) returns integer language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare v_count integer;
begin
  with expired as (
    update public.matching_recipient_deliveries set status = 'expired', updated_at = p_now
    where worker_id = p_worker_id and status in ('queued', 'delivered', 'seen')
      and expires_at <= p_now returning broadcast_id
  ), broadcasts as (
    update public.job_broadcasts set status = 'expired', responded_at = p_now
    where id in (select broadcast_id from expired) and status = 'sent' returning id
  ) select count(*) into v_count from broadcasts;
  return v_count;
end;
$func$;

create or replace function public.accept_priced_broadcast_durable_atomic(
  p_job_id uuid, p_worker_id uuid, p_quote_id uuid
) returns table (
  ok boolean, error_code text, job_status public.job_status,
  candidate_id uuid, already_applied boolean
) language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare v_result record; v_delivery public.matching_recipient_deliveries%rowtype;
  v_job public.jobs%rowtype; v_worker public.worker_profiles%rowtype;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  select * into v_worker from public.worker_profiles where id = p_worker_id for update;
  select delivery.* into v_delivery
  from public.matching_recipient_deliveries delivery
  join public.job_broadcasts broadcast on broadcast.id = delivery.broadcast_id
  where delivery.job_id = p_job_id and delivery.worker_id = p_worker_id
    and broadcast.original_scope_price_quote ->> 'quote_id' = p_quote_id::text
  order by delivery.created_at desc limit 1 for update of delivery;
  if v_job.status = 'broadcasting' and (
    (v_job.quote_mode is not null and v_job.quote_mode <> 'kael_auto_quote')
    or (v_delivery.id is null and v_job.quote_mode is not null)
    or v_delivery.status not in ('queued', 'delivered', 'seen')
    or v_delivery.expires_at <= now()
    or v_worker.id is null
    or v_worker.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or not private.worker_meets_job_matching_requirements(
      v_job.quote_mode,
      v_job.diagnosis_scope,
      v_job.intake_scope_snapshot,
      v_worker.problem_specializations
    )
  ) then
    return query select false, 'WORKER_NOT_ELIGIBLE', v_job.status,
      null::uuid, false;
    return;
  end if;
  select * into v_result from public.accept_broadcast_atomic(
    p_job_id, p_worker_id, p_quote_id
  );
  if not coalesce(v_result.ok, false) then
    return query select false, v_result.error_code, v_result.job_status,
      v_result.candidate_id, coalesce(v_result.already_applied, false);
    return;
  end if;
  if v_delivery.id is null then
    if v_job.quote_mode is null then
      return query select true, null::text, v_result.job_status,
        v_result.candidate_id, coalesce(v_result.already_applied, false);
      return;
    end if;
    raise exception using errcode = '55000', message = 'DURABLE_DELIVERY_REQUIRED';
  end if;
  update public.matching_recipient_deliveries set status = 'accepted',
    accepted_at = coalesce(accepted_at, now()), seen_at = coalesce(seen_at, now()),
    delivered_at = coalesce(delivered_at, now()), updated_at = now()
    where id = v_delivery.id and status in ('queued', 'delivered', 'seen', 'accepted');
  update public.matching_recipient_deliveries set status = 'expired', updated_at = now()
    where job_id = p_job_id and id <> v_delivery.id
      and status in ('queued', 'delivered', 'seen');
  update public.job_worker_candidates set synthetic_cohort_id =
      (select synthetic_cohort_id from public.jobs where id = p_job_id)
    where id = v_result.candidate_id;
  update public.matching_operations set state = 'candidate_ready', updated_at = now()
    where id = v_delivery.operation_id;
  update public.confirmation_operations set state = 'candidate_ready', updated_at = now()
    where id = (select confirmation_operation_id from public.matching_operations
      where id = v_delivery.operation_id);
  return query select true, null::text, v_result.job_status,
    v_result.candidate_id, coalesce(v_result.already_applied, false);
end;
$func$;

create or replace function public.submit_worker_matching_proposal_atomic(
  p_job_id uuid, p_broadcast_id uuid, p_worker_id uuid,
  p_scope_summary text, p_price_min integer default null, p_price_max integer default null
) returns table(ok boolean, error_code text, candidate_id uuid, proposal_id uuid,
  already_applied boolean)
language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare v_job public.jobs%rowtype; v_delivery public.matching_recipient_deliveries%rowtype;
  v_worker public.worker_profiles%rowtype; v_job_district text;
  v_candidate_id uuid; v_proposal_id uuid; v_existing public.worker_matching_proposals%rowtype;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  select * into v_delivery from public.matching_recipient_deliveries
    where broadcast_id = p_broadcast_id and worker_id = p_worker_id for update;
  if length(btrim(coalesce(p_scope_summary, ''))) not between 3 and 2000
  then return query select false, 'SCOPE_INVALID', null::uuid, null::uuid, false; return; end if;
  select * into v_existing from public.worker_matching_proposals
    where broadcast_id = p_broadcast_id for update;
  if found then
    if v_existing.worker_id = p_worker_id
      and v_existing.scope_summary = btrim(p_scope_summary)
      and v_existing.price_min is not distinct from p_price_min
      and v_existing.price_max is not distinct from p_price_max
    then
      return query select true, null::text, v_existing.candidate_id, v_existing.id, true;
    else
      return query select false, 'PROPOSAL_ALREADY_SUBMITTED',
        v_existing.candidate_id, v_existing.id, false;
    end if;
    return;
  end if;
  if v_job.id is null or v_delivery.id is null or v_job.status <> 'broadcasting'
    or v_delivery.status not in ('queued', 'delivered', 'seen')
    or v_delivery.expires_at <= now()
  then return query select false, 'DELIVERY_NOT_ACTIVE', null::uuid, null::uuid, false; return; end if;
  select * into v_worker from public.worker_profiles where id = p_worker_id for update;
  v_job_district := public.normalize_hcmc_district_code(v_job.address_district);
  if v_worker.id is null or not v_worker.is_approved or not v_worker.is_available
    or v_worker.is_suspended or v_job_district is null or v_job_district = 'hcmc_all'
    or v_worker.selected_service_types is null
    or not (v_job.service_type = any(v_worker.selected_service_types))
    or v_worker.districts is null
    or not (v_job_district = any(v_worker.districts) or 'hcmc_all' = any(v_worker.districts))
    or v_worker.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or exists (
      select 1 from public.worker_service_quality_status quality
      where quality.worker_id = v_worker.id and quality.service_type = v_job.service_type
        and quality.is_locked
    )
    or exists (
      select 1 from public.jobs busy where busy.worker_id = v_worker.id
        and busy.id <> p_job_id and busy.status in (
          'worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing',
          'scope_change_pending', 'completed_by_worker'
        )
    )
    or exists (
      select 1 from public.job_worker_candidates reserved
      where reserved.worker_id = v_worker.id and reserved.job_id <> p_job_id
        and reserved.status = 'proposed'
        and (reserved.expires_at is null or reserved.expires_at > now())
    )
    or not private.worker_meets_job_matching_requirements(
      v_job.quote_mode,
      v_job.diagnosis_scope,
      v_job.intake_scope_snapshot,
      v_worker.problem_specializations
    )
  then return query select false, 'WORKER_NOT_ELIGIBLE', null::uuid, null::uuid, false; return; end if;
  if v_job.quote_mode = 'rfq' and (
    p_price_min is null or p_price_max is null or p_price_min <= 0 or p_price_max < p_price_min
  ) then return query select false, 'PRICE_REQUIRED', null::uuid, null::uuid, false; return; end if;
  if v_job.quote_mode = 'inspection_only' and (p_price_min is not null or p_price_max is not null)
  then return query select false, 'PRICE_NOT_ALLOWED', null::uuid, null::uuid, false; return; end if;
  if v_job.quote_mode is null or v_job.quote_mode not in ('rfq', 'inspection_only')
  then return query select false, 'QUOTE_MODE_INVALID', null::uuid, null::uuid, false; return; end if;
  insert into public.job_worker_candidates(job_id, worker_id, broadcast_id, status,
    proposed_at, expires_at, synthetic_cohort_id)
    values (p_job_id, p_worker_id, p_broadcast_id, 'proposed', now(),
      v_delivery.expires_at, v_job.synthetic_cohort_id) returning id into v_candidate_id;
  insert into public.worker_matching_proposals(job_id, broadcast_id, candidate_id,
    worker_id, scope_summary, price_min, price_max, synthetic_cohort_id)
    values (p_job_id, p_broadcast_id, v_candidate_id, p_worker_id,
      btrim(p_scope_summary), p_price_min, p_price_max, v_job.synthetic_cohort_id)
    returning id into v_proposal_id;
  update public.job_broadcasts set status = 'accepted', responded_at = now()
    where id = p_broadcast_id and status = 'sent';
  update public.matching_recipient_deliveries set status = 'accepted',
    accepted_at = now(), seen_at = coalesce(seen_at, now()),
    delivered_at = coalesce(delivered_at, now()), updated_at = now()
    where id = v_delivery.id;
  update public.jobs set status = 'worker_candidate_pending' where id = p_job_id;
  update public.matching_operations set state = 'candidate_ready', updated_at = now()
    where id = v_delivery.operation_id;
  update public.confirmation_operations set state = 'candidate_ready', updated_at = now()
    where id = (select confirmation_operation_id from public.matching_operations
      where id = v_delivery.operation_id);
  return query select true, null::text, v_candidate_id, v_proposal_id, false;
end;
$func$;

create or replace function public.submit_worker_matching_proposal_atomic(
  p_broadcast_id uuid, p_worker_id uuid, p_scope_summary text,
  p_price_min integer default null, p_price_max integer default null
) returns table(ok boolean, error_code text, candidate_id uuid, proposal_id uuid,
  already_applied boolean)
language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare v_job_id uuid;
begin
  select job_id into v_job_id from public.job_broadcasts
    where id = p_broadcast_id and worker_id = p_worker_id;
  if v_job_id is null then
    return query select false, 'DELIVERY_NOT_ACTIVE', null::uuid, null::uuid, false;
    return;
  end if;
  return query select * from public.submit_worker_matching_proposal_atomic(
    v_job_id, p_broadcast_id, p_worker_id, p_scope_summary, p_price_min, p_price_max
  );
end;
$func$;

create or replace function public.confirm_worker_matching_proposal_atomic(
  p_job_id uuid, p_candidate_id uuid, p_customer_id uuid
) returns table(ok boolean, error_code text, job_status public.job_status,
  candidate_id uuid, worker_id uuid, already_applied boolean)
language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare v_job public.jobs%rowtype; v_candidate public.job_worker_candidates%rowtype;
  v_proposal public.worker_matching_proposals%rowtype;
  v_worker public.worker_profiles%rowtype; v_job_district text;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  select * into v_candidate from public.job_worker_candidates
    where id = p_candidate_id and job_id = p_job_id for update;
  select * into v_proposal from public.worker_matching_proposals
    where candidate_id = p_candidate_id for update;
  if v_job.id is null or v_job.customer_id <> p_customer_id
    then return query select false, 'NOT_FOUND', null::public.job_status, null::uuid, null::uuid, false; return; end if;
  if v_candidate.status = 'customer_confirmed' and v_job.worker_id = v_candidate.worker_id
    then return query select true, null::text, v_job.status, v_candidate.id, v_candidate.worker_id, true; return; end if;
  if v_candidate.status = 'proposed' and v_candidate.expires_at <= now() then
    update public.job_worker_candidates set status = 'expired', updated_at = now()
      where id = v_candidate.id and status = 'proposed';
    update public.worker_matching_proposals set status = 'expired', updated_at = now()
      where id = v_proposal.id and status = 'proposed';
    update public.matching_recipient_deliveries set status = 'expired', updated_at = now()
      where broadcast_id = v_candidate.broadcast_id and status <> 'expired';
    update public.jobs set status = 'broadcasting', broadcast_at = null
      where id = p_job_id and status = 'worker_candidate_pending';
    update public.matching_operations set state = 'broadcasting', updated_at = now()
      where job_id = p_job_id and state = 'candidate_ready';
    update public.confirmation_operations set state = 'broadcasting', updated_at = now()
      where job_id = p_job_id and state = 'candidate_ready';
    return query select false, 'EXPIRED', 'broadcasting'::public.job_status,
      v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;
  if v_job.status <> 'worker_candidate_pending' or v_candidate.status <> 'proposed'
    or v_proposal.status <> 'proposed'
    then return query select false, 'INVALID_STATUS', v_job.status, v_candidate.id, v_candidate.worker_id, false; return; end if;
  select * into v_worker from public.worker_profiles
    where id = v_candidate.worker_id for update;
  v_job_district := public.normalize_hcmc_district_code(v_job.address_district);
  if v_worker.id is null or not v_worker.is_approved or not v_worker.is_available
    or v_worker.is_suspended or v_job_district is null or v_job_district = 'hcmc_all'
    or v_worker.selected_service_types is null
    or not (v_job.service_type = any(v_worker.selected_service_types))
    or v_worker.districts is null
    or not (v_job_district = any(v_worker.districts) or 'hcmc_all' = any(v_worker.districts))
    or v_worker.synthetic_cohort_id is distinct from v_job.synthetic_cohort_id
    or exists (
      select 1 from public.worker_service_quality_status quality
      where quality.worker_id = v_worker.id and quality.service_type = v_job.service_type
        and quality.is_locked
    )
    or exists (
      select 1 from public.jobs busy where busy.worker_id = v_worker.id
        and busy.id <> p_job_id and busy.status in (
          'worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing',
          'scope_change_pending', 'completed_by_worker'
        )
    )
    or exists (
      select 1 from public.job_worker_candidates reserved
      where reserved.worker_id = v_worker.id and reserved.job_id <> p_job_id
        and reserved.status = 'proposed'
        and (reserved.expires_at is null or reserved.expires_at > now())
    )
    or not private.worker_meets_job_matching_requirements(
      v_job.quote_mode,
      v_job.diagnosis_scope,
      v_job.intake_scope_snapshot,
      v_worker.problem_specializations
    )
  then
    update public.job_worker_candidates set status = 'withdrawn', updated_at = now()
      where id = v_candidate.id and status = 'proposed';
    update public.worker_matching_proposals set status = 'withdrawn', updated_at = now()
      where id = v_proposal.id and status = 'proposed';
    update public.jobs set status = 'broadcasting', broadcast_at = null
      where id = p_job_id and status = 'worker_candidate_pending';
    update public.matching_operations set state = 'broadcasting', updated_at = now()
      where job_id = p_job_id and state = 'candidate_ready';
    update public.confirmation_operations set state = 'broadcasting', updated_at = now()
      where job_id = p_job_id and state = 'candidate_ready';
    return query select false, 'WORKER_NOT_ELIGIBLE', 'broadcasting'::public.job_status,
      v_candidate.id, v_candidate.worker_id, false;
    return;
  end if;
  update public.job_worker_candidates set status = 'customer_confirmed',
    customer_decided_at = now(), updated_at = now() where id = v_candidate.id and status = 'proposed';
  if not found then raise exception using errcode = '40001', message = 'CANDIDATE_RACE_LOST'; end if;
  update public.worker_matching_proposals set status = 'customer_confirmed', updated_at = now()
    where id = v_proposal.id and status = 'proposed';
  update public.jobs set worker_id = v_candidate.worker_id, status = 'worker_matched',
    matched_at = now(), kael_price_min = coalesce(v_proposal.price_min, kael_price_min),
    kael_price_max = coalesce(v_proposal.price_max, kael_price_max)
    where id = p_job_id and status = 'worker_candidate_pending';
  if not found then raise exception using errcode = '40001', message = 'JOB_MATCH_RACE_LOST'; end if;
  update public.job_broadcasts set status = 'reassigned', responded_at = now()
    where job_id = p_job_id and id <> v_candidate.broadcast_id and status = 'sent';
  update public.matching_recipient_deliveries set status = 'expired', updated_at = now()
    where job_id = p_job_id and broadcast_id <> v_candidate.broadcast_id
      and status in ('queued', 'delivered', 'seen');
  update public.matching_operations set state = 'official_match', updated_at = now()
    where job_id = p_job_id and state = 'candidate_ready';
  update public.confirmation_operations set state = 'official_match', updated_at = now()
    where job_id = p_job_id;
  return query select true, null::text, 'worker_matched'::public.job_status,
    v_candidate.id, v_candidate.worker_id, false;
end;
$func$;

create or replace function public.bind_synthetic_matching_cohort(
  p_cohort_id text, p_customer_ids uuid[], p_worker_ids uuid[]
) returns table(bound_customers integer, bound_workers integer)
language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare v_customer_count integer; v_worker_count integer;
begin
  if p_cohort_id !~ '^synthetic-[a-z0-9-]{8,100}$'
    or cardinality(p_customer_ids) < 1 or cardinality(p_worker_ids) < 1
    or array_position(p_customer_ids, null) is not null
    or array_position(p_worker_ids, null) is not null
  then raise exception using errcode = '22023', message = 'SYNTHETIC_COHORT_BINDING_INVALID'; end if;
  if exists (
    select 1 from unnest(p_customer_ids) requested(id)
    left join public.profiles profile on profile.id = requested.id
    left join auth.users identity on identity.id = requested.id
    where profile.id is null or profile.role <> 'customer'
      or identity.email is null or identity.email not like '%@example.test'
      or exists (select 1 from public.jobs where customer_id = requested.id)
      or exists (select 1 from public.kael_chat_sessions where customer_id = requested.id)
  ) or exists (
    select 1 from unnest(p_worker_ids) requested(id)
    left join public.profiles profile on profile.id = requested.id
    left join auth.users identity on identity.id = requested.id
    where profile.id is null or profile.role <> 'worker'
      or identity.email is null or identity.email not like '%@example.test'
  ) then raise exception using errcode = '42501', message = 'SYNTHETIC_DEDICATED_IDENTITY_REQUIRED'; end if;
  if exists (select 1 from public.worker_payout_methods where worker_id = any(p_worker_ids))
    or exists (select 1 from public.worker_withdrawal_requests where worker_id = any(p_worker_ids))
    or exists (select 1 from public.worker_payment_ledger where worker_id = any(p_worker_ids))
    or exists (
      select 1 from public.customer_favorite_workers favorite
      where favorite.worker_id = any(p_worker_ids)
        and not (favorite.customer_id = any(p_customer_ids))
    )
    or exists (
      select 1 from public.customer_favorite_workers favorite
      where favorite.customer_id = any(p_customer_ids)
        and not (favorite.worker_id = any(p_worker_ids))
    )
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_EXISTING_RELATIONSHIP_FORBIDDEN';
  end if;
  insert into public.synthetic_matching_cohorts(cohort_id) values (p_cohort_id)
    on conflict do nothing;
  insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    select p_cohort_id, id, 'customer' from unnest(p_customer_ids) requested(id)
    on conflict (profile_id) do update set cohort_id = excluded.cohort_id,
      member_role = excluded.member_role;
  get diagnostics v_customer_count = row_count;
  insert into public.synthetic_matching_cohort_members(cohort_id, profile_id, member_role)
    select p_cohort_id, id, 'worker' from unnest(p_worker_ids) requested(id)
    on conflict (profile_id) do update set cohort_id = excluded.cohort_id,
      member_role = excluded.member_role;
  get diagnostics v_worker_count = row_count;
  update public.worker_profiles set synthetic_cohort_id = p_cohort_id,
    matching_push_proven_at = null, matching_foreground_active_until = null,
    updated_at = now() where id = any(p_worker_ids);
  return query select v_customer_count, v_worker_count;
end;
$func$;

create or replace function public.cleanup_synthetic_matching_cohort(p_cohort_id text)
returns table(deleted_jobs integer, deleted_sessions integer, cleared_workers integer)
language plpgsql security invoker set search_path = public, pg_catalog as $func$
declare v_jobs integer; v_sessions integer; v_workers integer;
begin
  if p_cohort_id !~ '^synthetic-[a-z0-9-]{8,100}$' then
    raise exception using errcode = '22023', message = 'SYNTHETIC_COHORT_REQUIRED';
  end if;
  delete from public.kael_chat_sessions where synthetic_cohort_id = p_cohort_id;
  get diagnostics v_sessions = row_count;
  delete from public.jobs where synthetic_cohort_id = p_cohort_id;
  get diagnostics v_jobs = row_count;
  update public.worker_profiles set matching_push_proven_at = null,
    matching_foreground_active_until = null,
    updated_at = now() where synthetic_cohort_id = p_cohort_id;
  get diagnostics v_workers = row_count;
  return query select v_jobs, v_sessions, v_workers;
end;
$func$;

revoke execute on function private.worker_meets_job_matching_requirements(
    public.service_quote_mode,jsonb,jsonb,text[]
  ),
  public.confirm_kael_chat_durable_atomic(uuid,uuid,text,text,text),
  public.get_kael_confirmation_operation(uuid,uuid),
  public.claim_confirmation_matching_outbox(uuid,uuid,integer),
  public.settle_confirmation_matching_operation(uuid,text,text),
  public.activate_job_broadcast_batch_durable_atomic(uuid,uuid[],uuid,timestamptz,timestamptz),
  public.record_worker_matching_heartbeat(uuid,timestamptz),
  public.mark_matching_delivery_delivered(uuid),
  public.mark_matching_delivery_seen(uuid,uuid),
  public.expire_worker_matching_deliveries(uuid,timestamptz),
  public.accept_priced_broadcast_durable_atomic(uuid,uuid,uuid),
  public.submit_worker_matching_proposal_atomic(uuid,uuid,uuid,text,integer,integer),
  public.submit_worker_matching_proposal_atomic(uuid,uuid,text,integer,integer),
  public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid),
  public.bind_synthetic_matching_cohort(text,uuid[],uuid[]),
  public.cleanup_synthetic_matching_cohort(text)
from public, anon, authenticated;

grant execute on function private.worker_meets_job_matching_requirements(
    public.service_quote_mode,jsonb,jsonb,text[]
  ),
  public.confirm_kael_chat_durable_atomic(uuid,uuid,text,text,text),
  public.get_kael_confirmation_operation(uuid,uuid),
  public.claim_confirmation_matching_outbox(uuid,uuid,integer),
  public.settle_confirmation_matching_operation(uuid,text,text),
  public.activate_job_broadcast_batch_durable_atomic(uuid,uuid[],uuid,timestamptz,timestamptz),
  public.record_worker_matching_heartbeat(uuid,timestamptz),
  public.mark_matching_delivery_delivered(uuid),
  public.mark_matching_delivery_seen(uuid,uuid),
  public.expire_worker_matching_deliveries(uuid,timestamptz),
  public.accept_priced_broadcast_durable_atomic(uuid,uuid,uuid),
  public.submit_worker_matching_proposal_atomic(uuid,uuid,uuid,text,integer,integer),
  public.submit_worker_matching_proposal_atomic(uuid,uuid,text,integer,integer),
  public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid),
  public.bind_synthetic_matching_cohort(text,uuid[],uuid[]),
  public.cleanup_synthetic_matching_cohort(text)
to service_role;

comment on table public.confirmation_operations is
  'Idempotent, recoverable customer confirmation state. No external provider call is part of its transaction.';
comment on table public.matching_recipient_deliveries is
  'Server-owned recipient delivery state with a five-minute exclusivity TTL.';
comment on function public.cleanup_synthetic_matching_cohort(text) is
  'Deletes only rows tagged with the exact synthetic cohort while permanently retaining its dedicated actor classification.';

commit;
