import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SQL = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/20260512000000_security_hardening.sql'),
  'utf-8'
)

describe('C2 fix: handle_new_user() forces customer role', () => {
  it('creates or replaces handle_new_user function', () => {
    expect(SQL).toMatch(/create\s+or\s+replace\s+function\s+handle_new_user/i)
  })

  it('does NOT use coalesce (vulnerability was role from user metadata)', () => {
    expect(SQL.toLowerCase()).not.toContain('coalesce')
  })

  it('does NOT reference raw_user_meta_data', () => {
    expect(SQL.toLowerCase()).not.toContain('raw_user_meta_data')
  })

  it('hardcodes customer role for all new signups', () => {
    const fnBody = SQL.substring(
      SQL.indexOf('handle_new_user'),
      SQL.indexOf('$$', SQL.indexOf('handle_new_user') + 30)
    )
    expect(fnBody).toContain("'customer'")
  })

  it('is a security definer function', () => {
    const fnSection = SQL.substring(
      SQL.toLowerCase().indexOf('handle_new_user'),
      SQL.toLowerCase().indexOf('is_admin')
    )
    expect(fnSection.toLowerCase()).toContain('security definer')
  })
})

describe('is_admin() helper function', () => {
  it('creates is_admin function', () => {
    expect(SQL).toMatch(/create\s+or\s+replace\s+function\s+is_admin/i)
  })

  it('returns boolean', () => {
    expect(SQL).toMatch(/is_admin\(\)\s*\n?\s*returns\s+boolean/i)
  })

  it('checks profiles table for admin role', () => {
    const fnStart = SQL.toLowerCase().indexOf('function is_admin')
    const fnEnd = SQL.indexOf('$$', fnStart + 50)
    const fnBody = SQL.substring(fnStart, fnEnd)
    expect(fnBody).toContain('profiles')
    expect(fnBody).toContain("'admin'")
  })

  it('uses auth.uid() for current user check', () => {
    const fnStart = SQL.toLowerCase().indexOf('function is_admin')
    const fnEnd = SQL.indexOf('$$', fnStart + 50)
    const fnBody = SQL.substring(fnStart, fnEnd)
    expect(fnBody).toContain('auth.uid()')
  })

  it('is security definer + stable (cacheable)', () => {
    const fnStart = SQL.toLowerCase().indexOf('function is_admin')
    const policyStart = SQL.toLowerCase().indexOf('create policy')
    const fnDecl = SQL.substring(fnStart, policyStart).toLowerCase()
    expect(fnDecl).toContain('security definer')
    expect(fnDecl).toContain('stable')
  })
})

describe('C4 fix: Admin RLS policies for all 9 tables', () => {
  const TABLES = [
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

  it.each(TABLES)('has admin policy for "%s"', (table) => {
    const pattern = new RegExp(
      `create\\s+policy\\s+"Admin[^"]*"\\s+on\\s+${table}`,
      'i'
    )
    expect(SQL).toMatch(pattern)
  })

  it('has at least 12 admin policies total', () => {
    const policies = SQL.match(/create\s+policy\s+"Admin[^"]*"/gi) || []
    expect(policies.length).toBeGreaterThanOrEqual(12)
  })

  it('all admin policies use is_admin() function', () => {
    const policyBlocks = SQL.split(/create\s+policy/i).slice(1)
    for (const block of policyBlocks) {
      if (/^[^"]*"Admin/i.test(block)) {
        expect(block).toContain('is_admin()')
      }
    }
  })

  it('admin can manage price_baselines (for all operations)', () => {
    expect(SQL).toMatch(
      /create\s+policy\s+"Admin manage price baselines"\s+on\s+price_baselines\s+for\s+all/i
    )
  })

  it('admin can view api_logs (monitoring)', () => {
    expect(SQL).toMatch(
      /create\s+policy\s+"Admin view all api logs"\s+on\s+api_logs\s+for\s+select/i
    )
  })

  it('admin can update worker_profiles (approve workers B0)', () => {
    expect(SQL).toMatch(
      /create\s+policy\s+"Admin update all worker profiles"\s+on\s+worker_profiles\s+for\s+update/i
    )
  })

  it('admin can view all jobs', () => {
    expect(SQL).toMatch(
      /create\s+policy\s+"Admin view all jobs"\s+on\s+jobs\s+for\s+select/i
    )
  })

  it('admin can view all chat_messages (dispute resolution)', () => {
    expect(SQL).toMatch(
      /create\s+policy\s+"Admin view all messages"\s+on\s+chat_messages\s+for\s+select/i
    )
  })

  it('admin can manage reviews', () => {
    expect(SQL).toMatch(
      /create\s+policy\s+"Admin manage reviews"\s+on\s+reviews\s+for\s+all/i
    )
  })
})

describe('No remaining security vulnerabilities', () => {
  it('no reference to raw_user_meta_data anywhere', () => {
    expect(SQL.toLowerCase()).not.toContain('raw_user_meta_data')
  })

  it('no hardcoded admin/worker role assignment from user input', () => {
    expect(SQL).not.toMatch(/new\.raw_user_meta_data/)
  })
})
