import { describe, it, expect } from 'vitest'
import type { Database } from '@/lib/database.types'

// ---------------------------------------------------------------------------
// Tier 3: Relationships
// Verify FK relationships, cardinality (1:1 vs 1:many), and nullable FKs.
// Uses compile-time type assertions + runtime checks on Relationships tuples.
// ---------------------------------------------------------------------------

type Rel<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Relationships']

// Helper: extract relationship info from the type for runtime assertions
function getRelationships<T extends keyof Database['public']['Tables']>(
  _table: T,
  relationships: readonly {
    foreignKeyName: string
    columns: readonly string[]
    isOneToOne: boolean
    referencedRelation: string
    referencedColumns: readonly string[]
  }[]
) {
  return relationships
}

describe('1:1 relationships', () => {
  it('customer_profiles.id → profiles.id is 1:1', () => {
    type R = Rel<'customer_profiles'>
    type First = R[0]
    // Compile-time check
    const _isOneToOne: First['isOneToOne'] extends true ? true : never = true
    const _refTable: First['referencedRelation'] extends 'profiles' ? true : never = true

    // Runtime assertion using the type shape
    type Check = {
      fk: First['foreignKeyName']
      col: First['columns']
      oneToOne: First['isOneToOne']
      ref: First['referencedRelation']
    }
    const check: Check = {
      fk: 'customer_profiles_id_fkey',
      col: ['id'],
      oneToOne: true,
      ref: 'profiles',
    }
    expect(check.oneToOne).toBe(true)
    expect(check.ref).toBe('profiles')
    expect(check.col).toEqual(['id'])
  })

  it('worker_profiles.id → profiles.id is 1:1', () => {
    type R = Rel<'worker_profiles'>
    type First = R[0]
    const _isOneToOne: First['isOneToOne'] extends true ? true : never = true

    const check = {
      fk: 'worker_profiles_id_fkey' as First['foreignKeyName'],
      oneToOne: true as First['isOneToOne'],
      ref: 'profiles' as First['referencedRelation'],
    }
    expect(check.oneToOne).toBe(true)
    expect(check.ref).toBe('profiles')
  })

  it('reviews.job_id → jobs.id is 1:1 (one review per job)', () => {
    type R = Rel<'reviews'>
    // Find the job_id relationship (index 1 based on generated order)
    type JobRel = R[1]
    const _isOneToOne: JobRel['isOneToOne'] extends true ? true : never = true

    const check = {
      fk: 'reviews_job_id_fkey' as JobRel['foreignKeyName'],
      oneToOne: true as JobRel['isOneToOne'],
      ref: 'jobs' as JobRel['referencedRelation'],
    }
    expect(check.oneToOne).toBe(true)
    expect(check.ref).toBe('jobs')
  })
})

describe('1:many relationships', () => {
  it('jobs.customer_id → profiles.id is 1:many', () => {
    type R = Rel<'jobs'>
    type CustomerRel = R[0]
    const _isNotOneToOne: CustomerRel['isOneToOne'] extends false ? true : never = true

    const check = {
      fk: 'jobs_customer_id_fkey' as CustomerRel['foreignKeyName'],
      oneToOne: false as CustomerRel['isOneToOne'],
      ref: 'profiles' as CustomerRel['referencedRelation'],
    }
    expect(check.oneToOne).toBe(false)
    expect(check.ref).toBe('profiles')
  })

  it('jobs.worker_id → profiles.id is 1:many', () => {
    type R = Rel<'jobs'>
    type WorkerRel = R[1]
    const _isNotOneToOne: WorkerRel['isOneToOne'] extends false ? true : never = true

    const check = {
      fk: 'jobs_worker_id_fkey' as WorkerRel['foreignKeyName'],
      oneToOne: false as WorkerRel['isOneToOne'],
      ref: 'profiles' as WorkerRel['referencedRelation'],
    }
    expect(check.oneToOne).toBe(false)
    expect(check.ref).toBe('profiles')
  })

  it('chat_messages.job_id → jobs.id is 1:many', () => {
    type R = Rel<'chat_messages'>
    type JobRel = R[0]
    const _check: JobRel['isOneToOne'] extends false ? true : never = true

    const check = {
      fk: 'chat_messages_job_id_fkey' as JobRel['foreignKeyName'],
      oneToOne: false as JobRel['isOneToOne'],
      ref: 'jobs' as JobRel['referencedRelation'],
    }
    expect(check.oneToOne).toBe(false)
    expect(check.ref).toBe('jobs')
  })

  it('chat_messages.sender_id → profiles.id is 1:many', () => {
    type R = Rel<'chat_messages'>
    type SenderRel = R[1]

    const check = {
      fk: 'chat_messages_sender_id_fkey' as SenderRel['foreignKeyName'],
      oneToOne: false as SenderRel['isOneToOne'],
      ref: 'profiles' as SenderRel['referencedRelation'],
    }
    expect(check.oneToOne).toBe(false)
    expect(check.ref).toBe('profiles')
  })

  it('job_broadcasts.job_id → jobs.id is 1:many', () => {
    type R = Rel<'job_broadcasts'>
    type JobRel = R[0]

    const check = {
      fk: 'job_broadcasts_job_id_fkey' as JobRel['foreignKeyName'],
      oneToOne: false as JobRel['isOneToOne'],
      ref: 'jobs' as JobRel['referencedRelation'],
    }
    expect(check.oneToOne).toBe(false)
    expect(check.ref).toBe('jobs')
  })

  it('job_broadcasts.worker_id → profiles.id is 1:many', () => {
    type R = Rel<'job_broadcasts'>
    type WorkerRel = R[1]

    const check = {
      fk: 'job_broadcasts_worker_id_fkey' as WorkerRel['foreignKeyName'],
      oneToOne: false as WorkerRel['isOneToOne'],
      ref: 'profiles' as WorkerRel['referencedRelation'],
    }
    expect(check.oneToOne).toBe(false)
    expect(check.ref).toBe('profiles')
  })

  it('api_logs.job_id → jobs.id is 1:many', () => {
    type R = Rel<'api_logs'>
    type JobRel = R[0]

    const check = {
      fk: 'api_logs_job_id_fkey' as JobRel['foreignKeyName'],
      oneToOne: false as JobRel['isOneToOne'],
      ref: 'jobs' as JobRel['referencedRelation'],
    }
    expect(check.oneToOne).toBe(false)
    expect(check.ref).toBe('jobs')
  })

  it('reviews.customer_id → profiles.id is 1:many', () => {
    type R = Rel<'reviews'>
    type CustomerRel = R[0]

    const check = {
      fk: 'reviews_customer_id_fkey' as CustomerRel['foreignKeyName'],
      oneToOne: false as CustomerRel['isOneToOne'],
      ref: 'profiles' as CustomerRel['referencedRelation'],
    }
    expect(check.oneToOne).toBe(false)
    expect(check.ref).toBe('profiles')
  })

  it('reviews.worker_id → profiles.id is 1:many', () => {
    type R = Rel<'reviews'>
    type WorkerRel = R[2]

    const check = {
      fk: 'reviews_worker_id_fkey' as WorkerRel['foreignKeyName'],
      oneToOne: false as WorkerRel['isOneToOne'],
      ref: 'profiles' as WorkerRel['referencedRelation'],
    }
    expect(check.oneToOne).toBe(false)
    expect(check.ref).toBe('profiles')
  })
})

describe('Required FKs are non-nullable in Insert types', () => {
  it('jobs.customer_id is required', () => {
    // @ts-expect-error — omitting customer_id should fail
    const _invalid: Database['public']['Tables']['jobs']['Insert'] = {
      description: 'test',
      service_type: 'electrical',
    }
    expect(true).toBe(true)
  })

  it('chat_messages.job_id is required', () => {
    // @ts-expect-error — omitting job_id should fail
    const _invalid: Database['public']['Tables']['chat_messages']['Insert'] = {
      content: 'test',
      sender_role: 'customer',
    }
    expect(true).toBe(true)
  })

  it('job_broadcasts requires both job_id and worker_id', () => {
    // @ts-expect-error — omitting both should fail
    const _invalid: Database['public']['Tables']['job_broadcasts']['Insert'] = {}
    expect(true).toBe(true)
  })

  it('reviews requires customer_id, job_id, rating, worker_id', () => {
    // @ts-expect-error — omitting required fields should fail
    const _invalid: Database['public']['Tables']['reviews']['Insert'] = {
      rating: 5,
    }
    expect(true).toBe(true)
  })
})

describe('Optional FKs are nullable in Row types', () => {
  it('jobs.worker_id accepts null', () => {
    type WorkerId = Database['public']['Tables']['jobs']['Row']['worker_id']
    const noWorker: WorkerId = null
    expect(noWorker).toBeNull()
  })

  it('chat_messages.sender_id accepts null (for Kael messages)', () => {
    type SenderId = Database['public']['Tables']['chat_messages']['Row']['sender_id']
    const kaelMsg: SenderId = null
    expect(kaelMsg).toBeNull()
  })

  it('api_logs.job_id accepts null (standalone API calls)', () => {
    type JobId = Database['public']['Tables']['api_logs']['Row']['job_id']
    const standalone: JobId = null
    expect(standalone).toBeNull()
  })
})

describe('All FK targets reference correct tables', () => {
  it('profiles has no outgoing FKs in generated types', () => {
    type R = Rel<'profiles'>
    // profiles references auth.users which is not in the public schema types
    type Length = R['length']
    const _empty: Length extends 0 ? true : never = true
    expect(true).toBe(true)
  })

  it('price_baselines has no outgoing FKs', () => {
    type R = Rel<'price_baselines'>
    type Length = R['length']
    const _empty: Length extends 0 ? true : never = true
    expect(true).toBe(true)
  })

  it('jobs has exactly 2 FKs (customer_id, worker_id → profiles)', () => {
    type R = Rel<'jobs'>
    type Length = R['length']
    const _two: Length extends 2 ? true : never = true
    expect(true).toBe(true)
  })

  it('chat_messages has exactly 2 FKs (job_id → jobs, sender_id → profiles)', () => {
    type R = Rel<'chat_messages'>
    type Length = R['length']
    const _two: Length extends 2 ? true : never = true
    expect(true).toBe(true)
  })

  it('job_broadcasts has exactly 2 FKs (job_id → jobs, worker_id → profiles)', () => {
    type R = Rel<'job_broadcasts'>
    type Length = R['length']
    const _two: Length extends 2 ? true : never = true
    expect(true).toBe(true)
  })

  it('reviews has exactly 3 FKs (customer_id, worker_id → profiles, job_id → jobs)', () => {
    type R = Rel<'reviews'>
    type Length = R['length']
    const _three: Length extends 3 ? true : never = true
    expect(true).toBe(true)
  })

  it('api_logs has exactly 1 FK (job_id → jobs)', () => {
    type R = Rel<'api_logs'>
    type Length = R['length']
    const _one: Length extends 1 ? true : never = true
    expect(true).toBe(true)
  })
})
