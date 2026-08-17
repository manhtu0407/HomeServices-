/**
 * Compile-time contract fixtures for the generated database types.
 *
 * Each function declares a literal with a `satisfies` clause against the
 * generated Database type. Nothing here runs: `tsc` is the assertion, and it
 * fails when a generated table, RPC argument, or return column drops away.
 *
 * These lived in tier1-type-completeness.test.ts as `it()` blocks whose only
 * runtime assertion re-read a value the fixture itself had just declared. The
 * type coverage was real, the test around it was not, so the fixtures moved
 * here and the fake assertions were dropped.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- every binding here exists
   to carry a `satisfies` clause; consuming the value at runtime is exactly the
   fake assertion this file was created to remove. */
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/lib/database.types'

export function serviceCategoriesRequiresServiceTypeSlugAndLabel() {
    const minimal = {
      service_type: 'electrical' as const,
      slug: 'electrical',
      label_vi: 'Sua dien',
    } satisfies Database['public']['Tables']['service_categories']['Insert']
}

export function serviceProblemsRequiresCategoryServiceTypeSlugAndLabel() {
    const minimal = {
      service_category_id: '00000000-0000-0000-0000-000000000000',
      service_type: 'plumbing' as const,
      slug: 'plumbing-general',
      label_vi: 'Su co nuoc tong quat',
    } satisfies Database['public']['Tables']['service_problems']['Insert']
}

export function priceBaselinesRequiresServiceProblemIdAndPriceRange() {
    const minimal = {
      service_problem_id: '00000000-0000-0000-0000-000000000000',
      service_type: 'electrical' as const,
      complexity: 'small' as const,
      price_min: 100000,
      price_max: 300000,
    } satisfies Database['public']['Tables']['price_baselines']['Insert']
}

export function scopeChangeRequestsRequiresWorkerReasonAndPriceRange() {
    const minimal = {
      job_id: '00000000-0000-0000-0000-000000000000',
      worker_id: '00000000-0000-0000-0000-000000000000',
      requested_description: 'Replace damaged pipe section',
      reason: 'Worker found a different issue on-site',
      price_min: 250000,
      price_max: 450000,
    } satisfies Database['public']['Tables']['scope_change_requests']['Insert']
}

export function learningRulesAndVersionsCarryRollbackVersionPayloads() {
    const rule = {
      rule_type: 'price_prior_update',
    } satisfies Database['public']['Tables']['learning_rules']['Insert']
    const version = {
      rule_id: '00000000-0000-0000-0000-000000000000',
      version: 1,
      rule_payload: { complexity: 'medium' },
      change_reason: 'Evidence gate passed',
    } satisfies Database['public']['Tables']['learning_rule_versions']['Insert']
}

export function kaelChatSessionsAndTurnsCarryServiceRoleChatState() {
    const session = {
      customer_id: '00000000-0000-0000-0000-000000000000',
      service_type: 'electrical' as const,
    } satisfies Database['public']['Tables']['kael_chat_sessions']['Insert']
    const turn = {
      session_id: '00000000-0000-0000-0000-000000000000',
      turn_index: 1,
      role: 'customer',
      content_type: 'text',
    } satisfies Database['public']['Tables']['kael_chat_turns']['Insert']
}

export function workerKaelChatTablesAndRateRpcStayJobScoped() {
    const workerId = '00000000-0000-0000-0000-000000000001'
    const jobId = '00000000-0000-0000-0000-000000000002'
    const sessionId = '00000000-0000-0000-0000-000000000003'
    const session = {
      worker_id: workerId,
      job_id: jobId,
      client_request_id: 'client-request-1',
    } satisfies Database['public']['Tables']['kael_worker_chat_sessions']['Insert']
    const turn = {
      session_id: sessionId,
      job_id: jobId,
      client_request_id: 'turn-request-1',
      turn_index: 1,
      role: 'worker',
      content_type: 'text',
    } satisfies Database['public']['Tables']['kael_worker_chat_turns']['Insert']
    const rateLog = {
      worker_id: workerId,
    } satisfies Database['public']['Tables']['kael_worker_chat_rate_limit_log']['Insert']
    const rateArgs = {
      p_worker_id: workerId,
    } satisfies Database['public']['Functions']['check_kael_worker_chat_rate']['Args']
    const rateRow = {
      allowed: false,
      minute_count: 5,
      hour_count: 5,
      reason: 'minute',
    } satisfies Database['public']['Functions']['check_kael_worker_chat_rate']['Returns'][number]
}

export function representsTheDurableCircuitAndGenericRateContracts() {
    const circuit = {
      scope: 'purpose_provider',
      key: 'vision_analysis:anthropic',
      kind: 'timeout',
      window_started_at: '2026-07-10T00:00:00.000Z',
    } satisfies Database['public']['Tables']['kael_provider_circuit']['Insert']
    const rate = {
      scope: 'kael_chat:minute',
      key: '00000000-0000-0000-0000-000000000001',
      window_started_at: '2026-07-10T00:00:00.000Z',
      tokens: 4,
    } satisfies Database['public']['Tables']['kael_rate_counter']['Insert']
    const failureArgs = {
      p_scope: 'provider',
      p_key: 'deepseek',
      p_kind: 'credit',
    } satisfies Database['public']['Functions']['record_circuit_failure']['Args']
    const rateArgs = {
      p_scope: 'kael_chat',
      p_key: '00000000-0000-0000-0000-000000000001',
      p_cost: 1,
      p_config: { buckets: [] },
    } satisfies Database['public']['Functions']['rate_take']['Args']
}

export function workerKaelFeedbackAndTrainingConsentTablesCarryWorkerOwnedParityData() {
    const workerId = '00000000-0000-0000-0000-000000000001'
    const feedback = {
      worker_id: workerId,
      raw_message: 'Kael helped me answer the customer clearly.',
      scrubbed_message: 'Kael helped me answer the customer clearly.',
    } satisfies Database['public']['Tables']['worker_kael_feedback']['Insert']
    const consent = {
      worker_id: workerId,
      training_consent: true,
    } satisfies Database['public']['Tables']['worker_kael_training_consent']['Insert']
}

export function keepsTheSection50FeedbackEscalationAndEstimateContractsInGeneratedTypes() {
    const actorId = '00000000-0000-0000-0000-000000000001'
    const customerFeedback = {
      customer_id: actorId,
      message: 'Kael made the estimate clear.',
      message_scrubbed: 'Kael made the estimate clear.',
      response_id: 'customer-response-1',
      rating: 'useful',
      reason_scrubbed: 'Clear estimate.',
    } satisfies Database['public']['Tables']['customer_kael_feedback']['Insert']
    const workerFeedback = {
      worker_id: actorId,
      raw_message: 'Kael made the worker brief clear.',
      scrubbed_message: 'Kael made the worker brief clear.',
      response_id: 'worker-response-1',
      rating: 'not_useful',
      reason_scrubbed: 'Missing scope detail.',
    } satisfies Database['public']['Tables']['worker_kael_feedback']['Insert']
    const resolvedQueue = {
      actor_role: 'admin',
      queue_type: 'demanding_customer',
      priority: 'high',
      escalation_level: 'hard',
      reason_code: 'verification',
      response_summary: 'Safe resolution summary.',
      resolved_by: actorId,
      resolved_at: '2026-08-08T00:00:00.000Z',
      resolution_note: 'Resolved after a safe review.',
    } satisfies Database['public']['Tables']['kael_admin_queue']['Insert']
    const accuracy = {
      service_type: 'electrical',
      complexity: 'small',
      month: '2026-08-01',
      job_count: 3,
      in_band_count: 1,
      in_band_rate: 0.3333,
      under_count: 1,
      over_count: 1,
      median_miss_ratio: 0.25,
      p90_miss_ratio: 0.5,
    } satisfies Database['public']['Views']['kael_estimate_accuracy']['Row']
}

export function kaelOptimizationAndKnowledgeArtifactsStayRepresentedInGeneratedTypes() {
    const userId = '00000000-0000-0000-0000-000000000001'
    const jobId = '00000000-0000-0000-0000-000000000002'
    const batchId = '00000000-0000-0000-0000-000000000003'
    const queue = {
      event_type: 'post-A14',
      skill_id: 'LS5',
      job_id: jobId,
    } satisfies Database['public']['Tables']['kael_learning_queue']['Insert']
    const batch = {
      provider: 'anthropic' as const,
      purpose: 'post_job_learning',
    } satisfies Database['public']['Tables']['kael_ai_batches']['Insert']
    const batchItem = {
      batch_id: batchId,
      custom_id: 'learning_1',
      skill_id: 'LS5',
    } satisfies Database['public']['Tables']['kael_ai_batch_items']['Insert']
    const sourceTrust = {
      domain: 'tuoitre.vn',
      tier: 'tier_1',
      trust_score: 1,
    } satisfies Database['public']['Tables']['source_trust_registry']['Insert']
    const knowledgeUsage = {
      citation_id: 'service_knowledge_boxes:electrical',
      knowledge_table: 'service_knowledge_boxes',
    } satisfies Database['public']['Tables']['kael_knowledge_usage_log']['Insert']
    const preIntake = {
      customer_id: userId,
      address_fingerprint: 'safe-address-fingerprint',
    } satisfies Database['public']['Tables']['kael_chat_pre_intake_memory']['Insert']
    const rateLog = {
      user_id: userId,
    } satisfies Database['public']['Tables']['kael_chat_rate_limit_log']['Insert']
}

export function kaelAutonomyGuardrailAndKnowledgeRpcTypesMatchServiceRoleBoundaries() {
    const jobId = '00000000-0000-0000-0000-000000000002'
    const auditId = '00000000-0000-0000-0000-000000000004'
    const autonomyAudit = {
      actor_role: 'system',
      decision_source: 'policy',
      from_status: 'estimate_ready' as const,
      to_status: 'broadcasting' as const,
      gate_result: 'allow',
      reason_code: 'ALLOW_AUTONOMY_DECISION',
    } satisfies Database['public']['Tables']['kael_autonomy_decision_audit']['Insert']
    const guardrail = {
      actor_role: 'system',
      surface: 'self-check',
      reason_code: 'SAFE_TEMPLATE_REQUIRED',
      source: 'self_check',
    } satisfies Database['public']['Tables']['kael_guardrail_trip_audit']['Insert']
    const chatRateArgs = {
      p_user_id: '00000000-0000-0000-0000-000000000001',
    } satisfies Database['public']['Functions']['check_kael_chat_rate']['Args']
    const matchArgs = {
      p_query_embedding: '[0,0,0]',
      p_service_type: 'electrical',
    } satisfies Database['public']['Functions']['match_kael_knowledge']['Args']
    const applyKnowledgeArgs = {
      p_candidate_id: '00000000-0000-0000-0000-000000000005',
      p_admin_id: '00000000-0000-0000-0000-000000000006',
    } satisfies Database['public']['Functions']['apply_approved_learning_candidate_to_knowledge']['Args']
    const atomicApprovalArgs = {
      p_candidate_id: '00000000-0000-0000-0000-000000000005',
      p_admin_id: '00000000-0000-0000-0000-000000000006',
      p_review_note: 'reviewed',
    } satisfies Database['public']['Functions']['admin_approve_learning_candidate_atomic']['Args']
    const applyAutonomyArgs = {
      p_job_id: jobId,
      p_gate_audit_id: auditId,
      p_expected_from: 'estimate_ready' as const,
      p_to_status: 'broadcasting' as const,
    } satisfies Database['public']['Functions']['apply_kael_autonomy_decision']['Args']
}

export function p10AdminQueueAndInteractionLogsCarryEscalationState() {
    const queue = {
      actor_role: 'customer',
      queue_type: 'demanding_customer',
      priority: 'high',
      escalation_level: 'hard',
      reason_code: 'threat_complaint',
      response_summary: 'Escalated for admin review.',
    } satisfies Database['public']['Tables']['kael_admin_queue']['Insert']
    const log = {
      actor_role: 'customer',
      interaction_type: 'demanding_customer',
      nuance: 'pressure',
      expected_nuance: 'pressure',
      escalation_level: 'hard',
      sanitized_excerpt: 'Da an danh',
    } satisfies Database['public']['Tables']['kael_interaction_log']['Insert']
}

export function p11WorkerCancellationTaxonomyCarriesAdminTunableReasonCategories() {
    const reason = {
      code: 'higher_pay_elsewhere',
      category: 'suspicious',
      label_vi: 'Tho bao co viec khac tra cao hon',
      is_active: true,
      admin_tunable: true,
    } satisfies Database['public']['Tables']['worker_cancellation_reason_taxonomy']['Insert']
}

export function p12CustomerCancellationTaxonomyAndRecordsCarryPhase0PolicyFields() {
    const reason = {
      code: 'changed_mind',
      category: 'no_penalty_phase_0',
      label_vi: 'Khach doi y trong Phase 0',
      is_active: true,
      admin_tunable: true,
    } satisfies Database['public']['Tables']['customer_cancellation_reason_taxonomy']['Insert']
    const record = {
      job_id: '00000000-0000-0000-0000-000000000000',
      customer_id: '00000000-0000-0000-0000-000000000000',
      sub_case: 'after_worker_accept',
      reason_code: reason.code,
      reason_category: reason.category,
      phase0_no_monetary_penalty: true,
      worker_goodwill: { required: true, kind: 'phase0_goodwill_note' },
    } satisfies Database['public']['Tables']['customer_cancellation_records']['Insert']
}

export function p13DisputesAndEvidenceSnapshotsCarryLockedNeutralReviewFields() {
    const snapshot = {
      job_id: '00000000-0000-0000-0000-000000000000',
      evidence_locked_at: '2026-05-26T00:00:00.000Z',
      evidence_snapshot: {
        chat_message_ids: [],
        photo_urls: [],
        status_timeline: [],
        scope_changes: [],
        kael_artifacts: [],
      },
    } satisfies Database['public']['Tables']['evidence_snapshots']['Insert']
    const dispute = {
      job_id: snapshot.job_id,
      dispute_type: 'completion_rejected',
      initiated_by: 'customer',
      initiated_by_id: '00000000-0000-0000-0000-000000000000',
      counter_party_id: '00000000-0000-0000-0000-000000000000',
      initiator_statement: 'Customer says completion is not accepted.',
      counter_party_response_deadline: '2026-05-27T00:00:00.000Z',
      evidence_snapshot_id: '00000000-0000-0000-0000-000000000000',
      evidence_locked_at: snapshot.evidence_locked_at,
      kael_neutral_summary: 'Fact-only summary for admin review.',
      admin_review: { priority: 'high' },
      status: 'open',
    } satisfies Database['public']['Tables']['disputes']['Insert']
}

export function q1CostOptimizationBaselineAndMetricTablesCarryTelemetryState() {
    const baseline = {
      baseline_key: 'q1-staging-50-smoke',
      source: 'staging_live_50',
      sample_size: 50,
      job_count: 50,
      api_log_count: 100,
      schema_validation_rate: 1,
      provider_breakdown: { perplexity: { calls: 50 } },
      purpose_breakdown: { market_lookup: { calls: 50 } },
      cost_summary: { total_usd: 0.01 },
    } satisfies Database['public']['Tables']['kael_quality_baseline']['Insert']
    const metric = {
      purpose: 'market_lookup',
      provider: 'perplexity' as const,
      option_flags: { KAEL_OPT_MARKET_CACHE_ENABLED: false },
      enabled_options: [],
      cost_before_estimate: 0.00015,
      cost_actual: 0.00015,
      quality_pass: true,
    } satisfies Database['public']['Tables']['kael_optimization_metrics']['Insert']
}

export function kaelLearningPromotionRpcReturnsCandidateAndRuleIds() {
    type PromotionRow =
      Database['public']['Functions']['promote_learning_candidate']['Returns'][number]
    const row = {
      ok: true,
      error_code: 'UNUSED_ON_SUCCESS',
      candidate_id: '00000000-0000-0000-0000-000000000000',
      rule_id: '11111111-1111-4111-8111-111111111111',
      rule_version: 1,
    } satisfies PromotionRow
}

export function kaelLearningRollbackRpcReturnsRolledBackRuleId() {
    type RollbackRow =
      Database['public']['Functions']['rollback_learning_rule']['Returns'][number]
    const row = {
      ok: true,
      error_code: 'UNUSED_ON_SUCCESS',
      rule_id: '11111111-1111-4111-8111-111111111111',
    } satisfies RollbackRow
}

export function kaelLearningAdminReviewRpcsReturnCandidateReviewStatus() {
    type ApproveRow =
      Database['public']['Functions']['admin_approve_learning_candidate']['Returns'][number]
    type AtomicApproveRow =
      Database['public']['Functions']['admin_approve_learning_candidate_atomic']['Returns'][number]
    type RejectRow =
      Database['public']['Functions']['admin_reject_learning_candidate']['Returns'][number]
    const approved = {
      ok: true,
      error_code: 'UNUSED_ON_SUCCESS',
      candidate_id: '00000000-0000-0000-0000-000000000000',
      rule_id: '11111111-1111-4111-8111-111111111111',
      rule_version: 2,
      status: 'auto_promoted',
    } satisfies ApproveRow
    const rejected = {
      ok: true,
      error_code: 'UNUSED_ON_SUCCESS',
      candidate_id: '00000000-0000-0000-0000-000000000000',
      status: 'archived',
    } satisfies RejectRow
    const atomicApproved = {
      ...approved,
      knowledge_ok: true,
      knowledge_error_code: 'UNUSED_ON_SUCCESS',
      knowledge_table: 'service_knowledge_boxes',
      record_key: 'cleaning',
      knowledge_version: 3,
    } satisfies AtomicApproveRow
}

export function workerCancellationRpcReturnIncludesAutoReassignmentFields() {
    type WorkerCancellationRow =
      Database['public']['Functions']['request_worker_cancellation_atomic']['Returns'][number]
    const row = {
      ok: true,
      error_code: '',
      cancellation_id: '00000000-0000-0000-0000-000000000000',
      cancellation_status: 'approved',
      job_id_out: '00000000-0000-0000-0000-000000000000',
      job_status: 'broadcasting',
      service_type_out: 'plumbing',
      district_code: 'q7',
      worker_id_out: '00000000-0000-0000-0000-000000000000',
      created_at_ts: '2026-05-20T00:00:00.000Z',
      reason_code: 'higher_pay_elsewhere',
      reason_category: 'suspicious',
      admin_review_required: true,
      fallback_options: [],
      abuse_signals: ['cancellation_rate_exceeded'],
    } satisfies WorkerCancellationRow
}

export function customerCancellationRpcReturnsCase4PolicyFields() {
    type CustomerCancellationRow =
      Database['public']['Functions']['request_customer_cancellation_atomic']['Returns'][number]
    const row = {
      ok: true,
      error_code: '',
      cancellation_id: '00000000-0000-0000-0000-000000000000',
      job_id_out: '00000000-0000-0000-0000-000000000000',
      job_status: 'cancelled',
      sub_case: 'after_worker_accept',
      reason_code: 'changed_mind',
      reason_category: 'no_penalty_phase_0',
      worker_id_out: '00000000-0000-0000-0000-000000000000',
      admin_review_required: true,
      phase0_no_monetary_penalty: true,
      worker_goodwill: { required: true, kind: 'phase0_goodwill_note' },
      abuse_signals: ['cancel_after_accept_threshold'],
      created_at_ts: '2026-05-26T00:00:00.000Z',
    } satisfies CustomerCancellationRow
}

export function disputeRpcsReturnEvidenceLockAndAdminReviewFields() {
    type OpenRow = Database['public']['Functions']['open_dispute_atomic']['Returns'][number]
    const opened = {
      ok: true,
      error_code: '',
      dispute_id: '00000000-0000-0000-0000-000000000000',
      evidence_snapshot_id: '00000000-0000-0000-0000-000000000000',
      dispute_status: 'open',
      admin_review_required: true,
      priority: 'high',
      evidence_locked_at: '2026-05-26T00:00:00.000Z',
      created_at_ts: '2026-05-26T00:00:00.000Z',
    } satisfies OpenRow

    type DecisionRow = Database['public']['Functions']['admin_decide_dispute_atomic']['Returns'][number]
    const decided = {
      ok: true,
      error_code: '',
      dispute_id: opened.dispute_id,
      dispute_status: 'admin_decided',
      decided_at_ts: '2026-05-26T01:00:00.000Z',
    } satisfies DecisionRow
}

export function jobsTypesIncludeIdempotencyApartmentAccessAndFrozenPaymentColumns() {
    const job = {
      customer_id: '00000000-0000-4000-8000-000000000001',
      service_type: 'plumbing' as const,
      description: 'Ống nước dưới bồn rửa đang bị rò rỉ.',
      client_request_id: '00000000-0000-4000-8000-000000000002',
      apartment_access_profile: { entry_method: 'Đăng ký tại quầy lễ tân' },
      apartment_access_state: { release_stage: 'area_only' },
      gross_amount: 900_000,
      platform_fee: 45_000,
      worker_net: 855_000,
      payment_status: 'received',
      payment_provider: 'sepay_vietqr',
      payment_amount_received: 900_000,
      sepay_transaction_id: 'sepay-transaction-1',
    } satisfies Database['public']['Tables']['jobs']['Insert']
}

export function tablesJobsResolvesToJobsRowType() {
    type JobRow = Tables<'jobs'>
    const _check: JobRow = {} as Database['public']['Tables']['jobs']['Row']
}

export function tablesinsertJobsResolvesToJobsInsertType() {
    type JobInsert = TablesInsert<'jobs'>
    const _check: JobInsert = {} as Database['public']['Tables']['jobs']['Insert']
}

export function tablesupdateJobsResolvesToJobsUpdateType() {
    type JobUpdate = TablesUpdate<'jobs'>
    const _check: JobUpdate = {} as Database['public']['Tables']['jobs']['Update']
}
