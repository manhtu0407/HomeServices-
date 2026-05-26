import { describe, expect, it } from 'vitest'
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '@/lib/database.types'
import { Constants } from '@/lib/database.types'

type TableNames = keyof Database['public']['Tables']
type EnumNames = keyof Database['public']['Enums']

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
  'kael_analysis_artifacts',
  'kael_chat_sessions',
  'kael_chat_turns',
  'device_push_tokens',
  'worker_cancellation_requests',
  'ai_provider_routing',
  'customer_kael_memory',
  'worker_kael_memory',
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
    expect(EXPECTED_TABLES).toHaveLength(46)
  })

  it.each(EXPECTED_TABLES)('table "%s" is a valid generated table key', (name) => {
    const tableName: TableNames = name
    expect(tableName).toBeTruthy()
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
  it('service_type remains scoped to electrical, plumbing, and cleaning', () => {
    expect(Constants.public.Enums.service_type).toEqual(['electrical', 'plumbing', 'cleaning'])
  })

  it('job_status matches STRUCTURES.md workflow', () => {
    expect(Constants.public.Enums.job_status).toEqual([
      'draft',
      'analyzing',
      'estimate_ready',
      'awaiting_customer_confirm',
      'broadcasting',
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

  it('P10 admin queue and interaction logs carry escalation state', () => {
    const queue = {
      actor_role: 'customer',
      queue_type: 'demanding_customer',
      priority: 'high',
      escalation_level: 'hard',
      reason_code: 'threat_complaint',
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
      kael_neutral_summary: 'Fact-only summary for admin review.',
      admin_review: { priority: 'high' },
      status: 'open',
    } satisfies Database['public']['Tables']['disputes']['Insert']

    expect(dispute.dispute_type).toBe('completion_rejected')
  })
})

describe('RPC type requirements', () => {
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
