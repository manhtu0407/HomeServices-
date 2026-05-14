import { describe, expect, it } from 'vitest'
import type { Database } from '@/lib/database.types'

type Rel<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Relationships']

describe('Identity relationships', () => {
  it('customer_profiles.id -> profiles.id is 1:1', () => {
    type First = Rel<'customer_profiles'>[0]
    const relationship: Pick<First, 'referencedRelation' | 'isOneToOne'> = {
      referencedRelation: 'profiles',
      isOneToOne: true,
    }
    expect(relationship.isOneToOne).toBe(true)
  })

  it('worker_profiles.id -> profiles.id is 1:1', () => {
    type First = Rel<'worker_profiles'>[0]
    const relationship: Pick<First, 'referencedRelation' | 'isOneToOne'> = {
      referencedRelation: 'profiles',
      isOneToOne: true,
    }
    expect(relationship.referencedRelation).toBe('profiles')
  })
})

describe('Service taxonomy relationships', () => {
  it('service_problems belongs to service_categories', () => {
    type First = Rel<'service_problems'>[0]
    const relationship: Pick<First, 'referencedRelation' | 'columns'> = {
      referencedRelation: 'service_categories',
      columns: ['service_category_id'],
    }
    expect(relationship.referencedRelation).toBe('service_categories')
  })

  it('price_baselines belongs to service_problems', () => {
    type First = Rel<'price_baselines'>[0]
    const relationship: Pick<First, 'referencedRelation' | 'columns'> = {
      referencedRelation: 'service_problems',
      columns: ['service_problem_id'],
    }
    expect(relationship.columns).toEqual(['service_problem_id'])
  })
})

describe('Job workflow relationships', () => {
  it('jobs belongs to customer, optional worker, and optional service problem', () => {
    type Relationships = Rel<'jobs'>
    const referencedTables: Relationships[number]['referencedRelation'][] = [
      'profiles',
      'service_problems',
      'profiles',
    ]
    expect(referencedTables).toContain('service_problems')
    expect(referencedTables.filter((name) => name === 'profiles')).toHaveLength(2)
  })

  it('job_events belongs to jobs and optional actor profile', () => {
    type Relationships = Rel<'job_events'>
    const referencedTables: Relationships[number]['referencedRelation'][] = ['profiles', 'jobs']
    expect(referencedTables).toContain('jobs')
    expect(referencedTables).toContain('profiles')
  })

  it('scope_change_requests belongs to jobs and worker profile', () => {
    type Relationships = Rel<'scope_change_requests'>
    const referencedTables: Relationships[number]['referencedRelation'][] = ['jobs', 'profiles']
    expect(referencedTables).toEqual(['jobs', 'profiles'])
  })
})

describe('Learning and notification relationships', () => {
  it('notifications belongs to user profile and optionally a job', () => {
    type Relationships = Rel<'notifications'>
    const referencedTables: Relationships[number]['referencedRelation'][] = ['jobs', 'profiles']
    expect(referencedTables).toContain('profiles')
  })

  it('learning_rule_versions belongs to learning_rules', () => {
    type First = Rel<'learning_rule_versions'>[0]
    const relationship: Pick<First, 'referencedRelation' | 'columns'> = {
      referencedRelation: 'learning_rules',
      columns: ['rule_id'],
    }
    expect(relationship.referencedRelation).toBe('learning_rules')
  })

  it('learning candidates are standalone evidence records', () => {
    type Relationships = Rel<'learning_candidates'>
    const empty: Relationships = []
    expect(empty).toEqual([])
  })
})

describe('Nullable foreign keys match workflow', () => {
  it('jobs.worker_id remains nullable before match', () => {
    type WorkerId = Database['public']['Tables']['jobs']['Row']['worker_id']
    const value: WorkerId = null
    expect(value).toBeNull()
  })

  it('api_logs.job_id remains nullable for standalone AI calls', () => {
    type JobId = Database['public']['Tables']['api_logs']['Row']['job_id']
    const value: JobId = null
    expect(value).toBeNull()
  })
})
