import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Tier 4: SQL Migration Validation
// Parse raw SQL text to verify structural properties invisible to TypeScript:
// RLS, indexes, seed data, constraints, triggers, security.
// ---------------------------------------------------------------------------

const SQL = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260511000000_init_schema.sql'),
  'utf-8'
)

describe('All 9 tables have RLS enabled', () => {
  const TABLES = [
    'profiles', 'customer_profiles', 'worker_profiles', 'price_baselines',
    'jobs', 'job_broadcasts', 'chat_messages', 'reviews', 'api_logs',
  ]

  it.each(TABLES)('"%s" has row level security enabled', (table) => {
    const pattern = new RegExp(
      `alter\\s+table\\s+${table}\\s+enable\\s+row\\s+level\\s+security`,
      'i'
    )
    expect(SQL).toMatch(pattern)
  })
})

describe('Expected indexes exist', () => {
  const INDEXES = [
    'jobs_customer_id_idx',
    'jobs_worker_id_idx',
    'jobs_status_idx',
    'jobs_created_at_idx',
    'job_broadcasts_job_id_idx',
    'job_broadcasts_worker_id_idx',
    'chat_messages_job_id_idx',
    'chat_messages_created_at_idx',
    'api_logs_job_id_idx',
    'api_logs_provider_idx',
    'api_logs_created_at_idx',
  ]

  it(`has exactly ${INDEXES.length} explicit indexes`, () => {
    const indexMatches = SQL.match(/create\s+index\s+\w+/gi) || []
    expect(indexMatches.length).toBe(INDEXES.length)
  })

  it.each(INDEXES)('index "%s" exists', (indexName) => {
    expect(SQL.toLowerCase()).toContain(`create index ${indexName}`)
  })
})

describe('Seed data for price_baselines', () => {
  it('has INSERT INTO price_baselines', () => {
    expect(SQL.toLowerCase()).toContain('insert into price_baselines')
  })

  const COMBOS = [
    { service: 'electrical', complexity: 'small' },
    { service: 'electrical', complexity: 'medium' },
    { service: 'electrical', complexity: 'large' },
    { service: 'plumbing', complexity: 'small' },
    { service: 'plumbing', complexity: 'medium' },
    { service: 'plumbing', complexity: 'large' },
  ]

  it('has all 6 service_type x complexity combinations', () => {
    for (const combo of COMBOS) {
      const pattern = new RegExp(
        `'${combo.service}'\\s*,\\s*'${combo.complexity}'`,
        'i'
      )
      expect(SQL).toMatch(pattern)
    }
  })

  it('seed prices are positive integers', () => {
    const insertSection = SQL.substring(
      SQL.toLowerCase().indexOf('insert into price_baselines'),
      SQL.indexOf(';', SQL.toLowerCase().indexOf('insert into price_baselines'))
    )
    const numbers = insertSection.match(/\d{5,}/g) || []
    expect(numbers.length).toBeGreaterThanOrEqual(12) // 6 rows × 2 prices each
    for (const num of numbers) {
      expect(parseInt(num)).toBeGreaterThan(0)
    }
  })
})

describe('Check constraints exist', () => {
  it('reviews.rating has CHECK between 1 and 5', () => {
    const pattern = /check\s*\(\s*rating\s+between\s+1\s+and\s+5\s*\)/i
    expect(SQL).toMatch(pattern)
  })

  it('jobs.scope_change_customer_decision has CHECK for approved/cancelled', () => {
    const pattern = /scope_change_customer_decision.*check.*'approved'.*'cancelled'/is
    expect(SQL).toMatch(pattern)
  })
})

describe('UNIQUE constraints', () => {
  it('price_baselines has UNIQUE(service_type, complexity)', () => {
    const pattern = /unique\s*\(\s*service_type\s*,\s*complexity\s*\)/i
    expect(SQL).toMatch(pattern)
  })

  it('job_broadcasts has UNIQUE(job_id, worker_id)', () => {
    const pattern = /unique\s*\(\s*job_id\s*,\s*worker_id\s*\)/i
    expect(SQL).toMatch(pattern)
  })

  it('profiles.phone has UNIQUE constraint', () => {
    const pattern = /phone\s+text\s+unique/i
    expect(SQL).toMatch(pattern)
  })

  it('reviews.job_id has UNIQUE constraint (one review per job)', () => {
    // "uuid references jobs on delete cascade unique not null"
    const pattern = /job_id\s+uuid\s+references\s+jobs\s+on\s+delete\s+cascade\s+unique/i
    expect(SQL).toMatch(pattern)
  })
})

describe('Storage buckets', () => {
  it('creates job-photos bucket', () => {
    expect(SQL).toContain("'job-photos'")
  })

  it('creates completion-photos bucket', () => {
    expect(SQL).toContain("'completion-photos'")
  })

  it('creates worker-documents bucket', () => {
    expect(SQL).toContain("'worker-documents'")
  })

  it('job-photos has 10MB limit', () => {
    // 10MB = 10485760 bytes
    const jobPhotosSection = SQL.substring(
      SQL.indexOf("'job-photos'"),
      SQL.indexOf("'job-photos'") + 200
    )
    expect(jobPhotosSection).toContain('10485760')
  })

  it('worker-documents has 5MB limit', () => {
    // 5MB = 5242880 bytes
    const workerDocsSection = SQL.substring(
      SQL.indexOf("'worker-documents'"),
      SQL.indexOf("'worker-documents'") + 200
    )
    expect(workerDocsSection).toContain('5242880')
  })
})

describe('Realtime-enabled tables', () => {
  it('jobs is added to supabase_realtime', () => {
    expect(SQL).toMatch(/alter\s+publication\s+supabase_realtime\s+add\s+table\s+jobs/i)
  })

  it('chat_messages is added to supabase_realtime', () => {
    expect(SQL).toMatch(/alter\s+publication\s+supabase_realtime\s+add\s+table\s+chat_messages/i)
  })

  it('job_broadcasts is added to supabase_realtime', () => {
    expect(SQL).toMatch(/alter\s+publication\s+supabase_realtime\s+add\s+table\s+job_broadcasts/i)
  })

  it('sensitive tables are NOT in realtime', () => {
    const realtimeLines = SQL
      .split('\n')
      .filter(line => /supabase_realtime\s+add\s+table/i.test(line))
    expect(realtimeLines).toHaveLength(3)

    for (const line of realtimeLines) {
      expect(line).not.toMatch(/profiles|api_logs|price_baselines|reviews/i)
    }
  })
})

describe('Triggers exist', () => {
  const TRIGGERS = [
    'profiles_updated_at',
    'customer_profiles_updated_at',
    'worker_profiles_updated_at',
    'price_baselines_updated_at',
    'jobs_updated_at',
    'on_auth_user_created',
    'reviews_update_worker_rating',
  ]

  it.each(TRIGGERS)('trigger "%s" exists', (triggerName) => {
    const pattern = new RegExp(`create\\s+trigger\\s+${triggerName}`, 'i')
    expect(SQL).toMatch(pattern)
  })
})

describe('No hardcoded secrets or PII in migration', () => {
  it('no Anthropic API key patterns (sk-)', () => {
    expect(SQL).not.toMatch(/sk-[a-zA-Z0-9]{20,}/)
  })

  it('no Perplexity API key patterns (pplx-)', () => {
    expect(SQL).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)
  })

  it('no Vietnamese phone numbers (+84 or 09)', () => {
    expect(SQL).not.toMatch(/\+84\d{9,10}/)
    expect(SQL).not.toMatch(/09\d{8}/)
  })

  it('no process.env references (code leaking into SQL)', () => {
    expect(SQL).not.toContain('process.env')
  })

  it('no hardcoded email addresses', () => {
    expect(SQL).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  })
})

describe('Critical RLS policies exist', () => {
  it('customers can create jobs (auth.uid() = customer_id)', () => {
    const pattern = /create\s+policy.*customers\s+create\s+jobs/i
    expect(SQL).toMatch(pattern)
    expect(SQL).toMatch(/auth\.uid\(\)\s*=\s*customer_id/)
  })

  it('workers can respond to own broadcasts', () => {
    const pattern = /create\s+policy.*workers\s+respond/i
    expect(SQL).toMatch(pattern)
  })

  it('reviews restricted to confirmed jobs', () => {
    expect(SQL).toMatch(/j\.status\s*=\s*'confirmed'/)
  })

  it('price_baselines readable by authenticated users', () => {
    const pattern = /create\s+policy.*price\s+baselines/i
    expect(SQL).toMatch(pattern)
    expect(SQL).toMatch(/auth\.role\(\)\s*=\s*'authenticated'/)
  })

  it('worker documents restricted to own folder', () => {
    expect(SQL).toMatch(/auth\.uid\(\)::text\s*=\s*\(storage\.foldername\(name\)\)\[1\]/)
  })
})

describe('Enums are created', () => {
  const ENUMS = [
    'user_role',
    'service_type',
    'job_status',
    'complexity_level',
    'broadcast_status',
    'message_sender',
    'api_provider',
  ]

  it.each(ENUMS)('enum "%s" is created', (enumName) => {
    const pattern = new RegExp(`create\\s+type\\s+${enumName}\\s+as\\s+enum`, 'i')
    expect(SQL).toMatch(pattern)
  })
})

describe('Utility functions exist', () => {
  it('update_updated_at() function exists', () => {
    expect(SQL).toMatch(/create\s+or\s+replace\s+function\s+update_updated_at/i)
  })

  it('handle_new_user() function exists', () => {
    expect(SQL).toMatch(/create\s+or\s+replace\s+function\s+handle_new_user/i)
  })

  it('update_worker_rating() function exists', () => {
    expect(SQL).toMatch(/create\s+or\s+replace\s+function\s+update_worker_rating/i)
  })

  it('handle_new_user defaults to customer role', () => {
    expect(SQL).toMatch(/coalesce.*'customer'/)
  })
})
