import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations')
const SQL = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8'))
  .join('\n')

const ALIGNMENT_SQL = readFileSync(
  resolve(MIGRATIONS_DIR, '20260513114845_align_structures_workflow.sql'),
  'utf-8'
)

describe('All public tables have RLS enabled', () => {
  const TABLES = [
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
  ]

  it.each(TABLES)('"%s" has row level security enabled', (table) => {
    const pattern = new RegExp(
      `alter\\s+table\\s+${table}\\s+enable\\s+row\\s+level\\s+security`,
      'i'
    )
    expect(SQL).toMatch(pattern)
  })
})

describe('New schema objects exist', () => {
  it.each([
    'service_categories',
    'service_problems',
    'job_events',
    'scope_change_requests',
    'notifications',
    'learning_candidates',
    'learning_rules',
    'learning_rule_versions',
  ])('creates "%s"', (table) => {
    expect(ALIGNMENT_SQL).toMatch(new RegExp(`create\\s+table\\s+${table}`, 'i'))
  })

})

describe('No hardcoded secrets or unsafe PII in migrations', () => {
  it('has no AI or Supabase management token patterns', () => {
    expect(SQL).not.toMatch(/sk-[a-zA-Z0-9]{20,}/)
    expect(SQL).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)
    expect(SQL).not.toMatch(/sbp_[A-Za-z0-9]{32,}/)
  })

  it('does not reference process.env inside SQL', () => {
    expect(SQL).not.toContain('process.env')
  })

  it('does not hardcode user emails or Vietnamese phone numbers', () => {
    expect(SQL).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    expect(SQL).not.toMatch(/\+84\d{9,10}/)
    expect(SQL).not.toMatch(/09\d{8}/)
  })
})
