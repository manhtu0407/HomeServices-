import { describe, expect, it } from 'vitest'
import type { Database } from '@/lib/database.types'
import { Constants } from '@/lib/database.types'

describe('Rule #6: supported services are hard-scoped', () => {
  it('contains only electrical and plumbing', () => {
    expect(Constants.public.Enums.service_type).toEqual(['electrical', 'plumbing'])
  })
})

describe('Job lifecycle matches STRUCTURES.md state machine', () => {
  const WORKFLOW_STATES = [
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
  ] as const

  it('has the full 17-state workflow', () => {
    expect(Constants.public.Enums.job_status).toEqual([...WORKFLOW_STATES])
  })

  it('contains explicit customer confirmation and scope-change gates', () => {
    expect(Constants.public.Enums.job_status).toContain('awaiting_customer_confirm')
    expect(Constants.public.Enums.job_status).toContain('scope_change_pending')
    expect(Constants.public.Enums.job_status).toContain('confirmed_by_customer')
  })
})

describe('Scope change is a dedicated state machine', () => {
  it('requires customer decision states', () => {
    expect(Constants.public.Enums.scope_change_status).toEqual([
      'requested_by_worker',
      'reviewing_by_kael',
      'waiting_customer_decision',
      'approved_by_customer',
      'rejected_by_customer',
      'cancelled',
    ])
  })

  it('scope_change_requests stores price and Kael review separately from jobs', () => {
    type Row = Database['public']['Tables']['scope_change_requests']['Row']
    const fields: (keyof Row)[] = [
      'job_id',
      'worker_id',
      'status',
      'price_min',
      'price_max',
      'kael_review',
      'customer_decision_at',
    ]
    expect(fields).toHaveLength(7)
  })
})

describe('Service taxonomy and price baselines', () => {
  it('service taxonomy is table-driven', () => {
    type Category = Database['public']['Tables']['service_categories']['Row']
    type Problem = Database['public']['Tables']['service_problems']['Row']

    const categorySlug: keyof Category = 'slug'
    const problemCategoryId: keyof Problem = 'service_category_id'

    expect(categorySlug).toBe('slug')
    expect(problemCategoryId).toBe('service_category_id')
  })

  it('price baseline links to service problem and district code', () => {
    type Row = Database['public']['Tables']['price_baselines']['Row']
    const baseline: Pick<Row, 'service_problem_id' | 'district_code' | 'version'> = {
      service_problem_id: '00000000-0000-0000-0000-000000000000',
      district_code: 'hcmc_all',
      version: 1,
    }
    expect(baseline.district_code).toBe('hcmc_all')
  })
})

describe('Kael learning boundaries', () => {
  it('learning candidate status encodes evidence gate flow', () => {
    expect(Constants.public.Enums.learning_candidate_status).toEqual([
      'created',
      'pending_evidence',
      'evidence_gate_passed',
      'auto_promoted',
      'rejected',
      'rolled_back',
      'archived',
    ])
  })

  it('learning rule status supports monitoring and rollback', () => {
    expect(Constants.public.Enums.learning_rule_status).toEqual([
      'draft',
      'active',
      'monitoring',
      'degraded',
      'disabled',
      'rolled_back',
    ])
  })

  it('learning candidates track confidence and evidence count', () => {
    type Row = Database['public']['Tables']['learning_candidates']['Row']
    const candidate: Pick<Row, 'confidence' | 'evidence_count' | 'status'> = {
      confidence: 0.9,
      evidence_count: 5,
      status: 'pending_evidence',
    }
    expect(candidate.evidence_count).toBeGreaterThanOrEqual(5)
  })
})

describe('AI and PII-safe logging structure', () => {
  it('api_logs has safe metadata and fallback tracking', () => {
    type Row = Database['public']['Tables']['api_logs']['Row']
    const logShape: Pick<Row, 'request_id' | 'purpose' | 'prompt_version' | 'fallback_used' | 'safe_metadata'> = {
      request_id: 'req_123',
      purpose: 'kael_price_check',
      prompt_version: 'kael-price-v1',
      fallback_used: false,
      safe_metadata: { service_type: 'electrical' },
    }
    expect(logShape.fallback_used).toBe(false)
  })
})

describe('Constants.public.Enums consistency', () => {
  it('all enum names in Constants match Database.public.Enums keys', () => {
    type EnumKeys = keyof Database['public']['Enums']
    const constantKeys = Object.keys(Constants.public.Enums) as EnumKeys[]
    const expected: EnumKeys[] = [
      'api_provider',
      'broadcast_status',
      'complexity_level',
      'job_status',
      'learning_candidate_status',
      'learning_rule_status',
      'message_sender',
      'notification_status',
      'scope_change_status',
      'service_type',
      'user_role',
      'worker_verification_status',
    ]
    expect(constantKeys.sort()).toEqual(expected.sort())
  })
})
