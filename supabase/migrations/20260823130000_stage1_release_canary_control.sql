begin;

create table if not exists public.stage1_release_controls (
  environment text primary key check (environment in ('staging', 'production')),
  active_release_id text references public.harness_releases(release_id),
  previous_active_release_id text references public.harness_releases(release_id),
  candidate_release_id text references public.harness_releases(release_id),
  candidate_cohort_id text,
  candidate_packet_sha256 text check (
    candidate_packet_sha256 is null or candidate_packet_sha256 ~ '^[0-9a-f]{64}$'
  ),
  candidate_started_at timestamptz,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  check (
    (candidate_release_id is null and candidate_cohort_id is null and candidate_packet_sha256 is null and candidate_started_at is null)
    or
    (candidate_release_id is not null and candidate_cohort_id is not null and candidate_packet_sha256 is not null and candidate_started_at is not null)
  )
);

create table if not exists public.stage1_synthetic_smoke_receipts (
  id uuid primary key default gen_random_uuid(),
  release_id text not null references public.harness_releases(release_id),
  environment text not null check (environment in ('staging', 'production')),
  cohort_id text not null check (cohort_id ~ '^synthetic-[a-z0-9-]{8,100}$'),
  run_id text not null check (run_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  sequence smallint not null check (sequence between 1 and 3),
  auto_quote_passed boolean not null,
  rfq_or_inspection_passed boolean not null,
  recovery_passed boolean not null,
  release_identity_match boolean not null,
  terminal_reconcile_passed boolean not null,
  synthetic_leak_count integer not null check (synthetic_leak_count = 0),
  duplicate_job_count integer not null check (duplicate_job_count = 0),
  duplicate_broadcast_count integer not null check (duplicate_broadcast_count = 0),
  safe_error_code_ratio numeric(5,4) not null check (safe_error_code_ratio = 1),
  confirm_acceptance_ms integer not null check (confirm_acceptance_ms between 0 and 3000),
  worker_offer_visible_ms integer not null check (worker_offer_visible_ms between 0 and 10000),
  support_trace_count integer not null check (support_trace_count > 0),
  receipt_generated_at timestamptz not null,
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (release_id, environment, cohort_id, sequence),
  unique (receipt_sha256)
);

create table if not exists public.stage1_release_control_events (
  id bigint generated always as identity primary key,
  environment text not null check (environment in ('staging', 'production')),
  release_id text not null references public.harness_releases(release_id),
  event_type text not null check (event_type in ('canary_started', 'promoted', 'aborted', 'rolled_back')),
  cohort_id text,
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  revision bigint not null check (revision >= 1),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.stage1_release_controls enable row level security;
alter table public.stage1_synthetic_smoke_receipts enable row level security;
alter table public.stage1_release_control_events enable row level security;

revoke all on public.stage1_release_controls,
  public.stage1_synthetic_smoke_receipts,
  public.stage1_release_control_events
from public, anon, authenticated;

grant select on public.stage1_release_controls,
  public.stage1_synthetic_smoke_receipts,
  public.stage1_release_control_events to service_role;
grant usage, select on sequence public.stage1_release_control_events_id_seq to service_role;

create or replace function public.reject_stage1_release_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $func$
begin
  raise exception using errcode = '55000', message = 'STAGE1_RELEASE_EVIDENCE_APPEND_ONLY';
end;
$func$;

create or replace trigger stage1_synthetic_smoke_receipts_append_only
before update or delete on public.stage1_synthetic_smoke_receipts
for each row execute function public.reject_stage1_release_evidence_mutation();

create or replace trigger stage1_release_control_events_append_only
before update or delete on public.stage1_release_control_events
for each row execute function public.reject_stage1_release_evidence_mutation();

create or replace function public.configure_stage1_release_canary(
  p_environment text,
  p_release_id text,
  p_cohort_id text,
  p_expected_active_release_id text,
  p_packet_sha256 text
) returns table(revision bigint, active_release_id text, candidate_release_id text, candidate_cohort_id text)
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_control public.stage1_release_controls%rowtype;
begin
  if p_environment not in ('staging', 'production')
    or p_release_id is null
    or p_cohort_id is null
    or p_cohort_id !~ '^synthetic-[a-z0-9-]{8,100}$'
    or p_packet_sha256 is null
    or p_packet_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'STAGE1_CANARY_INPUT_INVALID';
  end if;
  if not exists (
    select 1 from public.harness_releases release
    where release.release_id = p_release_id and release.environment = p_environment
  ) then
    raise exception using errcode = '23503', message = 'STAGE1_RELEASE_NOT_REGISTERED';
  end if;

  insert into public.stage1_release_controls(environment)
  values (p_environment)
  on conflict (environment) do nothing;

  select * into v_control
  from public.stage1_release_controls control
  where control.environment = p_environment
  for update;

  if v_control.active_release_id is distinct from p_expected_active_release_id then
    raise exception using errcode = '40001', message = 'STAGE1_ACTIVE_RELEASE_CHANGED';
  end if;
  if v_control.candidate_release_id is not null
    and (v_control.candidate_release_id <> p_release_id or v_control.candidate_cohort_id <> p_cohort_id)
  then
    raise exception using errcode = '55000', message = 'STAGE1_CANARY_ALREADY_ACTIVE';
  end if;
  if v_control.candidate_release_id = p_release_id
    and v_control.candidate_cohort_id = p_cohort_id
    and v_control.candidate_packet_sha256 = p_packet_sha256
  then
    return query select v_control.revision, v_control.active_release_id,
      v_control.candidate_release_id, v_control.candidate_cohort_id;
    return;
  end if;

  update public.stage1_release_controls control
  set candidate_release_id = p_release_id,
      candidate_cohort_id = p_cohort_id,
      candidate_packet_sha256 = p_packet_sha256,
      candidate_started_at = coalesce(control.candidate_started_at, now()),
      revision = control.revision + 1,
      updated_at = now()
  where control.environment = p_environment
  returning * into v_control;

  insert into public.stage1_release_control_events(
    environment, release_id, event_type, cohort_id, evidence_sha256, revision
  ) values (
    p_environment, p_release_id, 'canary_started', p_cohort_id,
    p_packet_sha256, v_control.revision
  );

  return query select v_control.revision, v_control.active_release_id,
    v_control.candidate_release_id, v_control.candidate_cohort_id;
end;
$func$;

create or replace function public.resolve_stage1_release_lane(
  p_environment text,
  p_release_id text,
  p_session_id uuid
) returns text
language plpgsql
security definer
set search_path = ''
stable
as $func$
declare
  v_control public.stage1_release_controls%rowtype;
  v_cohort_id text;
begin
  select * into v_control
  from public.stage1_release_controls control
  where control.environment = p_environment;
  if not found then return 'previous'; end if;
  if v_control.active_release_id = p_release_id then return 'active'; end if;
  if v_control.candidate_release_id <> p_release_id then return 'previous'; end if;
  select session.synthetic_cohort_id into v_cohort_id
  from public.kael_chat_sessions session
  where session.id = p_session_id;
  if v_cohort_id = v_control.candidate_cohort_id then return 'candidate'; end if;
  return 'previous';
end;
$func$;

create or replace function public.record_stage1_synthetic_smoke(
  p_release_id text,
  p_environment text,
  p_cohort_id text,
  p_run_id text,
  p_sequence smallint,
  p_auto_quote_passed boolean,
  p_rfq_or_inspection_passed boolean,
  p_recovery_passed boolean,
  p_release_identity_match boolean,
  p_terminal_reconcile_passed boolean,
  p_synthetic_leak_count integer,
  p_duplicate_job_count integer,
  p_duplicate_broadcast_count integer,
  p_safe_error_code_ratio numeric,
  p_confirm_acceptance_ms integer,
  p_worker_offer_visible_ms integer,
  p_support_trace_count integer,
  p_receipt_generated_at text,
  p_receipt_sha256 text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_control public.stage1_release_controls%rowtype;
  v_existing public.stage1_synthetic_smoke_receipts%rowtype;
  v_id uuid;
  v_expected_sha256 text;
begin
  select * into v_control from public.stage1_release_controls control
  where control.environment = p_environment for update;
  if not found
    or v_control.candidate_release_id <> p_release_id
    or v_control.candidate_cohort_id <> p_cohort_id
  then
    raise exception using errcode = '55000', message = 'STAGE1_CANARY_NOT_ACTIVE';
  end if;
  if p_auto_quote_passed is distinct from true
    or p_rfq_or_inspection_passed is distinct from true
    or p_recovery_passed is distinct from true
    or p_release_identity_match is distinct from true
    or p_terminal_reconcile_passed is distinct from true
    or p_synthetic_leak_count is distinct from 0
    or p_duplicate_job_count is distinct from 0
    or p_duplicate_broadcast_count is distinct from 0
    or p_safe_error_code_ratio is distinct from 1::numeric
    or p_confirm_acceptance_ms is null or p_confirm_acceptance_ms not between 0 and 3000
    or p_worker_offer_visible_ms is null or p_worker_offer_visible_ms not between 0 and 10000
    or p_support_trace_count is null or p_support_trace_count <= 0
    or p_sequence is null or p_sequence not between 1 and 3
    or p_receipt_generated_at is null
    or p_receipt_generated_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    or p_receipt_sha256 is null or p_receipt_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '23514', message = 'STAGE1_SYNTHETIC_SMOKE_FAILED';
  end if;

  v_expected_sha256 := encode(extensions.digest(convert_to(concat_ws(E'\n',
    '1.0.0', p_release_id, p_environment, p_cohort_id, p_run_id,
    p_sequence::text, p_auto_quote_passed::text,
    p_rfq_or_inspection_passed::text, p_recovery_passed::text,
    p_release_identity_match::text, p_terminal_reconcile_passed::text,
    p_synthetic_leak_count::text, p_duplicate_job_count::text,
    p_duplicate_broadcast_count::text, p_safe_error_code_ratio::text,
    p_confirm_acceptance_ms::text, p_worker_offer_visible_ms::text,
    p_support_trace_count::text, p_receipt_generated_at
  ), 'UTF8'), 'sha256'), 'hex');
  if v_expected_sha256 <> p_receipt_sha256 then
    raise exception using errcode = '23514', message = 'STAGE1_SYNTHETIC_SMOKE_CHECKSUM_INVALID';
  end if;

  insert into public.stage1_synthetic_smoke_receipts(
    release_id, environment, cohort_id, run_id, sequence,
    auto_quote_passed, rfq_or_inspection_passed, recovery_passed,
    release_identity_match, terminal_reconcile_passed,
    synthetic_leak_count, duplicate_job_count, duplicate_broadcast_count,
    safe_error_code_ratio, confirm_acceptance_ms, worker_offer_visible_ms,
    support_trace_count, receipt_generated_at, receipt_sha256
  ) values (
    p_release_id, p_environment, p_cohort_id, p_run_id, p_sequence,
    p_auto_quote_passed, p_rfq_or_inspection_passed, p_recovery_passed,
    p_release_identity_match, p_terminal_reconcile_passed,
    p_synthetic_leak_count, p_duplicate_job_count, p_duplicate_broadcast_count,
    p_safe_error_code_ratio, p_confirm_acceptance_ms, p_worker_offer_visible_ms,
    p_support_trace_count, p_receipt_generated_at::timestamptz, p_receipt_sha256
  ) on conflict (release_id, environment, cohort_id, sequence) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing
    from public.stage1_synthetic_smoke_receipts receipt
    where receipt.release_id = p_release_id
      and receipt.environment = p_environment
      and receipt.cohort_id = p_cohort_id
      and receipt.sequence = p_sequence;
    if v_existing.receipt_sha256 <> p_receipt_sha256
      or v_existing.run_id <> p_run_id
    then
      raise exception using errcode = '23505', message = 'STAGE1_SMOKE_SEQUENCE_COLLISION';
    end if;
    v_id := v_existing.id;
  end if;
  return v_id;
end;
$func$;

create or replace function public.promote_stage1_release_atomic(
  p_environment text,
  p_release_id text,
  p_cohort_id text,
  p_expected_revision bigint,
  p_packet_sha256 text
) returns table(active_release_id text, previous_active_release_id text, revision bigint)
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_control public.stage1_release_controls%rowtype;
begin
  select * into v_control from public.stage1_release_controls control
  where control.environment = p_environment for update;
  if not found
    or v_control.revision <> p_expected_revision
    or v_control.candidate_release_id <> p_release_id
    or v_control.candidate_cohort_id <> p_cohort_id
    or v_control.candidate_packet_sha256 <> p_packet_sha256
  then
    raise exception using errcode = '40001', message = 'STAGE1_PROMOTION_STATE_CHANGED';
  end if;
  if (
    select count(*) from public.stage1_synthetic_smoke_receipts receipt
    where receipt.release_id = p_release_id
      and receipt.environment = p_environment
      and receipt.cohort_id = p_cohort_id
      and receipt.sequence in (1, 2, 3)
  ) <> 3 then
    raise exception using errcode = '23514', message = 'STAGE1_THREE_SMOKES_REQUIRED';
  end if;

  update public.stage1_release_controls control
  set previous_active_release_id = control.active_release_id,
      active_release_id = control.candidate_release_id,
      candidate_release_id = null,
      candidate_cohort_id = null,
      candidate_packet_sha256 = null,
      candidate_started_at = null,
      revision = control.revision + 1,
      updated_at = now()
  where control.environment = p_environment
  returning * into v_control;

  insert into public.stage1_release_control_events(
    environment, release_id, event_type, cohort_id, evidence_sha256, revision
  ) values (
    p_environment, p_release_id, 'promoted', p_cohort_id,
    p_packet_sha256, v_control.revision
  );
  return query select v_control.active_release_id,
    v_control.previous_active_release_id, v_control.revision;
end;
$func$;

create or replace function public.abort_stage1_release_canary(
  p_environment text,
  p_release_id text,
  p_cohort_id text,
  p_evidence_sha256 text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_control public.stage1_release_controls%rowtype;
begin
  select * into v_control from public.stage1_release_controls control
  where control.environment = p_environment for update;
  if not found
    or v_control.candidate_release_id <> p_release_id
    or v_control.candidate_cohort_id <> p_cohort_id
    or p_evidence_sha256 !~ '^[0-9a-f]{64}$'
  then return false; end if;
  update public.stage1_release_controls control
  set candidate_release_id = null,
      candidate_cohort_id = null,
      candidate_packet_sha256 = null,
      candidate_started_at = null,
      revision = control.revision + 1,
      updated_at = now()
  where control.environment = p_environment
  returning * into v_control;
  insert into public.stage1_release_control_events(
    environment, release_id, event_type, cohort_id, evidence_sha256, revision
  ) values (
    p_environment, p_release_id, 'aborted', p_cohort_id,
    p_evidence_sha256, v_control.revision
  );
  return true;
end;
$func$;

create or replace function public.reconcile_stale_stage1_release_canary(
  p_environment text,
  p_expected_candidate_release_id text,
  p_expected_revision bigint,
  p_evidence_sha256 text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_control public.stage1_release_controls%rowtype;
begin
  if p_environment not in ('staging', 'production')
    or p_expected_candidate_release_id is null
    or p_expected_revision is null or p_expected_revision < 1
    or p_evidence_sha256 is null or p_evidence_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'STAGE1_STALE_RECONCILE_INPUT_INVALID';
  end if;
  select * into v_control from public.stage1_release_controls control
  where control.environment = p_environment for update;
  if not found or v_control.candidate_release_id is null then return false; end if;
  if v_control.candidate_release_id <> p_expected_candidate_release_id
    or v_control.revision <> p_expected_revision
  then
    raise exception using errcode = '40001', message = 'STAGE1_STALE_RECONCILE_STATE_CHANGED';
  end if;
  if v_control.candidate_started_at > now() - interval '2 hours' then
    raise exception using errcode = '55000', message = 'STAGE1_CANARY_NOT_STALE';
  end if;

  update public.stage1_release_controls control
  set candidate_release_id = null,
      candidate_cohort_id = null,
      candidate_packet_sha256 = null,
      candidate_started_at = null,
      revision = control.revision + 1,
      updated_at = now()
  where control.environment = p_environment;
  insert into public.stage1_release_control_events(
    environment, release_id, event_type, cohort_id, evidence_sha256, revision,
    safe_metadata
  ) values (
    p_environment, v_control.candidate_release_id, 'aborted',
    v_control.candidate_cohort_id, p_evidence_sha256, v_control.revision + 1,
    jsonb_build_object('reason', 'stale_candidate_timeout',
      'candidate_started_at', v_control.candidate_started_at)
  );
  return true;
end;
$func$;

create or replace function public.rollback_stage1_active_release_atomic(
  p_environment text,
  p_failed_release_id text,
  p_expected_previous_release_id text,
  p_expected_revision bigint,
  p_evidence_sha256 text
) returns table(active_release_id text, previous_active_release_id text, revision bigint)
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_control public.stage1_release_controls%rowtype;
begin
  select * into v_control from public.stage1_release_controls control
  where control.environment = p_environment for update;
  if found
    and v_control.active_release_id is not distinct from p_expected_previous_release_id
    and v_control.candidate_release_id is null
    and exists (
      select 1 from public.stage1_release_control_events event
      where event.environment = p_environment
        and event.release_id = p_failed_release_id
        and event.event_type = 'rolled_back'
        and event.evidence_sha256 = p_evidence_sha256
        and event.revision = v_control.revision
    )
  then
    return query select v_control.active_release_id,
      v_control.previous_active_release_id, v_control.revision;
    return;
  end if;
  if not found
    or v_control.revision <> p_expected_revision
    or v_control.active_release_id is distinct from p_failed_release_id
    or v_control.previous_active_release_id is distinct from p_expected_previous_release_id
    or v_control.candidate_release_id is not null
    or p_evidence_sha256 is null
    or p_evidence_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '40001', message = 'STAGE1_ROLLBACK_STATE_CHANGED';
  end if;

  update public.stage1_release_controls control
  set active_release_id = control.previous_active_release_id,
      previous_active_release_id = null,
      revision = control.revision + 1,
      updated_at = now()
  where control.environment = p_environment
  returning * into v_control;

  insert into public.stage1_release_control_events(
    environment, release_id, event_type, evidence_sha256, revision,
    safe_metadata
  ) values (
    p_environment, p_failed_release_id, 'rolled_back', p_evidence_sha256,
    v_control.revision,
    jsonb_build_object('restored_release_id', p_expected_previous_release_id)
  );
  return query select v_control.active_release_id,
    v_control.previous_active_release_id, v_control.revision;
end;
$func$;

revoke all on function public.reject_stage1_release_evidence_mutation(),
  public.configure_stage1_release_canary(text,text,text,text,text),
  public.resolve_stage1_release_lane(text,text,uuid),
  public.record_stage1_synthetic_smoke(text,text,text,text,smallint,boolean,boolean,boolean,boolean,boolean,integer,integer,integer,numeric,integer,integer,integer,text,text),
  public.promote_stage1_release_atomic(text,text,text,bigint,text),
  public.abort_stage1_release_canary(text,text,text,text),
  public.reconcile_stale_stage1_release_canary(text,text,bigint,text),
  public.rollback_stage1_active_release_atomic(text,text,text,bigint,text)
from public, anon, authenticated;

grant execute on function public.configure_stage1_release_canary(text,text,text,text,text),
  public.resolve_stage1_release_lane(text,text,uuid),
  public.record_stage1_synthetic_smoke(text,text,text,text,smallint,boolean,boolean,boolean,boolean,boolean,integer,integer,integer,numeric,integer,integer,integer,text,text),
  public.promote_stage1_release_atomic(text,text,text,bigint,text),
  public.abort_stage1_release_canary(text,text,text,text),
  public.reconcile_stale_stage1_release_canary(text,text,bigint,text),
  public.rollback_stage1_active_release_atomic(text,text,text,bigint,text)
to service_role;

comment on table public.stage1_release_controls is
  'Atomic active/candidate release switch. Candidate behavior is visible only to its exact synthetic cohort.';
comment on table public.stage1_synthetic_smoke_receipts is
  'Append-only, three-run promotion evidence with strict latency, isolation, duplicate, and trace gates.';

commit;
