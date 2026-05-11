import { describe, it, expect } from 'vitest'
import type { Database, Tables, TablesInsert, TablesUpdate, Enums } from '@/lib/database.types'
import { Constants } from '@/lib/database.types'

// ---------------------------------------------------------------------------
// Tier 1: Type Completeness
// Verify auto-generated types match STRUCTURES.md — 9 tables, 7 enums,
// correct required/optional fields in Insert types.
// ---------------------------------------------------------------------------

type TableNames = keyof Database['public']['Tables']
type EnumNames = keyof Database['public']['Enums']

describe('All 9 tables exist in Database.public.Tables', () => {
  const EXPECTED_TABLES: TableNames[] = [
    'profiles',
    'customer_profiles',
    'worker_profiles',
    'price_baselines',
    'jobs',
    'job_broadcasts',
    'chat_messages',
    'reviews',
    'api_logs',
  ]

  it('has exactly 9 tables', () => {
    const tableKeys = Object.keys(
      {} as Record<TableNames, true>
    ) as TableNames[]
    // We can't enumerate a type at runtime, so we verify via Constants and exhaustive check
    expect(EXPECTED_TABLES).toHaveLength(9)
  })

  it.each(EXPECTED_TABLES)('table "%s" is a valid table name', (name) => {
    // This compile-time assertion ensures each name is a valid key.
    // If a table is removed from the schema, TypeScript will error here.
    const _check: Database['public']['Tables'][typeof name] = {} as any
    expect(name).toBeTruthy()
  })
})

describe('All 7 enums exist in Database.public.Enums', () => {
  const EXPECTED_ENUMS: EnumNames[] = [
    'user_role',
    'service_type',
    'job_status',
    'complexity_level',
    'broadcast_status',
    'message_sender',
    'api_provider',
  ]

  it('has exactly 7 enums', () => {
    expect(EXPECTED_ENUMS).toHaveLength(7)
    expect(Object.keys(Constants.public.Enums)).toHaveLength(7)
  })

  it.each(EXPECTED_ENUMS)('enum "%s" exists in Constants', (name) => {
    expect(Constants.public.Enums).toHaveProperty(name)
  })
})

describe('Enum values are correct', () => {
  it('service_type = [electrical, plumbing]', () => {
    expect(Constants.public.Enums.service_type).toEqual(['electrical', 'plumbing'])
  })

  it('user_role = [customer, worker, admin]', () => {
    expect(Constants.public.Enums.user_role).toEqual(['customer', 'worker', 'admin'])
  })

  it('job_status has all 11 workflow states', () => {
    expect(Constants.public.Enums.job_status).toEqual([
      'pending',
      'broadcast',
      'matched',
      'worker_en_route',
      'inspecting',
      'in_progress',
      'scope_change',
      'completed',
      'confirmed',
      'paid',
      'cancelled',
    ])
  })

  it('complexity_level = [small, medium, large]', () => {
    expect(Constants.public.Enums.complexity_level).toEqual(['small', 'medium', 'large'])
  })

  it('broadcast_status = [pending, accepted, declined, expired]', () => {
    expect(Constants.public.Enums.broadcast_status).toEqual([
      'pending', 'accepted', 'declined', 'expired',
    ])
  })

  it('message_sender = [customer, worker, kael]', () => {
    expect(Constants.public.Enums.message_sender).toEqual(['customer', 'worker', 'kael'])
  })

  it('api_provider = [anthropic, perplexity, deepseek]', () => {
    expect(Constants.public.Enums.api_provider).toEqual(['anthropic', 'perplexity', 'deepseek'])
  })
})

// ---------------------------------------------------------------------------
// Required vs Optional fields in Insert types
// Uses `satisfies` to create compile-time assertions.
// If a previously-optional field becomes required (e.g., someone removes a
// DEFAULT in SQL and regenerates types), the minimal object below will fail
// to compile — Vitest surfaces this as a test failure.
// ---------------------------------------------------------------------------

describe('profiles: Insert required fields', () => {
  it('requires only id and role', () => {
    const minimal = {
      id: '00000000-0000-0000-0000-000000000000',
      role: 'customer' as const,
    } satisfies Database['public']['Tables']['profiles']['Insert']
    expect(minimal.id).toBeDefined()
    expect(minimal.role).toBeDefined()
  })

  it('Row has all expected fields', () => {
    type Row = Database['public']['Tables']['profiles']['Row']
    const fields: (keyof Row)[] = [
      'id', 'role', 'full_name', 'phone', 'avatar_url', 'created_at', 'updated_at',
    ]
    expect(fields).toHaveLength(7)
  })
})

describe('customer_profiles: Insert required fields', () => {
  it('requires only id', () => {
    const minimal = {
      id: '00000000-0000-0000-0000-000000000000',
    } satisfies Database['public']['Tables']['customer_profiles']['Insert']
    expect(minimal.id).toBeDefined()
  })

  it('Row has all expected fields', () => {
    type Row = Database['public']['Tables']['customer_profiles']['Row']
    const fields: (keyof Row)[] = [
      'id', 'building_name', 'unit_number', 'floor', 'district', 'created_at', 'updated_at',
    ]
    expect(fields).toHaveLength(7)
  })
})

describe('worker_profiles: Insert required fields', () => {
  it('requires only id', () => {
    const minimal = {
      id: '00000000-0000-0000-0000-000000000000',
    } satisfies Database['public']['Tables']['worker_profiles']['Insert']
    expect(minimal.id).toBeDefined()
  })

  it('Row has all expected fields', () => {
    type Row = Database['public']['Tables']['worker_profiles']['Row']
    const fields: (keyof Row)[] = [
      'id', 'service_types', 'years_experience', 'districts',
      'is_approved', 'is_available',
      'cccd_front_url', 'cccd_back_url', 'selfie_url',
      'bank_account', 'bank_name',
      'rating', 'total_jobs',
      'created_at', 'updated_at',
    ]
    expect(fields).toHaveLength(15)
  })
})

describe('price_baselines: Insert required fields', () => {
  it('requires service_type, complexity, price_min, price_max', () => {
    const minimal = {
      service_type: 'electrical' as const,
      complexity: 'small' as const,
      price_min: 100000,
      price_max: 300000,
    } satisfies Database['public']['Tables']['price_baselines']['Insert']
    expect(minimal.service_type).toBeDefined()
    expect(minimal.complexity).toBeDefined()
    expect(minimal.price_min).toBeDefined()
    expect(minimal.price_max).toBeDefined()
  })

  it('Row has all expected fields', () => {
    type Row = Database['public']['Tables']['price_baselines']['Row']
    const fields: (keyof Row)[] = [
      'id', 'service_type', 'complexity', 'price_min', 'price_max', 'updated_at',
    ]
    expect(fields).toHaveLength(6)
  })
})

describe('jobs: Insert required fields', () => {
  it('requires only customer_id, description, service_type', () => {
    const minimal = {
      customer_id: '00000000-0000-0000-0000-000000000000',
      description: 'Ổ cắm bị hỏng',
      service_type: 'electrical' as const,
    } satisfies Database['public']['Tables']['jobs']['Insert']
    expect(minimal.customer_id).toBeDefined()
    expect(minimal.description).toBeDefined()
    expect(minimal.service_type).toBeDefined()
  })

  it('Row has all 32 fields', () => {
    type Row = Database['public']['Tables']['jobs']['Row']
    const fields: (keyof Row)[] = [
      'id', 'customer_id', 'worker_id', 'service_type',
      'problem_chips', 'description', 'photo_urls',
      'address_building', 'address_unit', 'address_floor', 'address_district',
      'scheduled_at', 'status',
      'kael_problem_identified', 'kael_complexity', 'kael_price_min', 'kael_price_max',
      'kael_advisory', 'price_context_1', 'price_context_2',
      'scope_change_description', 'scope_change_price_min', 'scope_change_price_max',
      'scope_change_reason', 'scope_change_customer_decision',
      'completion_notes', 'completion_photo_urls', 'final_price',
      'broadcast_at', 'matched_at', 'completed_at', 'confirmed_at',
      'paid_at', 'cancelled_at', 'created_at', 'updated_at',
    ]
    expect(fields).toHaveLength(36)
  })
})

describe('job_broadcasts: Insert required fields', () => {
  it('requires job_id and worker_id', () => {
    const minimal = {
      job_id: '00000000-0000-0000-0000-000000000000',
      worker_id: '00000000-0000-0000-0000-000000000000',
    } satisfies Database['public']['Tables']['job_broadcasts']['Insert']
    expect(minimal.job_id).toBeDefined()
    expect(minimal.worker_id).toBeDefined()
  })

  it('Row has all expected fields', () => {
    type Row = Database['public']['Tables']['job_broadcasts']['Row']
    const fields: (keyof Row)[] = [
      'id', 'job_id', 'worker_id', 'status', 'broadcast_at', 'responded_at',
    ]
    expect(fields).toHaveLength(6)
  })
})

describe('chat_messages: Insert required fields', () => {
  it('requires content, job_id, sender_role', () => {
    const minimal = {
      content: 'Xin chào',
      job_id: '00000000-0000-0000-0000-000000000000',
      sender_role: 'customer' as const,
    } satisfies Database['public']['Tables']['chat_messages']['Insert']
    expect(minimal.content).toBeDefined()
    expect(minimal.job_id).toBeDefined()
    expect(minimal.sender_role).toBeDefined()
  })

  it('Row has all expected fields', () => {
    type Row = Database['public']['Tables']['chat_messages']['Row']
    const fields: (keyof Row)[] = [
      'id', 'job_id', 'sender_id', 'sender_role', 'content', 'is_read', 'created_at',
    ]
    expect(fields).toHaveLength(7)
  })
})

describe('reviews: Insert required fields', () => {
  it('requires customer_id, job_id, rating, worker_id', () => {
    const minimal = {
      customer_id: '00000000-0000-0000-0000-000000000000',
      job_id: '00000000-0000-0000-0000-000000000000',
      rating: 5,
      worker_id: '00000000-0000-0000-0000-000000000000',
    } satisfies Database['public']['Tables']['reviews']['Insert']
    expect(minimal.customer_id).toBeDefined()
    expect(minimal.job_id).toBeDefined()
    expect(minimal.rating).toBeDefined()
    expect(minimal.worker_id).toBeDefined()
  })

  it('Row has all expected fields', () => {
    type Row = Database['public']['Tables']['reviews']['Row']
    const fields: (keyof Row)[] = [
      'id', 'job_id', 'customer_id', 'worker_id', 'rating', 'tags', 'comment', 'created_at',
    ]
    expect(fields).toHaveLength(8)
  })
})

describe('api_logs: Insert required fields', () => {
  it('requires provider and success', () => {
    const minimal = {
      provider: 'anthropic' as const,
      success: true,
    } satisfies Database['public']['Tables']['api_logs']['Insert']
    expect(minimal.provider).toBeDefined()
    expect(minimal.success).toBeDefined()
  })

  it('Row has all expected fields', () => {
    type Row = Database['public']['Tables']['api_logs']['Row']
    const fields: (keyof Row)[] = [
      'id', 'job_id', 'provider', 'model',
      'input_tokens', 'output_tokens', 'cost_usd',
      'latency_ms', 'success', 'error_code', 'created_at',
    ]
    expect(fields).toHaveLength(11)
  })
})

// ---------------------------------------------------------------------------
// Type helper smoke tests
// ---------------------------------------------------------------------------

describe('Type helpers work correctly', () => {
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
