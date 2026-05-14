import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SEED = readFileSync(
  resolve(__dirname, '../../../../../supabase/seed.sql'),
  'utf-8'
)

describe('Test user profiles', () => {
  it('has all 3 roles: customer, worker, admin', () => {
    expect(SEED).toContain("'customer'")
    expect(SEED).toContain("'worker'")
    expect(SEED).toContain("'admin'")
  })

  it('uses deterministic UUIDs for reproducible testing', () => {
    expect(SEED).toContain('00000000-0000-0000-0000-000000000001')
    expect(SEED).toContain('00000000-0000-0000-0000-000000000002')
    expect(SEED).toContain('00000000-0000-0000-0000-000000000003')
  })

  it('has Vietnamese names matching target market', () => {
    expect(SEED).toContain('Nguyen Van A')
    expect(SEED).toContain('Tran Van B')
  })

  it('has admin user for admin panel testing', () => {
    expect(SEED).toContain('Admin Dev')
  })
})

describe('Customer profile seed', () => {
  it('inserts into customer_profiles', () => {
    expect(SEED.toLowerCase()).toContain('insert into customer_profiles')
  })

  it('has HCMC apartment details', () => {
    expect(SEED).toContain('Vinhomes Central Park')
    expect(SEED).toContain('Binh Thanh')
  })

  it('has unit and floor info', () => {
    expect(SEED).toContain('A-1205')
    expect(SEED).toContain("'12'")
  })
})

describe('Worker profile seed', () => {
  it('inserts into worker_profiles', () => {
    expect(SEED.toLowerCase()).toContain('insert into worker_profiles')
  })

  it('worker has both service types (electrical + plumbing)', () => {
    const workerSection = SEED.substring(
      SEED.toLowerCase().indexOf('insert into worker_profiles')
    )
    expect(workerSection).toContain("'electrical'")
    expect(workerSection).toContain("'plumbing'")
  })

  it('worker is approved and available for testing', () => {
    expect(SEED).toMatch(/is_approved.*true/is)
  })

  it('worker covers HCMC districts', () => {
    expect(SEED).toContain('Binh Thanh')
    expect(SEED).toContain('Quan 1')
  })

  it('worker has realistic rating (1-5 range)', () => {
    expect(SEED).toMatch(/4\.50/)
  })
})

describe('Sample jobs seed', () => {
  it('has at least 2 jobs for testing different states', () => {
    const jobInserts = SEED.match(/insert\s+into\s+jobs/gi) || []
    expect(jobInserts.length).toBeGreaterThanOrEqual(2)
  })

  it('includes a paid job (full workflow test)', () => {
    expect(SEED).toContain("'paid'")
  })

  it('includes an analyzing job (active workflow test)', () => {
    expect(SEED).toContain("'analyzing'")
  })

  it('paid job has complete timeline', () => {
    expect(SEED).toContain('broadcast_at')
    expect(SEED).toContain('matched_at')
    expect(SEED).toContain('completed_at')
    expect(SEED).toContain('confirmed_at')
    expect(SEED).toContain('paid_at')
  })

  it('jobs reference the customer UUID', () => {
    expect(SEED).toContain("'00000000-0000-0000-0000-000000000001'")
  })

  it('paid job has both service types represented', () => {
    expect(SEED).toContain("'electrical'")
    expect(SEED).toContain("'plumbing'")
  })

  it('jobs have Vietnamese descriptions', () => {
    expect(SEED).toMatch(/[À-ỹ]/)
  })

  it('paid job has kael analysis fields', () => {
    expect(SEED).toContain('kael_problem_identified')
    expect(SEED).toContain('kael_complexity')
    expect(SEED).toContain('kael_price_min')
    expect(SEED).toContain('kael_price_max')
  })
})

describe('Sample review seed', () => {
  it('has review insert', () => {
    expect(SEED.toLowerCase()).toContain('insert into reviews')
  })

  it('review references the paid job', () => {
    expect(SEED).toContain('00000000-0000-0000-0000-000000000010')
  })

  it('has Vietnamese review tags', () => {
    expect(SEED).toContain('Đúng giờ')
    expect(SEED).toContain('Chuyên nghiệp')
    expect(SEED).toContain('Giá hợp lý')
  })

  it('has Vietnamese review comment', () => {
    expect(SEED).toContain('Rất hài lòng')
  })
})

describe('Seed data safety', () => {
  it('all inserts use ON CONFLICT DO NOTHING (idempotent)', () => {
    const inserts = SEED.match(/insert\s+into\s+\w+/gi) || []
    const conflicts = SEED.match(/on\s+conflict.*do\s+nothing/gi) || []
    expect(conflicts.length).toBe(inserts.length)
  })

  it('phone numbers are obviously fake (test patterns)', () => {
    const phones = SEED.match(/090\d{7}/g) || []
    for (const phone of phones) {
      expect(phone).toMatch(/^0901000\d{3}$/)
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
