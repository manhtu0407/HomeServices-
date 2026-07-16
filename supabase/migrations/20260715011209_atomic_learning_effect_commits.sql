begin;

create table private.kael_learning_effect_receipts (
  queue_id uuid primary key
    references public.kael_learning_queue(id) on delete cascade,
  batch_id uuid not null
    references public.kael_ai_batches(id) on delete cascade,
  item_id uuid not null unique
    references public.kael_ai_batch_items(id) on delete cascade,
  source_mode text not null
    check (source_mode in ('anthropic_batch', 'deepseek_direct')),
  owner_token uuid not null,
  effect_payload jsonb not null
    check (jsonb_typeof(effect_payload) = 'object'),
  requested_item_status text not null
    check (requested_item_status in ('succeeded', 'errored')),
  response_payload jsonb not null
    check (jsonb_typeof(response_payload) = 'object'),
  error_payload jsonb not null
    check (jsonb_typeof(error_payload) = 'object'),
  requested_queue_state text not null
    check (requested_queue_state in ('processed', 'manual_review', 'rejected', 'failed')),
  committed_queue_state text not null
    check (committed_queue_state in ('processed', 'manual_review', 'rejected', 'failed')),
  queue_error_code text,
  candidate_id uuid references public.learning_candidates(id),
  rule_id uuid references public.learning_rules(id),
  rule_version integer check (rule_version is null or rule_version > 0),
  processed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index kael_learning_effect_receipts_batch_idx
  on private.kael_learning_effect_receipts (batch_id, item_id);

revoke all on table private.kael_learning_effect_receipts from public;
revoke all on table private.kael_learning_effect_receipts from anon;
revoke all on table private.kael_learning_effect_receipts from authenticated;
revoke all on table private.kael_learning_effect_receipts from service_role;

alter function public.promote_learning_candidate(
  text, text, text, text[], jsonb, jsonb, public.service_type, text, text,
  numeric, integer, uuid, text, uuid, text
) set search_path = '';

create or replace function public.commit_kael_learning_effect_atomic(
  p_source_mode text,
  p_batch_id uuid,
  p_item_id uuid,
  p_queue_id uuid,
  p_owner_token uuid,
  p_item_status text,
  p_response_payload jsonb,
  p_error_payload jsonb,
  p_queue_state text,
  p_queue_error_code text,
  p_processed_at timestamptz,
  p_effect_payload jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_affected_service public.service_type;
  v_base_metadata jsonb;
  v_candidate jsonb;
  v_candidate_id uuid;
  v_candidate_status public.learning_candidate_status;
  v_committed_queue_state text;
  v_deleted_count integer;
  v_effects text[];
  v_evidence jsonb;
  v_evidence_count integer;
  v_gate_reason text;
  v_gate_state text;
  v_item public.kael_ai_batch_items%rowtype;
  v_lifecycle jsonb;
  v_lifecycle_count integer;
  v_lifecycle_state text;
  v_expected_lifecycle_count integer;
  v_mode text;
  v_promotion_error text;
  v_promotion_ok boolean := false;
  v_queue public.kael_learning_queue%rowtype;
  v_receipt private.kael_learning_effect_receipts%rowtype;
  v_rule_id uuid;
  v_rule_version integer;
  v_scope_rejected boolean;
begin
  if p_source_mode is null
     or p_source_mode not in ('anthropic_batch', 'deepseek_direct')
     or p_batch_id is null
     or p_item_id is null
     or p_queue_id is null
     or p_owner_token is null
     or p_item_status is null
     or p_item_status not in ('succeeded', 'errored')
     or p_response_payload is null
     or jsonb_typeof(p_response_payload) is distinct from 'object'
     or p_error_payload is null
     or jsonb_typeof(p_error_payload) is distinct from 'object'
     or p_queue_state is null
     or p_queue_state not in ('processed', 'manual_review', 'rejected', 'failed')
     or char_length(coalesce(p_queue_error_code, '')) > 100
     or p_processed_at is null
     or p_effect_payload is null
     or jsonb_typeof(p_effect_payload) is distinct from 'object'
     or p_effect_payload->>'schema' is distinct from 'kael_learning_effect.v1'
     or p_effect_payload->>'mode' is null
     or p_effect_payload->>'mode' not in ('none', 'candidate', 'promotion') then
    raise exception using
      errcode = '22023',
      message = 'INVALID_LEARNING_EFFECT_COMMIT';
  end if;

  v_mode := p_effect_payload->>'mode';
  if v_mode = 'none' then
    if p_effect_payload->'candidate' is distinct from 'null'::jsonb
       or p_effect_payload->'lifecycle' is distinct from 'null'::jsonb then
      raise exception using
        errcode = '22023',
        message = 'INVALID_LEARNING_EFFECT_COMMIT';
    end if;
  else
    v_candidate := p_effect_payload->'candidate';
    v_lifecycle := p_effect_payload->'lifecycle';
    if jsonb_typeof(v_candidate) is distinct from 'object'
       or jsonb_typeof(v_lifecycle) is distinct from 'object'
       or nullif(trim(v_candidate->>'skill_id'), '') is null
       or nullif(trim(v_candidate->>'candidate_type'), '') is null
       or nullif(trim(v_candidate->>'target'), '') is null
       or jsonb_typeof(v_candidate->'effects') is distinct from 'array'
       or exists (
         select 1
         from pg_catalog.jsonb_array_elements(v_candidate->'effects') as effect(value)
         where pg_catalog.jsonb_typeof(effect.value) is distinct from 'string'
       )
       or jsonb_typeof(v_candidate->'suggested_payload') is distinct from 'object'
       or nullif(trim(v_candidate->>'status'), '') is null
       or nullif(trim(v_candidate->>'audit_reason'), '') is null
       or nullif(trim(v_candidate->>'prompt_version'), '') is null
       or nullif(trim(v_candidate->>'confidence'), '') is null
       or nullif(trim(v_candidate->>'evidence_count'), '') is null
       or nullif(trim(v_candidate->>'requires_manual_review'), '') is null
       or jsonb_typeof(v_lifecycle->'evidence') is distinct from 'object'
       or nullif(trim(v_lifecycle->>'gate_state'), '') is null
       or nullif(trim(v_lifecycle->>'lifecycle_state'), '') is null
       or nullif(trim(v_lifecycle->>'gate_reason'), '') is null
       or v_lifecycle->>'evidence_source' is null
       or v_lifecycle->>'evidence_source' not in (
         'completed_reviewed_jobs', 'candidate_payload'
       ) then
      raise exception using
        errcode = '22023',
        message = 'INVALID_LEARNING_EFFECT_PAYLOAD';
    end if;

    v_gate_state := v_lifecycle->>'gate_state';
    v_lifecycle_state := v_lifecycle->>'lifecycle_state';
    v_gate_reason := v_lifecycle->>'gate_reason';
    v_evidence := v_lifecycle->'evidence';
    v_scope_rejected := coalesce((v_lifecycle->>'scope_rejected')::boolean, false);
    v_candidate_status := (v_candidate->>'status')::public.learning_candidate_status;
    v_evidence_count := (v_candidate->>'evidence_count')::integer;
    if v_evidence_count < 0
       or (v_candidate->>'confidence')::numeric < 0
       or (v_candidate->>'confidence')::numeric > 1
       or v_gate_state not in (
         'pending_evidence', 'auto_promoted', 'manual_review', 'rejected'
       )
       or v_lifecycle_state not in (
         'pending_evidence', 'active', 'manual_review', 'rejected'
       ) then
      raise exception using
        errcode = '22023',
        message = 'INVALID_LEARNING_EFFECT_PAYLOAD';
    end if;

    if v_mode = 'promotion' and (
      jsonb_typeof(v_candidate->'rule_payload') is distinct from 'object'
      or v_candidate_status <> 'evidence_gate_passed'::public.learning_candidate_status
      or v_gate_state <> 'auto_promoted'
      or v_lifecycle_state <> 'active'
      or p_item_status <> 'succeeded'
      or p_queue_state <> 'processed'
    ) then
      raise exception using
        errcode = '22023',
        message = 'INVALID_LEARNING_PROMOTION_EFFECT';
    end if;
    if v_mode = 'candidate' and (
      v_candidate->'rule_payload' is distinct from 'null'::jsonb
      or v_lifecycle_state not in ('pending_evidence', 'manual_review', 'rejected')
      or (v_lifecycle_state = 'manual_review' and p_queue_state <> 'manual_review')
      or (v_lifecycle_state = 'rejected' and p_queue_state <> 'rejected')
      or (
        v_lifecycle_state not in ('manual_review', 'rejected')
        and p_queue_state <> 'processed'
      )
      or (
        v_lifecycle_state = 'pending_evidence'
        and v_gate_state <> 'pending_evidence'
      )
      or (
        v_lifecycle_state = 'manual_review'
        and v_gate_state not in ('manual_review', 'auto_promoted')
      )
      or (
        v_lifecycle_state = 'rejected'
        and v_gate_state <> 'rejected'
      )
      or (
        v_lifecycle_state = 'rejected'
        and v_candidate_status <> 'rejected'::public.learning_candidate_status
      )
      or (
        v_lifecycle_state = 'pending_evidence'
        and v_candidate_status <> 'pending_evidence'::public.learning_candidate_status
      )
      or (
        v_lifecycle_state = 'manual_review'
        and v_candidate_status not in (
          'manual_review'::public.learning_candidate_status,
          'evidence_gate_passed'::public.learning_candidate_status
        )
      )
      or (
        v_lifecycle_state = 'rejected'
        and p_item_status <> 'errored'
      )
      or (
        v_lifecycle_state <> 'rejected'
        and p_item_status <> 'succeeded'
      )
    ) then
      raise exception using
        errcode = '22023',
        message = 'INVALID_LEARNING_CANDIDATE_EFFECT';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kael_learning_effect|' || p_queue_id::text, 0)
  );

  select receipt.*
  into v_receipt
  from private.kael_learning_effect_receipts as receipt
  where receipt.queue_id = p_queue_id
  for update of receipt;

  if found then
    if v_receipt.batch_id is distinct from p_batch_id
       or v_receipt.item_id is distinct from p_item_id
       or v_receipt.source_mode is distinct from p_source_mode
       or v_receipt.owner_token is distinct from p_owner_token
       or v_receipt.effect_payload is distinct from p_effect_payload
       or v_receipt.requested_item_status is distinct from p_item_status
       or v_receipt.response_payload is distinct from p_response_payload
       or v_receipt.error_payload is distinct from p_error_payload
       or v_receipt.requested_queue_state is distinct from p_queue_state
       or v_receipt.queue_error_code is distinct from p_queue_error_code
       or v_receipt.processed_at is distinct from p_processed_at then
      raise exception using
        errcode = 'P0001',
        message = 'LEARNING_EFFECT_REPLAY_CONFLICT';
    end if;

    select item.*
    into v_item
    from public.kael_ai_batch_items as item
    where item.id = p_item_id
      and item.batch_id = p_batch_id
      and item.queue_id = p_queue_id
    for update of item;
    select queue.*
    into v_queue
    from public.kael_learning_queue as queue
    where queue.id = p_queue_id
      and queue.batch_id = p_batch_id
    for update of queue;

    v_expected_lifecycle_count := case
      when v_mode = 'none' then 0
      when v_mode = 'promotion' and v_receipt.rule_id is not null then 4
      when v_mode = 'promotion' then 3
      when p_effect_payload#>>'{lifecycle,gate_state}' = 'pending_evidence' then 1
      else 3
    end;
    select pg_catalog.count(*)::integer
    into v_lifecycle_count
    from public.kael_rule_lifecycle_log as lifecycle
    where lifecycle.candidate_id = v_receipt.candidate_id
      and lifecycle.safe_metadata->>'q4_queue_id' = p_queue_id::text;

    if v_item.id is null
       or v_queue.id is null
       or v_item.status is distinct from v_receipt.requested_item_status
       or v_item.response_payload is distinct from v_receipt.response_payload
       or v_item.error_payload is distinct from v_receipt.error_payload
       or v_item.processed_at is distinct from v_receipt.processed_at
       or v_queue.queue_state is distinct from v_receipt.committed_queue_state
       or v_queue.error_code is distinct from v_receipt.queue_error_code
       or v_queue.processed_at is distinct from v_receipt.processed_at
       or v_queue.claim_id is not null
       or v_queue.claimed_at is not null
       or v_queue.finalized_claim_id is distinct from v_receipt.owner_token
       or v_lifecycle_count <> v_expected_lifecycle_count
       or (v_mode = 'none' and (
         v_receipt.candidate_id is not null
         or v_receipt.rule_id is not null
         or v_receipt.rule_version is not null
       ))
       or (v_mode <> 'none' and v_receipt.candidate_id is null)
       or (v_receipt.rule_id is null) <> (v_receipt.rule_version is null)
       or (
         v_mode = 'candidate'
         and (
           v_receipt.rule_id is not null
           or not exists (
             select 1
             from public.learning_candidates as candidate
             where candidate.id = v_receipt.candidate_id
               and candidate.status = (
                 p_effect_payload#>>'{candidate,status}'
               )::public.learning_candidate_status
           )
           or exists (
             select 1
             from public.kael_rule_lifecycle_log as lifecycle
             where lifecycle.candidate_id = v_receipt.candidate_id
               and lifecycle.safe_metadata->>'q4_queue_id' = p_queue_id::text
               and lifecycle.rule_id is not null
           )
         )
       )
       or (
         v_mode = 'promotion'
         and v_receipt.rule_id is null
         and (
           v_receipt.committed_queue_state <> 'manual_review'
           or not exists (
             select 1
             from public.learning_candidates as candidate
             where candidate.id = v_receipt.candidate_id
               and candidate.status = 'evidence_gate_passed'::public.learning_candidate_status
           )
         )
       )
       or (
         v_mode = 'promotion'
         and v_receipt.rule_id is not null
         and (
           v_receipt.committed_queue_state <> 'processed'
           or not exists (
             select 1
             from public.learning_candidates as candidate
             where candidate.id = v_receipt.candidate_id
               and candidate.status = 'auto_promoted'::public.learning_candidate_status
           )
           or not exists (
             select 1
             from public.kael_rule_lifecycle_log as lifecycle
             where lifecycle.candidate_id = v_receipt.candidate_id
               and lifecycle.rule_id = v_receipt.rule_id
               and lifecycle.previous_state = 'auto_promoted'
               and lifecycle.next_state = 'active'
               and lifecycle.safe_metadata->>'q4_queue_id' = p_queue_id::text
               and (lifecycle.safe_metadata->>'rule_version')::integer = v_receipt.rule_version
           )
         )
       )
       or (
         v_receipt.rule_id is not null
         and not exists (
           select 1
           from public.learning_rule_versions as version
           where version.rule_id = v_receipt.rule_id
             and version.version = v_receipt.rule_version
         )
       ) then
      raise exception using
        errcode = '23514',
        message = 'LEARNING_EFFECT_REPLAY_CORRUPT';
    end if;
    return;
  end if;

  if p_source_mode = 'anthropic_batch' then
    perform 1
    from public.kael_ai_batches as batch
    where batch.id = p_batch_id
      and batch.status = 'ended'
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'BATCH_NOT_READY';
    end if;

    perform 1
    from private.kael_ai_batch_result_claims as claim
    where claim.batch_id = p_batch_id
      and claim.claim_token = p_owner_token
    for update of claim;
    if not found then
      raise exception using errcode = '40001', message = 'BATCH_CLAIM_LOST';
    end if;

    update private.kael_ai_batch_result_claims as claim
    set claimed_at = pg_catalog.clock_timestamp()
    where claim.batch_id = p_batch_id
      and claim.claim_token = p_owner_token;
  elsif not exists (
    select 1
    from public.kael_ai_batches as batch
    where batch.id = p_batch_id
      and batch.provider = 'deepseek'::public.api_provider
      and batch.status = 'in_progress'
  ) then
    raise exception using errcode = 'P0001', message = 'DIRECT_BATCH_NOT_READY';
  end if;

  select item.*
  into v_item
  from public.kael_ai_batch_items as item
  where item.id = p_item_id
    and item.batch_id = p_batch_id
    and item.queue_id = p_queue_id
  for update of item;
  if not found or v_item.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'LEARNING_EFFECT_ITEM_MISMATCH';
  end if;

  select queue.*
  into v_queue
  from public.kael_learning_queue as queue
  where queue.id = p_queue_id
  for update of queue;
  if not found
     or v_queue.skill_id is distinct from v_item.skill_id
     or (
       p_source_mode = 'anthropic_batch'
       and (
         v_queue.queue_state <> 'batched'
         or v_queue.batch_id is distinct from p_batch_id
         or v_queue.claim_id is not null
         or v_queue.claimed_at is not null
       )
     )
     or (
       p_source_mode = 'deepseek_direct'
       and (
         v_queue.queue_state <> 'processing'
         or v_queue.claim_id is distinct from p_owner_token
         or v_queue.claimed_at is null
         or v_queue.batch_id is not null
       )
     ) then
    raise exception using errcode = '40001', message = 'LEARNING_EFFECT_QUEUE_CLAIM_LOST';
  end if;

  v_committed_queue_state := p_queue_state;
  if v_mode <> 'none' then
    if v_candidate->>'skill_id' is distinct from v_queue.skill_id then
      raise exception using errcode = '22023', message = 'LEARNING_EFFECT_SKILL_MISMATCH';
    end if;

    select coalesce(pg_catalog.array_agg(effect.value), array[]::text[])
    into v_effects
    from pg_catalog.jsonb_array_elements_text(v_candidate->'effects') as effect(value);
    v_affected_service := case
      when nullif(trim(v_candidate->>'affected_service'), '') is null then null
      else (v_candidate->>'affected_service')::public.service_type
    end;
    v_actor_role := case
      when v_queue.actor_role in ('customer', 'worker', 'admin', 'system')
        then v_queue.actor_role
      else 'system'
    end;
    v_base_metadata := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'q4_queue_id', v_queue.id,
      'event_type', v_queue.event_type,
      'target', v_candidate->>'target',
      'candidate_type', v_candidate->>'candidate_type',
      'prompt_version', v_candidate->>'prompt_version',
      'requires_manual_review', (v_candidate->>'requires_manual_review')::boolean,
      'gate_reason', v_gate_reason,
      'evidence_source', v_lifecycle->>'evidence_source',
      'evidence', v_evidence
    ));
  end if;

  if v_mode = 'candidate' then
    insert into public.learning_candidates (
      candidate_type,
      affected_service,
      affected_problem,
      affected_district,
      suggested_payload,
      confidence,
      evidence_count,
      status,
      audit_reason
    ) values (
      v_candidate->>'candidate_type',
      v_affected_service,
      nullif(trim(v_candidate->>'affected_problem'), ''),
      nullif(trim(v_candidate->>'affected_district'), ''),
      v_candidate->'suggested_payload',
      (v_candidate->>'confidence')::numeric,
      v_evidence_count,
      v_candidate_status,
      v_candidate->>'audit_reason' || '; queue=' || p_queue_id::text
    ) returning id into v_candidate_id;

    insert into public.kael_rule_lifecycle_log (
      skill_id,
      job_id,
      rule_id,
      candidate_id,
      previous_state,
      next_state,
      transition_reason,
      actor_id,
      actor_role,
      safe_metadata,
      created_at
    )
    select
      v_queue.skill_id,
      v_queue.job_id,
      null,
      v_candidate_id,
      transition.previous_state,
      transition.next_state,
      transition.transition_reason,
      v_queue.actor_id,
      v_actor_role,
      v_base_metadata || transition.extra_metadata,
      p_processed_at
    from (
      values
        (
          1,
          'candidate'::text,
          'pending_evidence'::text,
          case when v_scope_rejected then 'scope_check_started' else 'candidate_evidence_recorded' end,
          '{}'::jsonb
        ),
        (
          2,
          'pending_evidence'::text,
          'evidence_gate_check'::text,
          case when v_scope_rejected then 'scope_check_completed' else 'evidence_gate_check_started' end,
          '{}'::jsonb
        ),
        (
          3,
          'evidence_gate_check'::text,
          v_lifecycle_state,
          case
            when v_scope_rejected then 'scope_rejected:' || v_gate_reason
            when nullif(v_lifecycle->>'promotion_deferred_reason', '') is not null
              then 'promotion_deferred:' || (v_lifecycle->>'promotion_deferred_reason')
            else 'evidence_gate:' || v_gate_reason
          end,
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'promotion_reason', nullif(v_lifecycle->>'promotion_deferred_reason', '')
          ))
        )
    ) as transition(sequence, previous_state, next_state, transition_reason, extra_metadata)
    where transition.sequence = 1 or v_gate_state <> 'pending_evidence';
  elsif v_mode = 'promotion' then
    begin
      select
        promotion.ok,
        promotion.error_code,
        promotion.candidate_id,
        promotion.rule_id,
        promotion.rule_version
      into
        v_promotion_ok,
        v_promotion_error,
        v_candidate_id,
        v_rule_id,
        v_rule_version
      from public.promote_learning_candidate(
        v_candidate->>'skill_id',
        v_candidate->>'candidate_type',
        v_candidate->>'target',
        v_effects,
        v_candidate->'suggested_payload',
        v_candidate->'rule_payload',
        v_affected_service,
        nullif(trim(v_candidate->>'affected_problem'), ''),
        nullif(trim(v_candidate->>'affected_district'), ''),
        (v_candidate->>'confidence')::numeric,
        v_evidence_count,
        v_queue.actor_id,
        v_actor_role,
        v_queue.job_id,
        v_candidate->>'audit_reason' || '; queue=' || p_queue_id::text
      ) as promotion
      limit 1;
      if not found then
        v_promotion_ok := false;
        v_promotion_error := 'promotion_rpc_missing_result';
      elsif v_promotion_ok
        and (v_candidate_id is null or v_rule_id is null or v_rule_version is null) then
        v_promotion_ok := false;
        v_promotion_error := 'promotion_rpc_missing_result';
      end if;
      if not coalesce(v_promotion_ok, false) then
        raise exception using
          errcode = 'P0001',
          message = coalesce(v_promotion_error, 'promotion_rpc_rejected');
      end if;
    exception
      when others then
        v_promotion_ok := false;
        v_promotion_error := coalesce(
          v_promotion_error,
          'promotion_rpc_failed:' || sqlstate
        );
        v_candidate_id := null;
        v_rule_id := null;
        v_rule_version := null;
    end;

    if v_promotion_ok then
      delete from public.kael_rule_lifecycle_log as lifecycle
      where lifecycle.candidate_id = v_candidate_id
        and lifecycle.rule_id = v_rule_id
        and lifecycle.skill_id = v_queue.skill_id
        and lifecycle.previous_state = 'evidence_gate_check'
        and lifecycle.next_state = 'active'
        and lifecycle.transition_reason = 'promote_learning_candidate';
      get diagnostics v_deleted_count = row_count;
      if v_deleted_count <> 1 then
        raise exception using
          errcode = '23514',
          message = 'PROMOTION_LIFECYCLE_CANONICALIZATION_FAILED';
      end if;

      insert into public.kael_rule_lifecycle_log (
        skill_id,
        job_id,
        rule_id,
        candidate_id,
        previous_state,
        next_state,
        transition_reason,
        actor_id,
        actor_role,
        safe_metadata,
        created_at
      )
      select
        v_queue.skill_id,
        v_queue.job_id,
        v_rule_id,
        v_candidate_id,
        transition.previous_state,
        transition.next_state,
        transition.transition_reason,
        v_queue.actor_id,
        v_actor_role,
        v_base_metadata || case
          when transition.next_state = 'active' then pg_catalog.jsonb_build_object(
            'rule_id', v_rule_id,
            'rule_version', v_rule_version
          )
          else '{}'::jsonb
        end,
        p_processed_at
      from (
        values
          ('candidate'::text, 'pending_evidence'::text, 'candidate_evidence_recorded'::text),
          ('pending_evidence', 'evidence_gate_check', 'evidence_gate_check_started'),
          ('evidence_gate_check', 'auto_promoted', 'evidence_gate:' || v_gate_reason),
          ('auto_promoted', 'active', 'active_rule_written')
      ) as transition(previous_state, next_state, transition_reason);
      v_committed_queue_state := 'processed';
    else
      v_promotion_error := pg_catalog.left(
        coalesce(v_promotion_error, 'promotion_rpc_rejected'),
        120
      );
      insert into public.learning_candidates (
        candidate_type,
        affected_service,
        affected_problem,
        affected_district,
        suggested_payload,
        confidence,
        evidence_count,
        status,
        audit_reason
      ) values (
        v_candidate->>'candidate_type',
        v_affected_service,
        nullif(trim(v_candidate->>'affected_problem'), ''),
        nullif(trim(v_candidate->>'affected_district'), ''),
        v_candidate->'suggested_payload',
        (v_candidate->>'confidence')::numeric,
        v_evidence_count,
        'evidence_gate_passed'::public.learning_candidate_status,
        'promotion_deferred:' || v_promotion_error || '; queue=' || p_queue_id::text
      ) returning id into v_candidate_id;

      v_base_metadata := v_base_metadata || pg_catalog.jsonb_build_object(
        'promotion_reason', v_promotion_error
      );
      insert into public.kael_rule_lifecycle_log (
        skill_id,
        job_id,
        rule_id,
        candidate_id,
        previous_state,
        next_state,
        transition_reason,
        actor_id,
        actor_role,
        safe_metadata,
        created_at
      ) values
        (
          v_queue.skill_id, v_queue.job_id, null, v_candidate_id,
          'candidate', 'pending_evidence', 'candidate_evidence_recorded',
          v_queue.actor_id, v_actor_role, v_base_metadata, p_processed_at
        ),
        (
          v_queue.skill_id, v_queue.job_id, null, v_candidate_id,
          'pending_evidence', 'evidence_gate_check', 'evidence_gate_check_started',
          v_queue.actor_id, v_actor_role, v_base_metadata, p_processed_at
        ),
        (
          v_queue.skill_id, v_queue.job_id, null, v_candidate_id,
          'evidence_gate_check', 'manual_review',
          'promotion_deferred:' || v_promotion_error,
          v_queue.actor_id, v_actor_role, v_base_metadata, p_processed_at
        );
      v_committed_queue_state := 'manual_review';
    end if;
  end if;

  update public.kael_ai_batch_items as item
  set status = p_item_status,
      response_payload = p_response_payload,
      error_payload = p_error_payload,
      processed_at = p_processed_at
  where item.id = p_item_id
    and item.batch_id = p_batch_id
    and item.queue_id = p_queue_id
    and item.status = 'pending';
  if not found then
    raise exception using errcode = '40001', message = 'LEARNING_EFFECT_ITEM_STALE';
  end if;

  update public.kael_learning_queue as queue
  set queue_state = v_committed_queue_state,
      batch_id = p_batch_id,
      claim_id = null,
      claimed_at = null,
      finalized_claim_id = p_owner_token,
      error_code = p_queue_error_code,
      processed_at = p_processed_at,
      updated_at = p_processed_at
  where queue.id = p_queue_id
    and (
      (
        p_source_mode = 'anthropic_batch'
        and queue.queue_state = 'batched'
        and queue.batch_id = p_batch_id
        and queue.claim_id is null
      )
      or (
        p_source_mode = 'deepseek_direct'
        and queue.queue_state = 'processing'
        and queue.claim_id = p_owner_token
      )
    );
  if not found then
    raise exception using errcode = '40001', message = 'LEARNING_EFFECT_QUEUE_STALE';
  end if;

  insert into private.kael_learning_effect_receipts (
    queue_id,
    batch_id,
    item_id,
    source_mode,
    owner_token,
    effect_payload,
    requested_item_status,
    response_payload,
    error_payload,
    requested_queue_state,
    committed_queue_state,
    queue_error_code,
    candidate_id,
    rule_id,
    rule_version,
    processed_at
  ) values (
    p_queue_id,
    p_batch_id,
    p_item_id,
    p_source_mode,
    p_owner_token,
    p_effect_payload,
    p_item_status,
    p_response_payload,
    p_error_payload,
    p_queue_state,
    v_committed_queue_state,
    p_queue_error_code,
    v_candidate_id,
    v_rule_id,
    v_rule_version,
    p_processed_at
  );
end;
$function$;

revoke execute on function public.commit_kael_learning_effect_atomic(
  text, uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.commit_kael_learning_effect_atomic(
  text, uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, timestamptz, jsonb
) to service_role;

comment on table private.kael_learning_effect_receipts is
  'Exact replay receipts for atomic Kael candidate, rule, lifecycle, item, and queue commits.';
comment on function public.commit_kael_learning_effect_atomic(
  text, uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, timestamptz, jsonb
) is
  'Commits one owned learning result and all durable effects atomically with exact replay validation.';

commit;
