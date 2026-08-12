import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '@/lib/database.types'
import { Constants } from '@/lib/database.types'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

type TableNames = keyof Database['public']['Tables']
type EnumNames = keyof Database['public']['Enums']

const ROOT = resolve(__dirname, '../../../../../')
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations')
const DROPPED_PUBLIC_TABLES = new Set(['worker_profiles_districts_backup_x3'])
const DROPPED_PUBLIC_FUNCTIONS = new Set([
  'normalize_district_value',
  'decide_worker_cancellation_atomic',
])
// PostgREST excludes trigger-returning helpers from the generated callable RPC surface.
const TRIGGER_ONLY_PUBLIC_FUNCTIONS = new Set([
  'handle_new_user',
  'notify_worker_account_approved',
  'prevent_evidence_snapshot_mutation',
  'validate_customer_payment_method_customer',
  'capture_learning_review_provenance',
  'capture_learning_rule_dependency',
  'prevent_revoked_learning_rule_activation',
  'reject_harness_append_only_mutation',
  'reject_harness_release_mutation',
])

const readText = (path: string) => readFileSync(path, 'utf-8').replace(/\r\n/g, '\n')
const listMigrationSql = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readText(resolve(MIGRATIONS_DIR, name)))
    .join('\n')

function uniqueMatches(source: string, pattern: RegExp, groupIndex = 1) {
  return [...source.matchAll(pattern)]
    .map((match) => match[groupIndex])
    .filter(Boolean)
    .toSorted()
}

function generatedPublicKeys(sectionName: 'Tables' | 'Functions') {
  const keys: string[] = []
  let section: string | null = null
  for (const line of readGeneratedDatabaseTypes().split('\n')) {
    if (/^\s{4}Tables: \{/.test(line)) {
      section = 'Tables'
      continue
    }
    if (/^\s{4}Views: \{/.test(line)) {
      section = 'Views'
      continue
    }
    if (/^\s{4}Functions: \{/.test(line)) {
      section = 'Functions'
      continue
    }
    if (/^\s{4}Enums: \{/.test(line)) {
      section = 'Enums'
      continue
    }
    if (section === sectionName) {
      const key = line.match(/^\s{6}([a-zA-Z0-9_]+):(?: \{|$)/)
      if (key) keys.push(key[1])
    }
  }
  return keys.toSorted()
}

const EXPECTED_TABLES = [
  'profiles',
  'customer_profiles',
  'worker_profiles',
  'service_categories',
  'service_problems',
  'price_baselines',
  'jobs',
  'job_broadcasts',
  'job_events',
  'chat_messages',
  'scope_change_requests',
  'notifications',
  'reviews',
  'api_logs',
  'learning_candidates',
  'learning_rules',
  'learning_rule_versions',
  'service_knowledge_boxes',
  'kael_market_artifacts',
  'job_media_assets',
  'kael_ai_batches',
  'kael_ai_batch_items',
  'kael_analysis_artifacts',
  'kael_autonomy_decision_audit',
  'kael_chat_sessions',
  'kael_chat_turns',
  'kael_chat_pre_intake_memory',
  'kael_chat_rate_limit_log',
  'kael_guardrail_trip_audit',
  'kael_knowledge_usage_log',
  'kael_learning_queue',
  'kael_worker_chat_rate_limit_log',
  'kael_worker_chat_sessions',
  'kael_worker_chat_turns',
  'device_push_tokens',
  'worker_cancellation_requests',
  'ai_provider_routing',
  'customer_kael_memory',
  'worker_kael_feedback',
  'worker_kael_memory',
  'worker_kael_training_consent',
  'kael_admin_queue',
  'kael_permission_audit',
  'kael_advisory_audit',
  'kael_memory_audit',
  'kael_worker_qa_log',
  'worker_scope_change_stats',
  'worker_safety_patterns',
  'legal_awareness_patterns',
  'kael_memory_archive',
  'kael_rule_application_log',
  'kael_rule_lifecycle_log',
  'kael_charter_audit',
  'kael_interaction_log',
  'worker_cancellation_reason_taxonomy',
  'customer_cancellation_reason_taxonomy',
  'customer_cancellation_records',
  'evidence_snapshots',
  'disputes',
  'kael_quality_baseline',
  'kael_market_cache',
  'kael_optimization_metrics',
  'source_trust_registry',
  'admin_operator_accounts',
  'admin_manager_nominations',
  'admin_worker_application_reviews',
] as const satisfies readonly TableNames[]

const EXPECTED_ENUMS = [
  'user_role',
  'service_type',
  'job_status',
  'complexity_level',
  'broadcast_status',
  'scope_change_status',
  'worker_verification_status',
  'notification_status',
  'learning_candidate_status',
  'learning_rule_status',
  'message_sender',
  'api_provider',
] as const satisfies readonly EnumNames[]

describe('Database.public.Tables completeness', () => {
  it('has all aligned workflow tables', () => {
    expect(EXPECTED_TABLES).toHaveLength(66)
  })

  it.each(EXPECTED_TABLES)('table "%s" is a valid generated table key', (name) => {
    const tableName: TableNames = name
    expect(tableName).toBeTruthy()
  })

  it('keeps generated public table keys aligned with migration-created tables', () => {
    const migrations = listMigrationSql()
    const migrationTables = uniqueMatches(
      migrations,
      /create\s+table\s+if\s+not\s+exists\s+public\.([a-zA-Z0-9_]+)/gi,
    ).filter((name) => !DROPPED_PUBLIC_TABLES.has(name))
    const generatedTables = new Set(generatedPublicKeys('Tables'))
    const missing = migrationTables.filter((table) => !generatedTables.has(table))

    expect(missing).toEqual([])
  })

  it('keeps generated public RPC keys aligned with live migration-created functions', () => {
    const migrations = listMigrationSql()
    const migrationFunctions = uniqueMatches(
      migrations,
      /create\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z0-9_]+)/gi,
    ).filter(
      (name) => !DROPPED_PUBLIC_FUNCTIONS.has(name) && !TRIGGER_ONLY_PUBLIC_FUNCTIONS.has(name),
    )
    const generatedFunctions = new Set(generatedPublicKeys('Functions'))
    const missing = migrationFunctions.filter((fn) => !generatedFunctions.has(fn))

    expect(missing).toEqual([])
  })
})

describe('Database.public.Enums completeness', () => {
  it('has all workflow and learning enums', () => {
    expect(Object.keys(Constants.public.Enums).toSorted()).toEqual(EXPECTED_ENUMS.toSorted())
  })

  it.each(EXPECTED_ENUMS)('enum "%s" exists in Constants', (name) => {
    expect(Constants.public.Enums).toHaveProperty(name)
  })
})

describe('Core enum values', () => {
  it('service_type remains scoped to the six launched services', () => {
    expect(Constants.public.Enums.service_type).toEqual([
      'electrical',
      'plumbing',
      'cleaning',
      'hvac',
      'upholstery',
      'handyman',
    ])
  })

  it('job_status matches STRUCTURES.md workflow', () => {
    expect(Constants.public.Enums.job_status).toEqual([
      'draft',
      'analyzing',
      'estimate_ready',
      'awaiting_customer_confirm',
      'broadcasting',
      'worker_candidate_pending',
      'worker_matched',
      'worker_on_way',
      'arrived',
      'inspecting',
      'repairing',
      'scope_change_pending',
      'completed_by_worker',
      'confirmed_by_customer',
      'payment_pending',
      'paid',
      'reviewed',
      'cancelled',
    ])
  })

  it('broadcast_status includes reassignment and cancellation paths', () => {
    expect(Constants.public.Enums.broadcast_status).toEqual([
      'pending',
      'sent',
      'accepted',
      'declined',
      'expired',
      'reassigned',
      'cancelled',
    ])
  })
})

describe('Insert type requirements', () => {
  it('service_categories requires service_type, slug, and label', () => {
    const minimal = {
      service_type: 'electrical' as const,
      slug: 'electrical',
      label_vi: 'Sua dien',
    } satisfies Database['public']['Tables']['service_categories']['Insert']
    expect(minimal.slug).toBe('electrical')
  })

  it('service_problems requires category, service_type, slug, and label', () => {
    const minimal = {
      service_category_id: '00000000-0000-0000-0000-000000000000',
      service_type: 'plumbing' as const,
      slug: 'plumbing-general',
      label_vi: 'Su co nuoc tong quat',
    } satisfies Database['public']['Tables']['service_problems']['Insert']
    expect(minimal.service_type).toBe('plumbing')
  })

  it('price_baselines requires service_problem_id and price range', () => {
    const minimal = {
      service_problem_id: '00000000-0000-0000-0000-000000000000',
      service_type: 'electrical' as const,
      complexity: 'small' as const,
      price_min: 100000,
      price_max: 300000,
    } satisfies Database['public']['Tables']['price_baselines']['Insert']
    expect(minimal.price_max).toBeGreaterThan(minimal.price_min)
  })

  it('scope_change_requests requires worker reason and price range', () => {
    const minimal = {
      job_id: '00000000-0000-0000-0000-000000000000',
      worker_id: '00000000-0000-0000-0000-000000000000',
      requested_description: 'Replace damaged pipe section',
      reason: 'Worker found a different issue on-site',
      price_min: 250000,
      price_max: 450000,
    } satisfies Database['public']['Tables']['scope_change_requests']['Insert']
    expect(minimal.price_max).toBeGreaterThan(minimal.price_min)
  })

  it('learning rules and versions carry rollback/version payloads', () => {
    const rule = {
      rule_type: 'price_prior_update',
    } satisfies Database['public']['Tables']['learning_rules']['Insert']
    const version = {
      rule_id: '00000000-0000-0000-0000-000000000000',
      version: 1,
      rule_payload: { complexity: 'medium' },
      change_reason: 'Evidence gate passed',
    } satisfies Database['public']['Tables']['learning_rule_versions']['Insert']

    expect(rule.rule_type).toBe('price_prior_update')
    expect(version.version).toBe(1)
  })

  it('kael chat sessions and turns carry service-role chat state', () => {
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

    expect(session.service_type).toBe('electrical')
    expect(turn.role).toBe('customer')
  })

  it('worker Kael chat tables and rate RPC stay job-scoped', () => {
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

    expect(session.job_id).toBe(jobId)
    expect(turn.job_id).toBe(jobId)
    expect(turn.client_request_id).toBe('turn-request-1')
    expect(rateLog.worker_id).toBe(workerId)
    expect(rateArgs.p_worker_id).toBe(workerId)
    expect(rateRow.allowed).toBe(false)
  })

  it('represents the durable circuit and generic rate contracts', () => {
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

    expect(circuit.kind).toBe('timeout')
    expect(rate.tokens).toBe(4)
    expect(failureArgs.p_scope).toBe('provider')
    expect(rateArgs.p_cost).toBe(1)
  })

  it('worker Kael feedback and training consent tables carry worker-owned parity data', () => {
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

    expect(feedback.worker_id).toBe(workerId)
    expect(consent.training_consent).toBe(true)
  })

  it('keeps the Section 50 feedback, escalation, and estimate contracts in generated types', () => {
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

    expect(customerFeedback.response_id).toBeTruthy()
    expect(workerFeedback.rating).toBe('not_useful')
    expect(resolvedQueue.resolved_by).toBe(actorId)
    expect(accuracy.in_band_rate).toBe(0.3333)
  })

  it('Kael optimization and knowledge artifacts stay represented in generated types', () => {
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
    expect(queue.job_id).toBe(jobId)
    expect(batch.provider).toBe('anthropic')
    expect(batchItem.batch_id).toBe(batchId)
    expect(sourceTrust.domain).toBe('tuoitre.vn')
    expect(knowledgeUsage.knowledge_table).toBe('service_knowledge_boxes')
    expect(preIntake.customer_id).toBe(userId)
    expect(rateLog.user_id).toBe(userId)
  })

  it('does not expose dropped migration backup tables as runtime contract types', () => {
    type DroppedBackupTable = Extract<TableNames, 'worker_profiles_districts_backup_x3'>
    const backupTableDropped: DroppedBackupTable extends never ? true : never = true
    expect(listMigrationSql()).toContain('drop table if exists public.worker_profiles_districts_backup_x3')
    expect(backupTableDropped).toBe(true)
  })

  it('Kael autonomy, guardrail, and knowledge RPC types match service-role boundaries', () => {
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

    expect(autonomyAudit.to_status).toBe('broadcasting')
    expect(guardrail.source).toBe('self_check')
    expect(chatRateArgs.p_user_id).toBeTruthy()
    expect(matchArgs.p_query_embedding).toContain('[')
    expect(applyKnowledgeArgs.p_admin_id).toBeTruthy()
    expect(atomicApprovalArgs.p_review_note).toBe('reviewed')
    expect(applyAutonomyArgs.p_gate_audit_id).toBe(auditId)
  })

  it('P10 admin queue and interaction logs carry escalation state', () => {
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

    expect(queue.queue_type).toBe('demanding_customer')
    expect(log.escalation_level).toBe('hard')
  })

  it('P11 worker cancellation taxonomy carries admin-tunable reason categories', () => {
    const reason = {
      code: 'higher_pay_elsewhere',
      category: 'suspicious',
      label_vi: 'Tho bao co viec khac tra cao hon',
      is_active: true,
      admin_tunable: true,
    } satisfies Database['public']['Tables']['worker_cancellation_reason_taxonomy']['Insert']

    expect(reason.category).toBe('suspicious')
  })

  it('P12 customer cancellation taxonomy and records carry Phase 0 policy fields', () => {
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

    expect(record.phase0_no_monetary_penalty).toBe(true)
  })

  it('P13 disputes and evidence snapshots carry locked neutral review fields', () => {
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

    expect(dispute.dispute_type).toBe('completion_rejected')
  })

  it('Q1 cost optimization baseline and metric tables carry telemetry state', () => {
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

    expect(baseline.sample_size).toBe(50)
    expect(metric.provider).toBe('perplexity')
  })
})

describe('RPC type requirements', () => {
  it('Kael learning promotion RPC returns candidate and rule ids', () => {
    type PromotionRow =
      Database['public']['Functions']['promote_learning_candidate']['Returns'][number]
    const row = {
      ok: true,
      error_code: 'UNUSED_ON_SUCCESS',
      candidate_id: '00000000-0000-0000-0000-000000000000',
      rule_id: '11111111-1111-4111-8111-111111111111',
      rule_version: 1,
    } satisfies PromotionRow

    expect(row.ok).toBe(true)
    expect(row.rule_version).toBe(1)
  })

  it('Kael learning rollback RPC returns rolled-back rule id', () => {
    type RollbackRow =
      Database['public']['Functions']['rollback_learning_rule']['Returns'][number]
    const row = {
      ok: true,
      error_code: 'UNUSED_ON_SUCCESS',
      rule_id: '11111111-1111-4111-8111-111111111111',
    } satisfies RollbackRow

    expect(row.ok).toBe(true)
    expect(row.rule_id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('Kael learning admin review RPCs return candidate review status', () => {
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

    expect(approved.rule_version).toBe(2)
    expect(atomicApproved.knowledge_version).toBe(3)
    expect(rejected.status).toBe('archived')
  })

  it('worker cancellation RPC return includes auto-reassignment fields', () => {
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

    expect(row.job_status).toBe('broadcasting')
    expect(row.admin_review_required).toBe(true)
  })

  it('customer cancellation RPC returns Case 4 policy fields', () => {
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

    expect(row.phase0_no_monetary_penalty).toBe(true)
  })

  it('dispute RPCs return evidence lock and admin-review fields', () => {
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

    expect(decided.dispute_status).toBe('admin_decided')
  })
})

describe('Type helper smoke tests', () => {
  it('jobs types include idempotency, apartment access, and frozen payment columns', () => {
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

    expect(job.worker_net).toBe(job.gross_amount - job.platform_fee)
  })

  it('Tables<"jobs"> resolves to jobs Row type', () => {
    type JobRow = Tables<'jobs'>
    const _check: JobRow = {} as Database['public']['Tables']['jobs']['Row']
    expect(true).toBe(true)
  })

  it('TablesInsert<"jobs"> resolves to jobs Insert type', () => {
    type JobInsert = TablesInsert<'jobs'>
    const _check: JobInsert = {} as Database['public']['Tables']['jobs']['Insert']
    expect(true).toBe(true)
  })

  it('TablesUpdate<"jobs"> resolves to jobs Update type', () => {
    type JobUpdate = TablesUpdate<'jobs'>
    const _check: JobUpdate = {} as Database['public']['Tables']['jobs']['Update']
    expect(true).toBe(true)
  })

  it('Enums<"service_type"> resolves to service_type enum', () => {
    type ServiceType = Enums<'service_type'>
    const _check: ServiceType = 'electrical'
    expect(_check).toBe('electrical')
  })
})
