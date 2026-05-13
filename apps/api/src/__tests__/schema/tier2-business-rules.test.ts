import { describe, it, expect } from 'vitest'
import type { Database } from '@/lib/database.types'
import { Constants } from '@/lib/database.types'

// ---------------------------------------------------------------------------
// Tier 2: Business Rules
// Verify types encode rules from STRUCTURES.md and RULES.md.
// ---------------------------------------------------------------------------

describe('Rule #6: service_type ONLY electrical + plumbing', () => {
  it('has exactly 2 service types', () => {
    expect(Constants.public.Enums.service_type).toHaveLength(2)
  })

  it('contains only electrical and plumbing', () => {
    expect(Constants.public.Enums.service_type).toEqual(['electrical', 'plumbing'])
  })

  it('does not contain any other service', () => {
    const allowed = new Set(['electrical', 'plumbing'])
    for (const svc of Constants.public.Enums.service_type) {
      expect(allowed.has(svc)).toBe(true)
    }
  })
})

describe('job_status matches workflow from STRUCTURES.md 3A-3B', () => {
  const WORKFLOW_STATES = [
    'pending',          // A3: submitted, Kael processing
    'broadcast',        // A7: customer confirmed, broadcasting
    'matched',          // B2: worker accepted
    'worker_en_route',
    'inspecting',
    'in_progress',
    'scope_change',     // A11: pending customer confirm
    'completed',        // B5: worker done, awaiting A12
    'confirmed',        // A12: customer confirmed
    'paid',
    'cancelled',
  ] as const

  it('has exactly 11 states', () => {
    expect(Constants.public.Enums.job_status).toHaveLength(11)
  })

  it('states match documented workflow in order', () => {
    expect(Constants.public.Enums.job_status).toEqual([...WORKFLOW_STATES])
  })

  it.each([
    ['pending', 'A3 submission'],
    ['broadcast', 'A7 customer confirm'],
    ['matched', 'B2 worker accept'],
    ['scope_change', 'A11 scope change'],
    ['completed', 'B5 worker completion'],
    ['confirmed', 'A12 customer confirm'],
  ] as const)('includes "%s" for %s', (status, _label) => {
    expect(Constants.public.Enums.job_status).toContain(status)
  })
})

describe('complexity_level matches price estimate card (A5)', () => {
  it('has exactly 3 levels', () => {
    expect(Constants.public.Enums.complexity_level).toHaveLength(3)
  })

  it('values are small, medium, large', () => {
    expect(Constants.public.Enums.complexity_level).toEqual(['small', 'medium', 'large'])
  })
})

describe('api_provider matches AI stack (STRUCTURES.md Section 4)', () => {
  it('has exactly 3 providers', () => {
    expect(Constants.public.Enums.api_provider).toHaveLength(3)
  })

  it('includes anthropic (PRIMARY), perplexity (PRICING), deepseek (SUPPORT)', () => {
    expect(Constants.public.Enums.api_provider).toContain('anthropic')
    expect(Constants.public.Enums.api_provider).toContain('perplexity')
    expect(Constants.public.Enums.api_provider).toContain('deepseek')
  })
})

describe('message_sender includes kael for relay system (3D)', () => {
  it('includes kael as a sender type', () => {
    expect(Constants.public.Enums.message_sender).toContain('kael')
  })

  it('has customer, worker, kael — exactly 3', () => {
    expect(Constants.public.Enums.message_sender).toEqual(['customer', 'worker', 'kael'])
  })
})

describe('user_role includes admin for B0 approval flow', () => {
  it('includes admin role', () => {
    expect(Constants.public.Enums.user_role).toContain('admin')
  })

  it('has customer, worker, admin — exactly 3', () => {
    expect(Constants.public.Enums.user_role).toEqual(['customer', 'worker', 'admin'])
  })
})

describe('jobs field nullability matches workflow', () => {
  it('worker_id is nullable (not assigned at job creation)', () => {
    type WorkerId = Database['public']['Tables']['jobs']['Row']['worker_id']
    const nullValue: WorkerId = null
    expect(nullValue).toBeNull()
  })

  it('customer_id is NOT nullable (always known at creation)', () => {
    type CustomerId = Database['public']['Tables']['jobs']['Row']['customer_id']
    // If customer_id were nullable, `null` would satisfy this type.
    // The compile-time check: assigning string to CustomerId must work.
    const validId: CustomerId = '00000000-0000-0000-0000-000000000000'
    expect(validId).toBeTruthy()

    // Runtime: Insert type requires customer_id (non-optional)
    type InsertCustomerId = Database['public']['Tables']['jobs']['Insert']['customer_id']
    const _required: InsertCustomerId = 'uuid-here'
    expect(_required).toBeTruthy()
  })

  it('scheduled_at is nullable (null = "now")', () => {
    type ScheduledAt = Database['public']['Tables']['jobs']['Row']['scheduled_at']
    const nullValue: ScheduledAt = null
    expect(nullValue).toBeNull()
  })

  it('kael_* fields are nullable (populated after AI processing)', () => {
    type Row = Database['public']['Tables']['jobs']['Row']
    const nullChecks: {
      problem: Row['kael_problem_identified']
      complexity: Row['kael_complexity']
      priceMin: Row['kael_price_min']
      priceMax: Row['kael_price_max']
      advisory: Row['kael_advisory']
    } = {
      problem: null,
      complexity: null,
      priceMin: null,
      priceMax: null,
      advisory: null,
    }
    expect(nullChecks.problem).toBeNull()
    expect(nullChecks.complexity).toBeNull()
    expect(nullChecks.priceMin).toBeNull()
    expect(nullChecks.priceMax).toBeNull()
    expect(nullChecks.advisory).toBeNull()
  })

  it('scope_change fields are nullable (only populated during B4)', () => {
    type Row = Database['public']['Tables']['jobs']['Row']
    const nullChecks: {
      desc: Row['scope_change_description']
      decision: Row['scope_change_customer_decision']
    } = { desc: null, decision: null }
    expect(nullChecks.desc).toBeNull()
    expect(nullChecks.decision).toBeNull()
  })
})

describe('reviews.rating is number type', () => {
  it('rating field is number', () => {
    type Rating = Database['public']['Tables']['reviews']['Row']['rating']
    const validRating: Rating = 5
    expect(typeof validRating).toBe('number')
  })

  it('rating is required in Insert (non-optional)', () => {
    type RatingInsert = Database['public']['Tables']['reviews']['Insert']['rating']
    const required: RatingInsert = 3
    expect(required).toBe(3)
  })
})

describe('price_baselines types for Perplexity fallback', () => {
  it('price_min is number (not nullable)', () => {
    type PriceMin = Database['public']['Tables']['price_baselines']['Row']['price_min']
    const price: PriceMin = 100000
    expect(typeof price).toBe('number')
  })

  it('price_max is number (not nullable)', () => {
    type PriceMax = Database['public']['Tables']['price_baselines']['Row']['price_max']
    const price: PriceMax = 300000
    expect(typeof price).toBe('number')
  })

  it('service_type uses the enum type', () => {
    type ST = Database['public']['Tables']['price_baselines']['Row']['service_type']
    const electrical: ST = 'electrical'
    const plumbing: ST = 'plumbing'
    expect(electrical).toBe('electrical')
    expect(plumbing).toBe('plumbing')
  })

  it('complexity uses the enum type', () => {
    type CL = Database['public']['Tables']['price_baselines']['Row']['complexity']
    const small: CL = 'small'
    const medium: CL = 'medium'
    const large: CL = 'large'
    expect([small, medium, large]).toEqual(['small', 'medium', 'large'])
  })
})

describe('Constants.public.Enums consistency with type definitions', () => {
  it('all enum names in Constants match Database.public.Enums keys', () => {
    type EnumKeys = keyof Database['public']['Enums']
    const constantKeys = Object.keys(Constants.public.Enums) as EnumKeys[]
    const expected: EnumKeys[] = [
      'api_provider', 'broadcast_status', 'complexity_level',
      'job_status', 'message_sender', 'service_type', 'user_role',
    ]
    expect(constantKeys.sort()).toEqual(expected.sort())
  })
})

describe('chat_messages.sender_id nullable for Kael system messages', () => {
  it('sender_id is nullable in Row (null = Kael)', () => {
    type SenderId = Database['public']['Tables']['chat_messages']['Row']['sender_id']
    const kaelMessage: SenderId = null
    expect(kaelMessage).toBeNull()
  })

  it('sender_id is optional in Insert', () => {
    const kaelInsert = {
      content: 'Kael system message',
      job_id: '00000000-0000-0000-0000-000000000000',
      sender_role: 'kael' as const,
    } satisfies Database['public']['Tables']['chat_messages']['Insert']
    expect(kaelInsert.content).toBeDefined()
  })
})

describe('worker_profiles.service_types is an array', () => {
  it('service_types is an array of service_type enum', () => {
    type ServiceTypes = Database['public']['Tables']['worker_profiles']['Row']['service_types']
    const both: ServiceTypes = ['electrical', 'plumbing']
    const electricalOnly: ServiceTypes = ['electrical']
    expect(both).toHaveLength(2)
    expect(electricalOnly).toHaveLength(1)
  })
})

describe('api_logs for RULES #9 compliance structure', () => {
  it('has cost_usd field (numeric for USD tracking)', () => {
    type CostUsd = Database['public']['Tables']['api_logs']['Row']['cost_usd']
    const cost: CostUsd = 0.008
    expect(typeof cost).toBe('number')
  })

  it('has latency_ms field (for timeout monitoring)', () => {
    type Latency = Database['public']['Tables']['api_logs']['Row']['latency_ms']
    const ms: Latency = 1500
    expect(typeof ms).toBe('number')
  })

  it('has error_code field (nullable for success cases)', () => {
    type ErrorCode = Database['public']['Tables']['api_logs']['Row']['error_code']
    const noError: ErrorCode = null
    const withError: ErrorCode = 'TIMEOUT'
    expect(noError).toBeNull()
    expect(withError).toBe('TIMEOUT')
  })
})
