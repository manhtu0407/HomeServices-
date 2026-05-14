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
    expect(EXPECTED_TABLES).toHaveLength(17)
  })

  it.each(EXPECTED_TABLES)('table "%s" is a valid generated table key', (name) => {
    const tableName: TableNames = name
    expect(tableName).toBeTruthy()
  })
})

describe('Database.public.Enums completeness', () => {
  it('has all workflow and learning enums', () => {
    expect(Object.keys(Constants.public.Enums).sort()).toEqual([...EXPECTED_ENUMS].sort())
  })

  it.each(EXPECTED_ENUMS)('enum "%s" exists in Constants', (name) => {
    expect(Constants.public.Enums).toHaveProperty(name)
  })
})

describe('Core enum values', () => {
  it('service_type remains scoped to electrical and plumbing', () => {
    expect(Constants.public.Enums.service_type).toEqual(['electrical', 'plumbing'])
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
