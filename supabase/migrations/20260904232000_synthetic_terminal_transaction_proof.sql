begin;

create table if not exists public.stage1_synthetic_transaction_proofs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  release_id text not null references public.harness_releases(release_id),
  environment text not null check (environment in ('staging', 'production')),
  cohort_id text not null check (cohort_id ~ '^synthetic-[a-z0-9-]{8,100}$'),
  run_id text not null check (run_id ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  sequence smallint not null check (sequence between 1 and 3),
  scenario_kind text not null check (scenario_kind in ('auto_quote', 'rfq_or_inspection')),
  job_fingerprint_sha256 text not null check (job_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  terminal_state_sha256 text not null unique check (terminal_state_sha256 ~ '^[0-9a-f]{64}$'),
  reached_status public.job_status not null check (reached_status = 'reviewed'::public.job_status),
  fulfillment_passed boolean not null check (fulfillment_passed),
  completion_passed boolean not null check (completion_passed),
  payment_passed boolean not null check (payment_passed),
  review_passed boolean not null check (review_passed),
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (release_id, environment, cohort_id, run_id, sequence, scenario_kind)
);

alter table public.stage1_synthetic_transaction_proofs enable row level security;
revoke all on public.stage1_synthetic_transaction_proofs from public, anon, authenticated;
grant select on public.stage1_synthetic_transaction_proofs to service_role;

create or replace trigger stage1_synthetic_transaction_proofs_append_only
before update or delete on public.stage1_synthetic_transaction_proofs
for each row execute function public.reject_stage1_release_evidence_mutation();

create or replace function private.guard_synthetic_job_release_boundary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_verified_original_scope_price boolean := new.final_price is null;
  v_terminal_authorized boolean :=
    pg_catalog.current_setting('app.synthetic_terminal_cohort', true) = new.synthetic_cohort_id
    and pg_catalog.current_setting('app.synthetic_terminal_job_id', true) = new.id::text;
begin
  if new.synthetic_cohort_id is null then
    return new;
  end if;

  if new.final_price is not null then
    select exists (
      select 1
      from public.job_worker_candidates as candidate
      where candidate.job_id = new.id
        and candidate.worker_id = new.worker_id
        and candidate.status = 'customer_confirmed'
        and candidate.customer_decided_at is not null
        and candidate.customer_decided_at <= candidate.expires_at
        and private.is_valid_original_scope_price_quote(
          candidate.original_scope_price_quote,
          candidate.job_id,
          candidate.worker_id,
          candidate.broadcast_id,
          candidate.expires_at,
          true
        )
        and (candidate.original_scope_price_quote ->> 'customer_total')::integer
          = new.final_price
    ) into v_verified_original_scope_price;
  end if;

  if not v_verified_original_scope_price
    or new.gross_amount is not null
    or new.platform_fee is not null
    or new.worker_net is not null
    or new.payment_code is not null
    or new.payment_transfer_content is not null
    or new.payment_qr_image_url is not null
    or new.payment_expires_at is not null
    or new.sepay_transaction_id is not null
    or new.sepay_reference_code is not null
    or new.payment_failure_reason is not null
  then
    raise exception using
      errcode = '42501',
      message = 'SYNTHETIC_RELEASE_BOUNDARY_EXCEEDED';
  end if;

  if v_terminal_authorized then
    if new.status = 'confirmed_by_customer'::public.job_status then
      if new.payment_status <> 'not_started' or new.payment_provider is not null
        or new.confirmed_at is null or new.paid_at is not null
        or new.payment_received_at is not null or new.payment_amount_received is not null
      then
        raise exception using errcode = '42501', message = 'SYNTHETIC_TERMINAL_STATE_INVALID';
      end if;
    elsif new.status = 'payment_pending'::public.job_status then
      if new.payment_status <> 'pending' or new.payment_provider <> 'staging_simulator'
        or new.confirmed_at is null or new.paid_at is not null
        or new.payment_received_at is not null or new.payment_amount_received is not null
      then
        raise exception using errcode = '42501', message = 'SYNTHETIC_TERMINAL_STATE_INVALID';
      end if;
    elsif new.status in ('paid'::public.job_status, 'reviewed'::public.job_status) then
      if new.payment_status <> 'received' or new.payment_provider <> 'staging_simulator'
        or new.confirmed_at is null or new.paid_at is null
        or new.payment_received_at is null
        or new.payment_amount_received is distinct from new.final_price
        or (new.status = 'reviewed'::public.job_status and new.reviewed_at is null)
      then
        raise exception using errcode = '42501', message = 'SYNTHETIC_TERMINAL_STATE_INVALID';
      end if;
    else
      raise exception using errcode = '42501', message = 'SYNTHETIC_TERMINAL_STATE_INVALID';
    end if;
    return new;
  end if;

  if new.status not in (
    'draft'::public.job_status,
    'analyzing'::public.job_status,
    'estimate_ready'::public.job_status,
    'awaiting_customer_confirm'::public.job_status,
    'broadcasting'::public.job_status,
    'worker_candidate_pending'::public.job_status,
    'worker_matched'::public.job_status,
    'worker_on_way'::public.job_status,
    'arrived'::public.job_status,
    'inspecting'::public.job_status,
    'repairing'::public.job_status,
    'scope_change_pending'::public.job_status,
    'completed_by_worker'::public.job_status,
    'cancelled'::public.job_status
  ) or new.payment_status <> 'not_started'
    or new.payment_provider is not null
    or new.confirmed_at is not null
    or new.paid_at is not null
    or new.reviewed_at is not null
    or new.payment_received_at is not null
    or new.payment_amount_received is not null
  then
    raise exception using
      errcode = '42501',
      message = 'SYNTHETIC_RELEASE_BOUNDARY_EXCEEDED';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_synthetic_job_release_boundary()
from public, anon, authenticated;
grant execute on function private.guard_synthetic_job_release_boundary()
to service_role;

create or replace function public.complete_synthetic_transaction_proof(
  p_job_id uuid,
  p_customer_id uuid,
  p_release_id text,
  p_environment text,
  p_cohort_id text,
  p_run_id text,
  p_sequence smallint,
  p_scenario_kind text,
  p_request_id uuid
)
returns table(
  proof_id uuid,
  job_status public.job_status,
  payment_status text,
  fulfillment_passed boolean,
  completion_passed boolean,
  payment_passed boolean,
  review_passed boolean,
  already_applied boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_existing public.stage1_synthetic_transaction_proofs%rowtype;
  v_proof public.stage1_synthetic_transaction_proofs%rowtype;
  v_release_environment text;
  v_now timestamptz := pg_catalog.now();
  v_job_fingerprint text;
  v_terminal_sha text;
  v_fulfillment_passed boolean;
begin
  if p_job_id is null or p_customer_id is null or p_request_id is null
    or p_release_id !~ '^harness-[0-9a-f]{12}-[0-9a-f]{12}$'
    or p_environment not in ('staging', 'production')
    or p_cohort_id !~ '^synthetic-[a-z0-9-]{8,100}$'
    or p_run_id !~ '^[A-Za-z0-9_.:-]{1,120}$'
    or p_sequence not between 1 and 3
    or p_scenario_kind not in ('auto_quote', 'rfq_or_inspection')
  then
    raise exception using errcode = '22023', message = 'SYNTHETIC_TERMINAL_INPUT_INVALID';
  end if;

  select release.environment into v_release_environment
  from public.harness_releases as release
  where release.release_id = p_release_id;
  if v_release_environment is distinct from p_environment then
    raise exception using errcode = '23503', message = 'SYNTHETIC_TERMINAL_RELEASE_INVALID';
  end if;
  if p_environment = 'production' and not exists (
    select 1 from public.stage1_release_controls as control
    where control.environment = 'production'
      and control.candidate_release_id = p_release_id
      and control.candidate_cohort_id = p_cohort_id
  ) then
    raise exception using errcode = '55000', message = 'STAGE1_CANARY_NOT_ACTIVE';
  end if;

  v_job_fingerprint := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.concat_ws(E'\n', 'synthetic-job.v1', p_job_id::text, p_release_id,
      p_environment, p_cohort_id, p_run_id, p_sequence::text, p_scenario_kind),
    'UTF8'
  ), 'sha256'), 'hex');

  select proof.* into v_existing
  from public.stage1_synthetic_transaction_proofs as proof
  where proof.release_id = p_release_id
    and proof.environment = p_environment
    and proof.cohort_id = p_cohort_id
    and proof.run_id = p_run_id
    and proof.sequence = p_sequence
    and proof.scenario_kind = p_scenario_kind;
  if found then
    if v_existing.request_id is distinct from p_request_id
      or v_existing.job_fingerprint_sha256 is distinct from v_job_fingerprint
    then
      raise exception using errcode = '23505', message = 'SYNTHETIC_TERMINAL_PROOF_COLLISION';
    end if;
    return query select v_existing.id, v_existing.reached_status, 'received'::text,
      v_existing.fulfillment_passed, v_existing.completion_passed,
      v_existing.payment_passed, v_existing.review_passed, true;
    return;
  end if;

  select job.* into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;
  if not found
    or v_job.customer_id is distinct from p_customer_id
    or v_job.synthetic_cohort_id is distinct from p_cohort_id
    or v_job.worker_id is null
    or not exists (
      select 1 from public.synthetic_matching_cohort_members as customer_member
      where customer_member.cohort_id = p_cohort_id
        and customer_member.profile_id = v_job.customer_id
        and customer_member.member_role = 'customer'::public.user_role
    )
    or not exists (
      select 1 from public.synthetic_matching_cohort_members as worker_member
      where worker_member.cohort_id = p_cohort_id
        and worker_member.profile_id = v_job.worker_id
        and worker_member.member_role = 'worker'::public.user_role
    )
  then
    raise exception using errcode = '42501', message = 'SYNTHETIC_TERMINAL_COHORT_INVALID';
  end if;
  if (p_scenario_kind = 'auto_quote' and v_job.quote_mode <> 'kael_auto_quote')
    or (p_scenario_kind = 'rfq_or_inspection'
      and v_job.quote_mode not in ('rfq', 'inspection_only'))
  then
    raise exception using errcode = '23514', message = 'SYNTHETIC_TERMINAL_SCENARIO_INVALID';
  end if;
  if v_job.status is distinct from 'completed_by_worker'::public.job_status
    or v_job.final_price is null or v_job.final_price <= 0
    or v_job.completed_at is null
    or pg_catalog.cardinality(v_job.completion_photo_urls) = 0
    or nullif(pg_catalog.btrim(v_job.completion_notes), '') is null
  then
    raise exception using errcode = '23514', message = 'SYNTHETIC_COMPLETION_PROOF_REQUIRED';
  end if;

  select
    exists (select 1 from public.job_events event where event.job_id = p_job_id
      and event.actor_id = v_job.worker_id and event.event_type = 'worker_status_update'
      and event.from_status = 'worker_matched' and event.to_status = 'worker_on_way')
    and exists (select 1 from public.job_events event where event.job_id = p_job_id
      and event.actor_id = v_job.worker_id and event.event_type = 'worker_status_update'
      and event.from_status = 'worker_on_way' and event.to_status = 'arrived')
    and exists (select 1 from public.job_events event where event.job_id = p_job_id
      and event.actor_id = v_job.worker_id and event.event_type = 'worker_status_update'
      and event.from_status = 'arrived' and event.to_status = 'inspecting')
    and exists (select 1 from public.job_events event where event.job_id = p_job_id
      and event.actor_id = v_job.worker_id and event.event_type = 'worker_status_update'
      and event.from_status = 'inspecting' and event.to_status = 'repairing')
    and exists (select 1 from public.job_events event where event.job_id = p_job_id
      and event.actor_id = v_job.worker_id and event.event_type = 'worker_status_update'
      and event.from_status = 'repairing' and event.to_status = 'completed_by_worker')
    and exists (select 1 from public.job_media_assets media where media.job_id = p_job_id
      and media.owner_id = v_job.worker_id and media.stage = 'after')
  into v_fulfillment_passed;
  if not v_fulfillment_passed then
    raise exception using errcode = '23514', message = 'SYNTHETIC_FULFILLMENT_PROOF_REQUIRED';
  end if;

  perform pg_catalog.set_config('app.synthetic_terminal_cohort', p_cohort_id, true);
  perform pg_catalog.set_config('app.synthetic_terminal_job_id', p_job_id::text, true);

  update public.jobs as job
  set status = 'confirmed_by_customer'::public.job_status,
    confirmed_at = v_now
  where job.id = p_job_id and job.status = 'completed_by_worker'::public.job_status;
  if not found then raise exception using errcode = '40001', message = 'SYNTHETIC_TERMINAL_STATE_CHANGED'; end if;

  update public.jobs as job
  set status = 'payment_pending'::public.job_status,
    payment_provider = 'staging_simulator', payment_status = 'pending',
    payment_updated_at = v_now
  where job.id = p_job_id and job.status = 'confirmed_by_customer'::public.job_status;
  if not found then raise exception using errcode = '40001', message = 'SYNTHETIC_TERMINAL_STATE_CHANGED'; end if;

  update public.jobs as job
  set status = 'paid'::public.job_status,
    payment_status = 'received', payment_received_at = v_now,
    payment_amount_received = job.final_price, payment_updated_at = v_now,
    paid_at = v_now
  where job.id = p_job_id and job.status = 'payment_pending'::public.job_status;
  if not found then raise exception using errcode = '40001', message = 'SYNTHETIC_TERMINAL_STATE_CHANGED'; end if;

  update public.jobs as job
  set status = 'reviewed'::public.job_status, reviewed_at = v_now
  where job.id = p_job_id and job.status = 'paid'::public.job_status;
  if not found then raise exception using errcode = '40001', message = 'SYNTHETIC_TERMINAL_STATE_CHANGED'; end if;

  v_terminal_sha := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    pg_catalog.concat_ws(E'\n', 'synthetic-terminal.v1', p_release_id, p_environment,
      p_cohort_id, p_run_id, p_sequence::text, p_scenario_kind, v_job_fingerprint,
      'reviewed', 'received', v_job.final_price::text, v_now::text),
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.stage1_synthetic_transaction_proofs(
    request_id, release_id, environment, cohort_id, run_id, sequence,
    scenario_kind, job_fingerprint_sha256, terminal_state_sha256,
    reached_status, fulfillment_passed, completion_passed, payment_passed,
    review_passed, generated_at
  ) values (
    p_request_id, p_release_id, p_environment, p_cohort_id, p_run_id, p_sequence,
    p_scenario_kind, v_job_fingerprint, v_terminal_sha,
    'reviewed'::public.job_status, true, true, true, true, v_now
  ) returning * into v_proof;

  perform pg_catalog.set_config('app.synthetic_terminal_cohort', '', true);
  perform pg_catalog.set_config('app.synthetic_terminal_job_id', '', true);

  return query select v_proof.id, v_proof.reached_status, 'received'::text,
    true, true, true, true, false;
end;
$function$;

revoke execute on function public.complete_synthetic_transaction_proof(
  uuid,uuid,text,text,text,text,smallint,text,uuid
) from public, anon, authenticated;
grant execute on function public.complete_synthetic_transaction_proof(
  uuid,uuid,text,text,text,text,smallint,text,uuid
) to service_role;

create or replace function public.require_stage1_synthetic_terminal_proofs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (
    select pg_catalog.count(*)
    from public.stage1_synthetic_transaction_proofs as proof
    where proof.release_id = new.release_id
      and proof.environment = new.environment
      and proof.cohort_id = new.cohort_id
      and proof.run_id = new.run_id
      and proof.sequence = new.sequence
      and proof.scenario_kind in ('auto_quote', 'rfq_or_inspection')
      and proof.reached_status = 'reviewed'::public.job_status
      and proof.fulfillment_passed and proof.completion_passed
      and proof.payment_passed and proof.review_passed
  ) <> 2 then
    raise exception using errcode = '23514', message = 'STAGE1_TERMINAL_PROOFS_REQUIRED';
  end if;
  return new;
end;
$function$;

revoke all on function public.require_stage1_synthetic_terminal_proofs()
from public, anon, authenticated;
grant execute on function public.require_stage1_synthetic_terminal_proofs()
to service_role;

create or replace trigger stage1_smoke_requires_terminal_proofs
before insert on public.stage1_synthetic_smoke_receipts
for each row execute function public.require_stage1_synthetic_terminal_proofs();

comment on table public.stage1_synthetic_transaction_proofs is
  'Append-only aggregate proof that an isolated release-bound synthetic job reached reviewed without entering real finance, payout, analytics, or review tables.';
comment on function public.complete_synthetic_transaction_proof(
  uuid,uuid,text,text,text,text,smallint,text,uuid
) is 'Service-role-only terminal simulator for isolated release cohorts after public fulfillment evidence; it never writes real finance, payout, or review records.';

commit;
