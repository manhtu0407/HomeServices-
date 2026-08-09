begin;

create table if not exists public.learning_candidate_provenance (
  candidate_id uuid primary key references public.learning_candidates(id) on delete cascade,
  source_type text not null check (source_type in ('runtime_observation', 'batch_evidence', 'admin_import', 'external_document', 'unknown')),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  consent_hash text not null check (consent_hash ~ '^[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  release_id text not null,
  consent_status text not null check (consent_status in ('aggregate_only', 'consented', 'admin_review_required', 'revoked')),
  privacy_status text not null check (privacy_status in ('pending_review', 'redacted', 'rejected')),
  dispute_status text not null check (dispute_status in ('pending_review', 'clear', 'resolved', 'unresolved')),
  quality_status text not null check (quality_status in ('pending_review', 'verified', 'conflicted', 'insufficient')),
  summary_origin text not null check (summary_origin in ('model_generated', 'human_authored', 'deterministic')),
  generated_summary_hash text check (generated_summary_hash is null or generated_summary_hash ~ '^[0-9a-f]{64}$'),
  provenance_status text not null default 'pending_review' check (provenance_status in ('pending_review', 'approved', 'rejected', 'revoked')),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_candidate_provenance_model_summary check (
    summary_origin <> 'model_generated' or generated_summary_hash is not null
  ),
  constraint learning_candidate_provenance_metadata_bound check (octet_length(safe_metadata::text) <= 8192)
);

create table if not exists public.learning_candidate_reviews (
  review_id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.learning_candidates(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('approved', 'rejected', 'revoked')),
  reason text not null,
  source_hash text check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash text check (evidence_hash is null or evidence_hash ~ '^[0-9a-f]{64}$'),
  summary_origin text check (summary_origin is null or summary_origin in ('model_generated', 'human_authored', 'deterministic')),
  generated_summary_hash text check (generated_summary_hash is null or generated_summary_hash ~ '^[0-9a-f]{64}$'),
  gate_snapshot jsonb not null default '{}'::jsonb,
  release_id text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz not null default now(),
  constraint learning_candidate_reviews_gate_snapshot_bound check (octet_length(gate_snapshot::text) <= 8192),
  constraint learning_candidate_reviews_metadata_bound check (octet_length(safe_metadata::text) <= 8192)
);

create table if not exists public.learning_rule_dependencies (
  dependency_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.learning_rules(id) on delete cascade,
  rule_version integer not null,
  candidate_id uuid not null references public.learning_candidates(id),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  release_id text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (rule_id, rule_version, candidate_id)
);

create table if not exists public.learning_rule_revocations (
  revocation_id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.learning_rules(id) on delete cascade,
  rule_version integer not null,
  revoked_by uuid not null references public.profiles(id),
  reason text not null,
  release_id text not null,
  cascaded_dependency_count integer not null default 0 check (cascaded_dependency_count >= 0),
  safe_metadata jsonb not null default '{}'::jsonb,
  revoked_at timestamptz not null default now(),
  unique (rule_id, rule_version),
  constraint learning_rule_revocations_metadata_bound check (octet_length(safe_metadata::text) <= 8192)
);

create index if not exists learning_candidate_reviews_candidate_idx
  on public.learning_candidate_reviews(candidate_id, reviewed_at desc);
create index if not exists learning_rule_dependencies_candidate_idx
  on public.learning_rule_dependencies(candidate_id, status);
create index if not exists learning_rule_dependencies_rule_idx
  on public.learning_rule_dependencies(rule_id, rule_version, status);

alter table public.learning_candidate_provenance enable row level security;
alter table public.learning_candidate_reviews enable row level security;
alter table public.learning_rule_dependencies enable row level security;
alter table public.learning_rule_revocations enable row level security;

create policy learning_candidate_provenance_admin_read
  on public.learning_candidate_provenance for select to authenticated using (private.is_admin());
create policy learning_candidate_reviews_admin_read
  on public.learning_candidate_reviews for select to authenticated using (private.is_admin());
create policy learning_rule_dependencies_admin_read
  on public.learning_rule_dependencies for select to authenticated using (private.is_admin());
create policy learning_rule_revocations_admin_read
  on public.learning_rule_revocations for select to authenticated using (private.is_admin());

grant select on public.learning_candidate_provenance to authenticated;
grant select on public.learning_candidate_reviews to authenticated;
grant select on public.learning_rule_dependencies to authenticated;
grant select on public.learning_rule_revocations to authenticated;

drop trigger if exists learning_candidate_reviews_append_only on public.learning_candidate_reviews;
create trigger learning_candidate_reviews_append_only
before update or delete on public.learning_candidate_reviews
for each row execute function public.reject_harness_append_only_mutation();

drop trigger if exists learning_rule_revocations_append_only on public.learning_rule_revocations;
create trigger learning_rule_revocations_append_only
before update or delete on public.learning_rule_revocations
for each row execute function public.reject_harness_append_only_mutation();

create or replace function public.queue_learning_candidate_manual_review(
  p_candidate_id uuid,
  p_source_hash text,
  p_consent_hash text,
  p_input_hash text,
  p_evidence_hash text,
  p_release_id text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns table (ok boolean, error_code text, candidate_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.learning_candidates%rowtype;
  v_receipt_count integer := 0;
  v_source_type text;
  v_consent_status text;
  v_privacy_status text;
  v_dispute_status text;
  v_quality_status text;
  v_summary_origin text;
  v_generated_summary_hash text;
begin
  if p_candidate_id is null
     or p_source_hash !~ '^[0-9a-f]{64}$'
     or p_consent_hash !~ '^[0-9a-f]{64}$'
     or p_input_hash !~ '^[0-9a-f]{64}$'
     or p_evidence_hash !~ '^[0-9a-f]{64}$'
     or nullif(trim(coalesce(p_release_id, '')), '') is null
     or jsonb_typeof(coalesce(p_safe_metadata, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_safe_metadata, '{}'::jsonb)::text) > 8192 then
    return query select false, 'INVALID_PROVENANCE'::text, p_candidate_id, null::text;
    return;
  end if;

  select candidate.* into v_candidate
  from public.learning_candidates candidate
  where candidate.id = p_candidate_id
  for update;
  if not found then
    return query select false, 'CANDIDATE_NOT_FOUND'::text, p_candidate_id, null::text;
    return;
  end if;
  if v_candidate.status not in (
    'created'::public.learning_candidate_status,
    'pending_evidence'::public.learning_candidate_status,
    'evidence_gate_passed'::public.learning_candidate_status,
    'manual_review'::public.learning_candidate_status
  ) then
    return query select false, 'CANDIDATE_NOT_REVIEWABLE'::text, p_candidate_id, v_candidate.status::text;
    return;
  end if;

  select count(*)::integer into v_receipt_count
  from public.learning_observation_receipts receipt
  where receipt.candidate_id = p_candidate_id;

  v_source_type := case
    when v_candidate.candidate_type in ('price_prior_update', 'analysis_rule') and v_receipt_count > 0
      then 'runtime_observation'
    else 'batch_evidence'
  end;
  v_consent_status := case
    when v_source_type = 'runtime_observation'
      and p_safe_metadata->>'consent_basis' = 'aggregate_only' then 'aggregate_only'
    else 'admin_review_required'
  end;
  v_privacy_status := case
    when v_source_type = 'runtime_observation'
      and p_safe_metadata->>'pii_redacted' = 'true'
      and coalesce(p_safe_metadata->>'raw_text_persisted', 'false') = 'false' then 'redacted'
    else 'pending_review'
  end;
  v_dispute_status := case
    when v_receipt_count = 0 then 'pending_review'
    when exists (
      select 1
      from public.learning_observation_receipts receipt
      join public.disputes dispute on dispute.job_id = receipt.job_id
      where receipt.candidate_id = p_candidate_id
        and dispute.status not in ('communicated', 'resolved')
    ) then 'unresolved'
    else 'clear'
  end;
  v_quality_status := case
    when v_candidate.evidence_count >= 5
      and v_candidate.confidence >= 0.6
      and (v_source_type <> 'runtime_observation' or v_receipt_count >= 5) then 'verified'
    else 'insufficient'
  end;
  v_summary_origin := case
    when p_safe_metadata->>'summary_origin' in ('model_generated', 'human_authored', 'deterministic')
      then p_safe_metadata->>'summary_origin'
    else 'model_generated'
  end;
  v_generated_summary_hash := case when v_summary_origin = 'model_generated' then p_input_hash else null end;

  insert into public.learning_candidate_provenance (
    candidate_id, source_type, source_hash, consent_hash, input_hash, evidence_hash,
    release_id, consent_status, privacy_status, dispute_status, quality_status,
    summary_origin, generated_summary_hash, safe_metadata
  ) values (
    p_candidate_id, v_source_type, p_source_hash, p_consent_hash, p_input_hash, p_evidence_hash,
    left(p_release_id, 160), v_consent_status, v_privacy_status, v_dispute_status, v_quality_status,
    v_summary_origin, v_generated_summary_hash, coalesce(p_safe_metadata, '{}'::jsonb)
  ) on conflict on constraint learning_candidate_provenance_pkey do update
    set dispute_status = case
          when excluded.dispute_status = 'unresolved' then 'unresolved'
          when public.learning_candidate_provenance.dispute_status = 'pending_review' then excluded.dispute_status
          else public.learning_candidate_provenance.dispute_status
        end,
        quality_status = case
          when excluded.quality_status = 'insufficient' then 'insufficient'
          when public.learning_candidate_provenance.quality_status = 'pending_review' then excluded.quality_status
          else public.learning_candidate_provenance.quality_status
        end,
        consent_status = case
          when public.learning_candidate_provenance.consent_status = 'admin_review_required' then excluded.consent_status
          else public.learning_candidate_provenance.consent_status
        end,
        privacy_status = case
          when public.learning_candidate_provenance.privacy_status = 'pending_review' then excluded.privacy_status
          else public.learning_candidate_provenance.privacy_status
        end,
        safe_metadata = public.learning_candidate_provenance.safe_metadata || excluded.safe_metadata,
        updated_at = now()
    where public.learning_candidate_provenance.source_hash = excluded.source_hash
      and public.learning_candidate_provenance.consent_hash = excluded.consent_hash
      and public.learning_candidate_provenance.input_hash = excluded.input_hash
      and public.learning_candidate_provenance.evidence_hash = excluded.evidence_hash
      and public.learning_candidate_provenance.source_type = excluded.source_type;

  if not found then
    return query select false, 'PROVENANCE_CONFLICT'::text, p_candidate_id, v_candidate.status::text;
    return;
  end if;

  update public.learning_candidates as candidate
  set status = 'manual_review'::public.learning_candidate_status,
      audit_reason = 'gate_passed; explicit administrator review required'
  where candidate.id = p_candidate_id
    and candidate.status in (
      'created'::public.learning_candidate_status,
      'pending_evidence'::public.learning_candidate_status,
      'evidence_gate_passed'::public.learning_candidate_status,
      'manual_review'::public.learning_candidate_status
    );

  if not found then
    return query select false, 'CANDIDATE_NOT_REVIEWABLE'::text, p_candidate_id, v_candidate.status::text;
    return;
  end if;

  insert into public.kael_rule_lifecycle_log (
    candidate_id, skill_id, previous_state, next_state,
    transition_reason, actor_role, safe_metadata
  ) values (
    p_candidate_id,
    case when v_candidate.candidate_type = 'price_prior_update' then 'LS1' else 'LS2' end,
    case v_candidate.status::text
      when 'created' then 'candidate'
      when 'evidence_gate_passed' then 'evidence_gate_check'
      else v_candidate.status::text
    end,
    'manual_review',
    'harness_manual_review_required',
    'system',
    jsonb_build_object(
      'release_id', left(p_release_id, 160),
      'automatic_promotion', false,
      'source_type', v_source_type,
      'privacy_status', v_privacy_status,
      'dispute_status', v_dispute_status,
      'quality_status', v_quality_status
    )
  );

  return query select true, null::text, p_candidate_id, 'manual_review'::text;
end;
$$;

create or replace function public.auto_promote_learning_candidate_atomic(
  p_candidate_id uuid
) returns table (
  ok boolean,
  error_code text,
  candidate_id uuid,
  rule_id uuid,
  rule_version integer,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.learning_candidates as candidate
  set status = 'manual_review'::public.learning_candidate_status,
      audit_reason = 'automatic promotion disabled by Harness assurance policy'
  where candidate.id = p_candidate_id
    and candidate.status in (
      'created'::public.learning_candidate_status,
      'pending_evidence'::public.learning_candidate_status,
      'evidence_gate_passed'::public.learning_candidate_status
    );
  return query select false, 'MANUAL_REVIEW_REQUIRED'::text, p_candidate_id,
    null::uuid, null::integer,
    coalesce((select candidate.status::text from public.learning_candidates candidate where candidate.id = p_candidate_id), 'not_found');
end;
$$;

create or replace function public.capture_learning_review_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provenance public.learning_candidate_provenance%rowtype;
  v_decision text;
begin
  if new.transition_reason not in ('admin_approve_learning_candidate', 'admin_reject_learning_candidate')
     or new.actor_id is null or new.candidate_id is null then
    return new;
  end if;
  select * into v_provenance from public.learning_candidate_provenance
  where candidate_id = new.candidate_id;
  v_decision := case when new.transition_reason = 'admin_approve_learning_candidate' then 'approved' else 'rejected' end;
  if not exists (
    select 1 from public.learning_candidate_reviews review
    where review.candidate_id = new.candidate_id and review.decision = v_decision
  ) then
    insert into public.learning_candidate_reviews (
      candidate_id, reviewer_id, decision, reason,
      source_hash, evidence_hash, summary_origin, generated_summary_hash,
      gate_snapshot, release_id, safe_metadata
    ) values (
      new.candidate_id, new.actor_id, v_decision, new.transition_reason,
      v_provenance.source_hash, v_provenance.evidence_hash,
      v_provenance.summary_origin, v_provenance.generated_summary_hash,
      jsonb_strip_nulls(jsonb_build_object(
        'consent_status', v_provenance.consent_status,
        'privacy_status', v_provenance.privacy_status,
        'dispute_status', v_provenance.dispute_status,
        'quality_status', v_provenance.quality_status
      )),
      coalesce(v_provenance.release_id, new.safe_metadata->>'release_id', 'unreleased'),
      jsonb_build_object('lifecycle_id', new.id)
    );
  end if;
  update public.learning_candidate_provenance
  set provenance_status = case when v_decision = 'approved' then 'approved' else 'rejected' end,
      updated_at = now()
  where candidate_id = new.candidate_id;
  return new;
end;
$$;

drop trigger if exists capture_learning_review_provenance on public.kael_rule_lifecycle_log;
create trigger capture_learning_review_provenance
after insert on public.kael_rule_lifecycle_log
for each row execute function public.capture_learning_review_provenance();

create or replace function public.capture_learning_rule_dependency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate_id uuid;
  v_provenance public.learning_candidate_provenance%rowtype;
begin
  if new.change_reason ~ '^(admin_approve_learning_candidate|auto_promote_learning_candidate_atomic):[0-9a-f-]{36}$' then
    v_candidate_id := split_part(new.change_reason, ':', 2)::uuid;
  else
    return new;
  end if;
  select * into v_provenance from public.learning_candidate_provenance where candidate_id = v_candidate_id;
  if not found
     or v_provenance.provenance_status <> 'approved'
     or v_provenance.consent_status not in ('aggregate_only', 'consented')
     or v_provenance.privacy_status <> 'redacted'
     or v_provenance.dispute_status not in ('clear', 'resolved')
     or v_provenance.quality_status <> 'verified' then
    raise exception using errcode = 'P0001', message = 'LEARNING_PROVENANCE_NOT_APPROVED';
  end if;
  insert into public.learning_rule_dependencies (
    rule_id, rule_version, candidate_id, source_hash, evidence_hash, release_id
  ) values (
    new.rule_id, new.version, v_candidate_id,
    v_provenance.source_hash, v_provenance.evidence_hash, v_provenance.release_id
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists capture_learning_rule_dependency on public.learning_rule_versions;
create trigger capture_learning_rule_dependency
after insert on public.learning_rule_versions
for each row execute function public.capture_learning_rule_dependency();

create or replace function public.prevent_revoked_learning_rule_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'::public.learning_rule_status and exists (
    select 1 from public.learning_rule_dependencies dependency
    where dependency.rule_id = new.id
      and dependency.rule_version = new.active_version
      and dependency.status = 'revoked'
  ) then
    raise exception using errcode = 'P0001', message = 'LEARNING_DEPENDENCY_REVOKED';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_revoked_learning_rule_activation on public.learning_rules;
create trigger prevent_revoked_learning_rule_activation
before insert or update of status, active_version on public.learning_rules
for each row execute function public.prevent_revoked_learning_rule_activation();

create or replace function public.admin_review_and_approve_learning_candidate_atomic(
  p_candidate_id uuid,
  p_admin_id uuid,
  p_review_note text default null
) returns table (
  ok boolean,
  error_code text,
  candidate_id uuid,
  rule_id uuid,
  rule_version integer,
  status text,
  knowledge_ok boolean,
  knowledge_error_code text,
  knowledge_table text,
  record_key text,
  knowledge_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provenance public.learning_candidate_provenance%rowtype;
  v_candidate public.learning_candidates%rowtype;
  v_approval record;
begin
  if p_candidate_id is null or p_admin_id is null then
    return query select false, 'INVALID_INPUT'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_admin_id and profile.role = 'admin'::public.user_role
  ) then
    return query select false, 'ADMIN_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;

  select * into v_provenance
  from public.learning_candidate_provenance provenance
  where provenance.candidate_id = p_candidate_id
  for update;
  if not found then
    return query select false, 'PROVENANCE_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.provenance_status in ('rejected', 'revoked') then
    return query select false, 'PROVENANCE_NOT_ACTIVE'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.consent_status not in ('aggregate_only', 'consented') then
    return query select false, 'CONSENT_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.privacy_status <> 'redacted' then
    return query select false, 'PRIVACY_REVIEW_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.dispute_status not in ('clear', 'resolved') then
    return query select false, 'UNRESOLVED_DISPUTE'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.quality_status <> 'verified' then
    return query select false, 'EVIDENCE_QUALITY_INSUFFICIENT'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  select candidate.* into v_candidate
  from public.learning_candidates candidate
  where candidate.id = p_candidate_id
  for update;
  if not found or v_candidate.evidence_count < 5 or v_candidate.confidence < 0.6 then
    return query select false, 'EVIDENCE_QUALITY_INSUFFICIENT'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if exists (
    select 1
    from public.learning_observation_receipts receipt
    join public.disputes dispute on dispute.job_id = receipt.job_id
    where receipt.candidate_id = p_candidate_id
      and dispute.status not in ('communicated', 'resolved')
  ) then
    return query select false, 'UNRESOLVED_DISPUTE'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;
  if v_provenance.summary_origin = 'model_generated' and v_provenance.generated_summary_hash is null then
    return query select false, 'MODEL_SUMMARY_IDENTITY_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;

  begin
    insert into public.learning_candidate_reviews (
      candidate_id, reviewer_id, decision, reason,
      source_hash, evidence_hash, summary_origin, generated_summary_hash,
      gate_snapshot, release_id, safe_metadata
    ) values (
      p_candidate_id, p_admin_id, 'approved',
      left(coalesce(nullif(trim(p_review_note), ''), 'administrator approved verified provenance'), 1000),
      v_provenance.source_hash, v_provenance.evidence_hash,
      v_provenance.summary_origin, v_provenance.generated_summary_hash,
      jsonb_build_object(
        'consent_status', v_provenance.consent_status,
        'privacy_status', v_provenance.privacy_status,
        'dispute_status', v_provenance.dispute_status,
        'quality_status', v_provenance.quality_status,
        'human_approval', true
      ),
      v_provenance.release_id,
      jsonb_build_object('automatic_promotion', false)
    );
    update public.learning_candidate_provenance
    set provenance_status = 'approved', updated_at = now()
    where candidate_id = p_candidate_id;

    select approval.* into v_approval
    from public.admin_approve_learning_candidate_atomic(
      p_candidate_id, p_admin_id, p_review_note
    ) approval;
    if not found then
      raise exception using errcode = 'P0001', message = 'APPROVAL_COMMIT_FAILED';
    end if;
    if v_approval.ok is not true then
      raise exception using errcode = 'P0001', message = coalesce(v_approval.error_code::text, 'APPROVAL_COMMIT_FAILED');
    end if;
  exception when others then
    return query select false, left(sqlerrm, 120), p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end;

  return query select
    v_approval.ok::boolean,
    v_approval.error_code::text,
    v_approval.candidate_id::uuid,
    v_approval.rule_id::uuid,
    v_approval.rule_version::integer,
    v_approval.status::text,
    v_approval.knowledge_ok::boolean,
    v_approval.knowledge_error_code::text,
    v_approval.knowledge_table::text,
    v_approval.record_key::text,
    v_approval.knowledge_version::integer;
end;
$$;

create or replace function public.revoke_learning_rule_with_provenance(
  p_rule_id uuid,
  p_rule_version integer,
  p_admin_id uuid,
  p_reason text,
  p_release_id text
)
returns table (ok boolean, error_code text, rule_id uuid, rule_version integer, cascaded_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_rule_id is null or p_rule_version is null or p_admin_id is null
     or nullif(trim(coalesce(p_reason, '')), '') is null then
    return query select false, 'INVALID_INPUT'::text, p_rule_id, p_rule_version, 0;
    return;
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_admin_id and profile.role = 'admin'::public.user_role
  ) then
    return query select false, 'ADMIN_REQUIRED'::text, p_rule_id, p_rule_version, 0;
    return;
  end if;
  if not exists (
    select 1 from public.learning_rule_versions version
    where version.rule_id = p_rule_id and version.version = p_rule_version
  ) then
    return query select false, 'RULE_VERSION_NOT_FOUND'::text, p_rule_id, p_rule_version, 0;
    return;
  end if;

  update public.learning_rule_dependencies
  set status = 'revoked', revoked_at = now()
  where rule_id = p_rule_id and rule_version = p_rule_version and status = 'active';
  get diagnostics v_count = row_count;

  update public.learning_rule_versions
  set status = 'rolled_back'::public.learning_rule_status
  where rule_id = p_rule_id and version = p_rule_version;
  update public.learning_rules
  set status = case when active_version = p_rule_version
    then 'rolled_back'::public.learning_rule_status else status end
  where id = p_rule_id;

  insert into public.learning_rule_revocations (
    rule_id, rule_version, revoked_by, reason, release_id, cascaded_dependency_count
  ) values (
    p_rule_id, p_rule_version, p_admin_id, left(trim(p_reason), 500),
    left(coalesce(p_release_id, 'unreleased'), 160), v_count
  ) on conflict (rule_id, rule_version) do nothing;

  update public.learning_candidate_provenance provenance
  set provenance_status = 'revoked', consent_status = 'revoked', updated_at = now()
  where provenance.candidate_id in (
    select dependency.candidate_id from public.learning_rule_dependencies dependency
    where dependency.rule_id = p_rule_id and dependency.rule_version = p_rule_version
  );

  update public.service_knowledge_boxes box
  set is_active = false, updated_at = now()
  where box.safe_metadata->>'source_candidate_id' in (
    select dependency.candidate_id::text from public.learning_rule_dependencies dependency
    where dependency.rule_id = p_rule_id and dependency.rule_version = p_rule_version
  );
  update public.worker_safety_patterns pattern
  set is_enabled = false, updated_at = now()
  where pattern.safe_metadata->>'source_candidate_id' in (
    select dependency.candidate_id::text from public.learning_rule_dependencies dependency
    where dependency.rule_id = p_rule_id and dependency.rule_version = p_rule_version
  );

  return query select true, null::text, p_rule_id, p_rule_version, v_count;
end;
$$;

revoke all on function public.capture_learning_review_provenance() from public, anon, authenticated;
revoke all on function public.capture_learning_rule_dependency() from public, anon, authenticated;
revoke all on function public.prevent_revoked_learning_rule_activation() from public, anon, authenticated;
grant execute on function public.capture_learning_review_provenance() to service_role;
grant execute on function public.capture_learning_rule_dependency() to service_role;
grant execute on function public.prevent_revoked_learning_rule_activation() to service_role;

revoke all on function public.queue_learning_candidate_manual_review(uuid,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.auto_promote_learning_candidate_atomic(uuid) from public, anon, authenticated;
revoke all on function public.admin_approve_learning_candidate_atomic(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.admin_review_and_approve_learning_candidate_atomic(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.revoke_learning_rule_with_provenance(uuid,integer,uuid,text,text) from public, anon, authenticated;
grant execute on function public.queue_learning_candidate_manual_review(uuid,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.auto_promote_learning_candidate_atomic(uuid) to service_role;
grant execute on function public.admin_review_and_approve_learning_candidate_atomic(uuid,uuid,text) to service_role;
grant execute on function public.revoke_learning_rule_with_provenance(uuid,integer,uuid,text,text) to service_role;

comment on function public.admin_review_and_approve_learning_candidate_atomic(uuid,uuid,text) is
  'Approves one learning candidate only after immutable source, privacy, dispute, quality, consent, and human-review gates pass.';

commit;
