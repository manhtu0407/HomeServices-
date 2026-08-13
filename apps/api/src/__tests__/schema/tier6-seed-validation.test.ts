import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SEED = readFileSync(
  resolve(__dirname, '../../../../../supabase/seed.sql'),
  'utf-8'
)

describe('Test user profiles', () => {
  it('creates deterministic auth parents before mutating trigger-created profiles', () => {
    const lowerSeed = SEED.toLowerCase()
    const authInsert = lowerSeed.indexOf('insert into auth.users')
    const profileUpdate = lowerSeed.indexOf('update public.profiles')

    expect(authInsert).toBeGreaterThanOrEqual(0)
    expect(profileUpdate).toBeGreaterThan(authInsert)
    expect(lowerSeed).not.toContain('insert into profiles')
    expect(lowerSeed).not.toContain('insert into public.profiles')
  })

  it('keeps local auth parents phone-only and credential-free', () => {
    const authSection = SEED.slice(
      SEED.toLowerCase().indexOf('insert into auth.users'),
      SEED.toLowerCase().indexOf('update public.profiles'),
    )

    expect(authSection).toContain('raw_app_meta_data')
    expect(authSection).not.toMatch(/\bemail\b/i)
    expect(authSection).not.toMatch(/password/i)
    expect(authSection).toContain('000000000001')
    expect(authSection).toContain('000000000002')
    expect(authSection).toContain('000000000003')
  })

})

describe('Worker profile seed', () => {
  it('worker has all three active service types', () => {
    const workerSection = SEED.substring(
      SEED.toLowerCase().indexOf('insert into worker_profiles')
    )
    expect(workerSection).toContain("'electrical'")
    expect(workerSection).toContain("'plumbing'")
    expect(workerSection).toContain("'cleaning'")
  })

  it('approved worker includes required identity and canonical HCMC districts', () => {
    const workerSection = SEED.match(
      /insert\s+into\s+worker_profiles[\s\S]*?on\s+conflict\s+\(id\)\s+do\s+nothing;/i,
    )?.[0] ?? ''

    expect(workerSection).toContain('legal_name')
    expect(workerSection).toContain('date_of_birth')
    expect(workerSection).toContain("'binh_thanh'")
    expect(workerSection).toContain("'q1'")
    expect(workerSection).toContain("'thu_duc'")
  })

})

describe('Sample jobs seed', () => {
  it('has at least 2 jobs for testing different states', () => {
    const jobInserts = SEED.match(/insert\s+into\s+jobs/gi) || []
    expect(jobInserts.length).toBeGreaterThanOrEqual(2)
  })

})

describe('Seed data safety', () => {
  it('all inserts use ON CONFLICT DO NOTHING (idempotent)', () => {
    const inserts = SEED.match(/insert\s+into\s+\w+/gi) || []
    const conflicts = SEED.match(/on\s+conflict.*do\s+nothing/gi) || []
    expect(conflicts.length).toBe(inserts.length)
  })

  it('phone numbers are obviously fake (test patterns)', () => {
    const phones = SEED.match(/'00000000000\d'/g) || []
    expect(phones).toHaveLength(6)
    for (const phone of phones) {
      expect(phone).toMatch(/^'00000000000[123]'$/)
    }
  })

  it('no real API keys or secrets', () => {
    expect(SEED).not.toMatch(/sk-[a-zA-Z0-9]{20,}/)
    expect(SEED).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)
    expect(SEED).not.toMatch(/Bearer\s+[a-zA-Z0-9]{20,}/)
  })

  it('no real Vietnamese phone numbers (+84 format)', () => {
    expect(SEED).not.toMatch(/\+84\d{9,10}/)
  })

  it('no email addresses', () => {
    expect(SEED).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  })
})
