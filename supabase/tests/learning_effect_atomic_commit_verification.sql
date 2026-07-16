begin;

do $test$
declare
  v_batch_claim uuid := 'e7100000-0000-4000-8000-000000000001';
  v_batch_crash uuid := 'e7100000-0000-4000-8000-000000000002';
  v_batch_candidate uuid := 'e7100000-0000-4000-8000-000000000003';
  v_batch_direct uuid := 'e7100000-0000-4000-8000-000000000004';
  v_batch_promotion uuid := 'e7100000-0000-4000-8000-000000000005';
  v_queue_claim uuid := 'e7200000-0000-4000-8000-000000000001';
  v_queue_crash uuid := 'e7200000-0000-4000-8000-000000000002';
  v_queue_candidate uuid := 'e7200000-0000-4000-8000-000000000003';
  v_queue_direct uuid := 'e7200000-0000-4000-8000-000000000004';
  v_queue_promotion uuid := 'e7200000-0000-4000-8000-000000000005';
  v_item_claim uuid := 'e7300000-0000-4000-8000-000000000001';
  v_item_crash uuid := 'e7300000-0000-4000-8000-000000000002';
  v_item_candidate uuid := 'e7300000-0000-4000-8000-000000000003';
  v_item_direct uuid := 'e7300000-0000-4000-8000-000000000004';
  v_item_promotion uuid := 'e7300000-0000-4000-8000-000000000005';
  v_batch_owner uuid := 'e7400000-0000-4000-8000-000000000001';
  v_foreign_owner uuid := 'e7400000-0000-4000-8000-000000000002';
  v_direct_owner uuid := 'e7400000-0000-4000-8000-000000000003';
  v_missing_actor uuid := 'e7500000-0000-4000-8000-000000000001';
  v_processed_at timestamptz := '2026-07-15T01:00:00Z';
  v_candidate_effect jsonb;
  v_promotion_effect jsonb;
  v_none_effect jsonb := '{
    "schema":"kael_learning_effect.v1",
    "mode":"none",
    "candidate":null,
    "lifecycle":null
  }'::jsonb;
  v_candidate_count integer;
  v_lifecycle_count integer;
  v_receipt_count integer;
  v_rule_id uuid;
  v_rule_version integer;
begin
  v_candidate_effect := pg_catalog.jsonb_build_object(
    'schema', 'kael_learning_effect.v1',
    'mode', 'candidate',
    'candidate', pg_catalog.jsonb_build_object(
      'skill_id', 'LS5',
      'candidate_type', 'analysis_rule',
      'target', 'analysis_prompt',
      'effects', pg_catalog.jsonb_build_array(),
      'suggested_payload', pg_catalog.jsonb_build_object('safe', true),
      'rule_payload', null,
      'affected_service', 'plumbing',
      'affected_problem', 'plumbing-general',
      'affected_district', 'q7',
      'confidence', 0.8,
      'evidence_count', 5,
      'status', 'manual_review',
      'audit_reason', 'atomic_effect_verification',
      'prompt_version', 'q4-atomic-effect-test',
      'requires_manual_review', true
    ),
    'lifecycle', pg_catalog.jsonb_build_object(
      'gate_state', 'manual_review',
      'lifecycle_state', 'manual_review',
      'gate_reason', 'manual_review_skill',
      'evidence', pg_catalog.jsonb_build_object(
        'evidence_count', 5,
        'confidence', 0.8,
        'completed_transaction_count', 5,
        'recent_contradiction_ratio', 0
      ),
      'evidence_source', 'candidate_payload',
      'scope_rejected', false,
      'promotion_deferred_reason', null
    )
  );

  v_promotion_effect := pg_catalog.jsonb_build_object(
    'schema', 'kael_learning_effect.v1',
    'mode', 'promotion',
    'candidate', pg_catalog.jsonb_build_object(
      'skill_id', 'LS1',
      'candidate_type', 'price_prior_update',
      'target', 'price_prior',
      'effects', pg_catalog.jsonb_build_array('update_price_prior'),
      'suggested_payload', pg_catalog.jsonb_build_object(
        'scope', pg_catalog.jsonb_build_object(
          'service_type', 'plumbing',
          'problem_slug', 'atomic-effect-problem',
          'district_code', 'q-atomic-effect'
        ),
        'suggested', pg_catalog.jsonb_build_object(
          'new_min', 250000,
          'new_max', 450000
        )
      ),
      'rule_payload', pg_catalog.jsonb_build_object(
        'schema', 'kael_price_prior.v1',
        'min', 250000,
        'max', 450000
      ),
      'affected_service', 'plumbing',
      'affected_problem', 'atomic-effect-problem',
      'affected_district', 'q-atomic-effect',
      'confidence', 0.8,
      'evidence_count', 5,
      'status', 'evidence_gate_passed',
      'audit_reason', 'atomic_promotion_verification',
      'prompt_version', 'q4-atomic-effect-test',
      'requires_manual_review', false
    ),
    'lifecycle', pg_catalog.jsonb_build_object(
      'gate_state', 'auto_promoted',
      'lifecycle_state', 'active',
      'gate_reason', 'evidence_gate_passed',
      'evidence', pg_catalog.jsonb_build_object(
        'evidence_count', 5,
        'confidence', 0.8,
        'completed_transaction_count', 5,
        'recent_contradiction_ratio', 0
      ),
      'evidence_source', 'completed_reviewed_jobs',
      'scope_rejected', false,
      'promotion_deferred_reason', null
    )
  );

  insert into public.kael_ai_batches (
    id, provider, provider_batch_id, status, request_count, next_poll_at
  ) values
    (
      v_batch_claim, 'anthropic', 'msgbatch_effect_claim', 'ended', 1,
      '2026-07-15T00:00:00Z'
    ),
    (
      v_batch_crash, 'anthropic', 'msgbatch_effect_crash', 'ended', 1,
      '2026-07-15T00:00:00Z'
    ),
    (
      v_batch_candidate, 'anthropic', 'msgbatch_effect_candidate', 'ended', 1,
      '2026-07-15T00:00:00Z'
    ),
    (
      v_batch_direct, 'deepseek', null, 'in_progress', 1,
      '2026-07-15T00:00:00Z'
    ),
    (
      v_batch_promotion, 'anthropic', 'msgbatch_effect_promotion', 'ended', 1,
      '2026-07-15T00:00:00Z'
    );

  insert into public.kael_learning_queue (
    id, event_type, skill_id, actor_id, actor_role, queue_state, input_payload,
    candidate_payload, batch_id, claim_id, claimed_at, attempts, run_after
  ) values
    (
      v_queue_claim, 'post-A14', 'LS5', null, 'system', 'batched', '{}'::jsonb,
      '{}'::jsonb, v_batch_claim, null, null, 1, '2026-07-15T00:00:00Z'
    ),
    (
      v_queue_crash, 'post-A14', 'LS5', v_missing_actor, 'customer', 'batched',
      '{}'::jsonb, '{}'::jsonb, v_batch_crash, null, null, 1,
      '2026-07-15T00:00:00Z'
    ),
    (
      v_queue_candidate, 'post-A14', 'LS5', null, 'system', 'batched',
      '{}'::jsonb, '{}'::jsonb, v_batch_candidate, null, null, 1,
      '2026-07-15T00:00:00Z'
    ),
    (
      v_queue_direct, 'post-A14', 'LS5', null, 'system', 'processing',
      '{}'::jsonb, '{}'::jsonb, null, v_direct_owner,
      '2026-07-15T00:30:00Z', 1, '2026-07-15T00:00:00Z'
    ),
    (
      v_queue_promotion, 'post-A14', 'LS1', null, 'system', 'batched',
      '{}'::jsonb, '{}'::jsonb, v_batch_promotion, null, null, 1,
      '2026-07-15T00:00:00Z'
    );

  insert into public.kael_ai_batch_items (
    id, batch_id, queue_id, custom_id, skill_id, status
  ) values
    (v_item_claim, v_batch_claim, v_queue_claim, 'effect_claim', 'LS5', 'pending'),
    (v_item_crash, v_batch_crash, v_queue_crash, 'effect_crash', 'LS5', 'pending'),
    (
      v_item_candidate, v_batch_candidate, v_queue_candidate, 'effect_candidate',
      'LS5', 'pending'
    ),
    (v_item_direct, v_batch_direct, v_queue_direct, 'effect_direct', 'LS5', 'pending'),
    (
      v_item_promotion, v_batch_promotion, v_queue_promotion, 'effect_promotion',
      'LS1', 'pending'
    );

  insert into private.kael_ai_batch_result_claims (
    batch_id, claim_token, claimed_at
  ) values
    (v_batch_claim, v_batch_owner, '2026-07-15T00:30:00Z'),
    (v_batch_crash, v_batch_owner, '2026-07-15T00:30:00Z'),
    (v_batch_candidate, v_batch_owner, '2026-07-15T00:30:00Z'),
    (v_batch_promotion, v_batch_owner, '2026-07-15T00:30:00Z');

  begin
    perform public.commit_kael_learning_effect_atomic(
      'anthropic_batch', v_batch_claim, v_item_claim, v_queue_claim,
      v_foreign_owner, 'succeeded', '{"safe":true}'::jsonb, '{}'::jsonb,
      'manual_review', null, v_processed_at, v_candidate_effect
    );
    raise exception 'foreign batch claim committed a learning effect';
  exception
    when others then
      if sqlerrm <> 'BATCH_CLAIM_LOST' then
        raise;
      end if;
  end;

  if exists (
    select 1 from private.kael_learning_effect_receipts
    where queue_id = v_queue_claim
  ) or exists (
    select 1 from public.kael_rule_lifecycle_log
    where safe_metadata->>'q4_queue_id' = v_queue_claim::text
  ) or not exists (
    select 1 from public.kael_ai_batch_items
    where id = v_item_claim and status = 'pending'
  ) or not exists (
    select 1 from public.kael_learning_queue
    where id = v_queue_claim and queue_state = 'batched'
  ) then
    raise exception 'foreign batch claim changed durable learning state';
  end if;

  begin
    perform public.commit_kael_learning_effect_atomic(
      'anthropic_batch', v_batch_crash, v_item_crash, v_queue_crash,
      v_batch_owner, 'succeeded', '{"safe":true}'::jsonb, '{}'::jsonb,
      'manual_review', null, v_processed_at, v_candidate_effect
    );
    raise exception 'invalid lifecycle actor unexpectedly committed';
  exception
    when foreign_key_violation then
      null;
  end;

  if exists (
    select 1 from public.learning_candidates
    where audit_reason like '%' || v_queue_crash::text || '%'
  ) or exists (
    select 1 from public.kael_rule_lifecycle_log
    where safe_metadata->>'q4_queue_id' = v_queue_crash::text
  ) or exists (
    select 1 from private.kael_learning_effect_receipts
    where queue_id = v_queue_crash
  ) or not exists (
    select 1 from public.kael_ai_batch_items
    where id = v_item_crash and status = 'pending'
  ) or not exists (
    select 1 from public.kael_learning_queue
    where id = v_queue_crash and queue_state = 'batched'
  ) then
    raise exception 'failed effect left a partial learning candidate';
  end if;

  perform public.commit_kael_learning_effect_atomic(
    'anthropic_batch', v_batch_candidate, v_item_candidate, v_queue_candidate,
    v_batch_owner, 'succeeded', '{"safe":true}'::jsonb, '{}'::jsonb,
    'manual_review', null, v_processed_at, v_candidate_effect
  );

  select pg_catalog.count(*)::integer
  into v_candidate_count
  from public.learning_candidates
  where audit_reason like '%' || v_queue_candidate::text || '%';
  select pg_catalog.count(*)::integer
  into v_lifecycle_count
  from public.kael_rule_lifecycle_log
  where safe_metadata->>'q4_queue_id' = v_queue_candidate::text;
  select pg_catalog.count(*)::integer
  into v_receipt_count
  from private.kael_learning_effect_receipts
  where queue_id = v_queue_candidate;

  perform public.commit_kael_learning_effect_atomic(
    'anthropic_batch', v_batch_candidate, v_item_candidate, v_queue_candidate,
    v_batch_owner, 'succeeded', '{"safe":true}'::jsonb, '{}'::jsonb,
    'manual_review', null, v_processed_at, v_candidate_effect
  );

  if v_candidate_count <> 1
    or v_lifecycle_count <> 3
    or v_receipt_count <> 1
    or (
      select pg_catalog.count(*) from public.learning_candidates
      where audit_reason like '%' || v_queue_candidate::text || '%'
    ) <> v_candidate_count
    or (
      select pg_catalog.count(*) from public.kael_rule_lifecycle_log
      where safe_metadata->>'q4_queue_id' = v_queue_candidate::text
    ) <> v_lifecycle_count
    or (
      select pg_catalog.count(*) from private.kael_learning_effect_receipts
      where queue_id = v_queue_candidate
    ) <> v_receipt_count
  then
    raise exception 'exact learning effect replay created duplicate rows';
  end if;

  begin
    perform public.commit_kael_learning_effect_atomic(
      'anthropic_batch', v_batch_candidate, v_item_candidate, v_queue_candidate,
      v_batch_owner, 'succeeded', '{"safe":false}'::jsonb, '{}'::jsonb,
      'manual_review', null, v_processed_at, v_candidate_effect
    );
    raise exception 'conflicting learning effect replay was accepted';
  exception
    when others then
      if sqlerrm <> 'LEARNING_EFFECT_REPLAY_CONFLICT' then
        raise;
      end if;
  end;

  begin
    perform public.commit_kael_learning_effect_atomic(
      'deepseek_direct', v_batch_direct, v_item_direct, v_queue_direct,
      v_foreign_owner, 'succeeded', '{}'::jsonb, '{}'::jsonb,
      'processed', null, v_processed_at, v_none_effect
    );
    raise exception 'foreign queue claim committed a learning effect';
  exception
    when others then
      if sqlerrm <> 'LEARNING_EFFECT_QUEUE_CLAIM_LOST' then
        raise;
      end if;
  end;

  if exists (
    select 1 from private.kael_learning_effect_receipts
    where queue_id = v_queue_direct
  ) or not exists (
    select 1 from public.kael_ai_batch_items
    where id = v_item_direct and status = 'pending'
  ) or not exists (
    select 1 from public.kael_learning_queue
    where id = v_queue_direct
      and queue_state = 'processing'
      and claim_id = v_direct_owner
  ) then
    raise exception 'foreign queue claim changed direct learning state';
  end if;

  perform public.commit_kael_learning_effect_atomic(
    'deepseek_direct', v_batch_direct, v_item_direct, v_queue_direct,
    v_direct_owner, 'succeeded', '{}'::jsonb, '{}'::jsonb,
    'processed', null, v_processed_at, v_none_effect
  );
  perform public.commit_kael_learning_effect_atomic(
    'deepseek_direct', v_batch_direct, v_item_direct, v_queue_direct,
    v_direct_owner, 'succeeded', '{}'::jsonb, '{}'::jsonb,
    'processed', null, v_processed_at, v_none_effect
  );

  if not exists (
    select 1 from public.kael_learning_queue
    where id = v_queue_direct
      and queue_state = 'processed'
      and batch_id = v_batch_direct
      and claim_id is null
      and claimed_at is null
      and finalized_claim_id = v_direct_owner
  ) or not exists (
    select 1 from public.kael_ai_batch_items
    where id = v_item_direct and status = 'succeeded'
  ) or (
    select pg_catalog.count(*) from private.kael_learning_effect_receipts
    where queue_id = v_queue_direct
  ) <> 1 then
    raise exception 'owned direct learning effect was not idempotently committed';
  end if;

  perform public.commit_kael_learning_effect_atomic(
    'anthropic_batch', v_batch_promotion, v_item_promotion, v_queue_promotion,
    v_batch_owner, 'succeeded', '{"safe":true}'::jsonb, '{}'::jsonb,
    'processed', null, v_processed_at, v_promotion_effect
  );

  select receipt.rule_id, receipt.rule_version
  into v_rule_id, v_rule_version
  from private.kael_learning_effect_receipts as receipt
  where receipt.queue_id = v_queue_promotion;
  perform public.commit_kael_learning_effect_atomic(
    'anthropic_batch', v_batch_promotion, v_item_promotion, v_queue_promotion,
    v_batch_owner, 'succeeded', '{"safe":true}'::jsonb, '{}'::jsonb,
    'processed', null, v_processed_at, v_promotion_effect
  );

  if v_rule_id is null
    or v_rule_version <> 1
    or (
      select pg_catalog.count(*) from public.learning_rule_versions
      where rule_id = v_rule_id
    ) <> 1
    or (
      select pg_catalog.count(*) from public.kael_rule_lifecycle_log
      where safe_metadata->>'q4_queue_id' = v_queue_promotion::text
    ) <> 4
    or exists (
      select 1 from public.kael_rule_lifecycle_log
      where safe_metadata->>'q4_queue_id' = v_queue_promotion::text
        and transition_reason = 'promote_learning_candidate'
    ) or not exists (
      select 1 from public.kael_rule_lifecycle_log
      where safe_metadata->>'q4_queue_id' = v_queue_promotion::text
        and rule_id = v_rule_id
        and previous_state = 'auto_promoted'
        and next_state = 'active'
        and (safe_metadata->>'rule_version')::integer = v_rule_version
    )
  then
    raise exception 'promotion semantics or version idempotency changed';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.commit_kael_learning_effect_atomic(text,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,timestamptz,jsonb)',
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.commit_kael_learning_effect_atomic(text,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,timestamptz,jsonb)',
    'execute'
  ) then
    raise exception 'non-service role can commit learning effects';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.commit_kael_learning_effect_atomic(text,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,timestamptz,jsonb)',
    'execute'
  ) then
    raise exception 'service role cannot commit learning effects';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as proc
    where proc.oid = pg_catalog.to_regprocedure(
      'public.commit_kael_learning_effect_atomic(text,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,timestamptz,jsonb)'
    )
      and proc.prosecdef is true
      and proc.proconfig = array['search_path=""']::text[]
  ) then
    raise exception 'learning effect RPC security configuration is unsafe';
  end if;
end;
$test$;

rollback;
