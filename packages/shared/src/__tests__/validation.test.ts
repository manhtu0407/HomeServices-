import { describe, it, expect } from 'vitest'
import {
  serviceTypeSchema,
  jobCreateSchema,
  scopeChangeSchema,
  reviewSchema,
  chatMessageSchema,
  sanitizeForLLM,
  SERVICE_TYPES,
} from '../index'

// Valid UUID for reuse
const UUID = '550e8400-e29b-41d4-a716-446655440000'

// ===================================================================
// Rule #6: Kael chỉ trả lời về điện và nước — hard enforcement
// ===================================================================

describe('serviceTypeSchema (Rule #6: only electrical + plumbing)', () => {
  it('accepts electrical', () => {
    expect(serviceTypeSchema.parse('electrical')).toBe('electrical')
  })

  it('accepts plumbing', () => {
    expect(serviceTypeSchema.parse('plumbing')).toBe('plumbing')
  })

  it('rejects hvac', () => {
    expect(() => serviceTypeSchema.parse('hvac')).toThrow()
  })

  it('rejects cleaning', () => {
    expect(() => serviceTypeSchema.parse('cleaning')).toThrow()
  })

  it('rejects empty string', () => {
    expect(() => serviceTypeSchema.parse('')).toThrow()
  })

  it('rejects null', () => {
    expect(() => serviceTypeSchema.parse(null)).toThrow()
  })

  it('rejects number', () => {
    expect(() => serviceTypeSchema.parse(1)).toThrow()
  })

  it('rejects case variation (Electrical)', () => {
    expect(() => serviceTypeSchema.parse('Electrical')).toThrow()
  })

  it('rejects with whitespace (electrical )', () => {
    expect(() => serviceTypeSchema.parse('electrical ')).toThrow()
  })

  it('schema enum values match SERVICE_TYPES constant', () => {
    // Zod v4 enum .options is the values array
    const schemaValues = serviceTypeSchema.options
    expect([...schemaValues].sort()).toEqual([...SERVICE_TYPES].sort())
  })
})

// ===================================================================
// jobCreateSchema — STRUCTURES.md A2/A3
// ===================================================================

describe('jobCreateSchema', () => {
  const validJob = {
    service_type: 'electrical' as const,
    description: 'Mất điện phòng khách từ hôm qua',
    problem_chips: ['Mất điện một phòng'],
  }

  it('accepts valid minimal input', () => {
    const result = jobCreateSchema.parse(validJob)
    expect(result.service_type).toBe('electrical')
    expect(result.photo_urls).toEqual([]) // default
  })

  it('accepts valid full input', () => {
    const full = {
      ...validJob,
      photo_urls: ['https://example.com/photo1.jpg'],
      address_building: 'Vinhomes Central Park',
      address_unit: '1205',
      address_floor: '12',
      address_district: 'Bình Thạnh',
      scheduled_at: '2026-06-01T10:00:00Z',
    }
    expect(() => jobCreateSchema.parse(full)).not.toThrow()
  })

  // description boundaries
  it('rejects description < 10 chars', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, description: 'Hỏng' })
    ).toThrow()
  })

  it('accepts description exactly 10 chars', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, description: 'A'.repeat(10) })
    ).not.toThrow()
  })

  it('rejects description > 2000 chars', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, description: 'A'.repeat(2001) })
    ).toThrow()
  })

  // problem_chips boundaries
  it('rejects empty problem_chips array', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, problem_chips: [] })
    ).toThrow()
  })

  it('rejects problem_chips > 10 items', () => {
    const chips = Array.from({ length: 11 }, (_, i) => `chip${i}`)
    expect(() =>
      jobCreateSchema.parse({ ...validJob, problem_chips: chips })
    ).toThrow()
  })

  it('rejects chip > 100 chars', () => {
    expect(() =>
      jobCreateSchema.parse({
        ...validJob,
        problem_chips: ['A'.repeat(101)],
      })
    ).toThrow()
  })

  // photo_urls boundaries (STRUCTURES.md A3: tối đa 5)
  it('rejects > 5 photos', () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/p${i}.jpg`)
    expect(() =>
      jobCreateSchema.parse({ ...validJob, photo_urls: urls })
    ).toThrow()
  })

  it('rejects non-URL in photo_urls', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, photo_urls: ['not-a-url'] })
    ).toThrow()
  })

  // service_type (Rule #6)
  it('rejects invalid service_type', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, service_type: 'painting' })
    ).toThrow()
  })

  // scheduled_at
  it('rejects invalid datetime for scheduled_at', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, scheduled_at: 'tomorrow' })
    ).toThrow()
  })
})

// ===================================================================
// scopeChangeSchema — STRUCTURES.md A11/B4
// ===================================================================

describe('scopeChangeSchema', () => {
  const validScope = {
    job_id: UUID,
    description: 'Phạm vi thay đổi do ống chính bị hỏng',
    new_price_min: 200000,
    new_price_max: 400000,
    reason: 'Phát hiện ống chính rỉ nước nghiêm trọng',
  }

  it('accepts valid scope change', () => {
    expect(() => scopeChangeSchema.parse(validScope)).not.toThrow()
  })

  it('rejects price_max < price_min', () => {
    expect(() =>
      scopeChangeSchema.parse({
        ...validScope,
        new_price_min: 500000,
        new_price_max: 200000,
      })
    ).toThrow()
  })

  it('accepts price_max === price_min', () => {
    expect(() =>
      scopeChangeSchema.parse({
        ...validScope,
        new_price_min: 300000,
        new_price_max: 300000,
      })
    ).not.toThrow()
  })

  it('rejects negative prices', () => {
    expect(() =>
      scopeChangeSchema.parse({
        ...validScope,
        new_price_min: -100,
        new_price_max: 200000,
      })
    ).toThrow()
  })

  it('rejects zero price', () => {
    expect(() =>
      scopeChangeSchema.parse({
        ...validScope,
        new_price_min: 0,
        new_price_max: 200000,
      })
    ).toThrow()
  })

  it('rejects fractional prices (must be integer VND)', () => {
    expect(() =>
      scopeChangeSchema.parse({
        ...validScope,
        new_price_min: 199999.5,
        new_price_max: 400000,
      })
    ).toThrow()
  })

  it('rejects invalid UUID for job_id', () => {
    expect(() =>
      scopeChangeSchema.parse({ ...validScope, job_id: 'not-a-uuid' })
    ).toThrow()
  })

  it('rejects short description', () => {
    expect(() =>
      scopeChangeSchema.parse({ ...validScope, description: 'short' })
    ).toThrow()
  })

  it('rejects short reason', () => {
    expect(() =>
      scopeChangeSchema.parse({ ...validScope, reason: 'short' })
    ).toThrow()
  })
})

// ===================================================================
// reviewSchema — STRUCTURES.md A14
// ===================================================================

describe('reviewSchema', () => {
  const validReview = {
    job_id: UUID,
    rating: 5,
    tags: ['Đúng giờ', 'Chuyên nghiệp'],
  }

  it('accepts valid review', () => {
    expect(() => reviewSchema.parse(validReview)).not.toThrow()
  })

  it('accepts review without optional comment', () => {
    expect(() => reviewSchema.parse(validReview)).not.toThrow()
  })

  it('accepts rating of 1 (minimum)', () => {
    expect(() => reviewSchema.parse({ ...validReview, rating: 1 })).not.toThrow()
  })

  it('rejects rating of 0', () => {
    expect(() => reviewSchema.parse({ ...validReview, rating: 0 })).toThrow()
  })

  it('rejects rating of 6', () => {
    expect(() => reviewSchema.parse({ ...validReview, rating: 6 })).toThrow()
  })

  it('rejects fractional rating', () => {
    expect(() => reviewSchema.parse({ ...validReview, rating: 4.5 })).toThrow()
  })

  it('rejects > 10 tags', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`)
    expect(() => reviewSchema.parse({ ...validReview, tags })).toThrow()
  })

  it('rejects comment > 1000 chars', () => {
    expect(() =>
      reviewSchema.parse({ ...validReview, comment: 'A'.repeat(1001) })
    ).toThrow()
  })
})

// ===================================================================
// chatMessageSchema — STRUCTURES.md 3D
// ===================================================================

describe('chatMessageSchema', () => {
  it('accepts valid message', () => {
    expect(() =>
      chatMessageSchema.parse({ job_id: UUID, content: 'Thợ đang đến' })
    ).not.toThrow()
  })

  it('rejects empty content', () => {
    expect(() =>
      chatMessageSchema.parse({ job_id: UUID, content: '' })
    ).toThrow()
  })

  it('rejects content > 5000 chars', () => {
    expect(() =>
      chatMessageSchema.parse({ job_id: UUID, content: 'A'.repeat(5001) })
    ).toThrow()
  })

  it('accepts content at exactly 5000 chars', () => {
    expect(() =>
      chatMessageSchema.parse({ job_id: UUID, content: 'A'.repeat(5000) })
    ).not.toThrow()
  })
})

// ===================================================================
// sanitizeForLLM — Rule #3: validate before sending to user
// ===================================================================

describe('sanitizeForLLM', () => {
  it('strips null bytes', () => {
    expect(sanitizeForLLM('hello\x00world')).toBe('helloworld')
  })

  it('strips control characters (\\x01-\\x08)', () => {
    expect(sanitizeForLLM('\x01\x02\x03safe')).toBe('safe')
  })

  it('preserves newlines and tabs', () => {
    // \\n = 0x0A, \\t = 0x09 — the regex strips 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F
    // So \\n (0x0A) and \\r (0x0D) should be preserved? Let's check the regex:
    // /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
    // 0x09 (tab) NOT in range — preserved
    // 0x0A (newline) NOT in range — preserved
    // 0x0D (carriage return) NOT in range — preserved
    const result = sanitizeForLLM('line1\nline2\ttab')
    expect(result).toBe('line1\nline2\ttab')
  })

  it('trims whitespace', () => {
    expect(sanitizeForLLM('  hello  ')).toBe('hello')
  })

  it('truncates to 5000 chars', () => {
    const long = 'A'.repeat(6000)
    expect(sanitizeForLLM(long)).toHaveLength(5000)
  })

  it('handles empty string', () => {
    expect(sanitizeForLLM('')).toBe('')
  })

  it('handles string of only control chars', () => {
    expect(sanitizeForLLM('\x00\x01\x02')).toBe('')
  })

  it('preserves Vietnamese text with diacritics', () => {
    const vn = 'Xin chào! Tôi cần sửa ống nước bị rò rỉ'
    expect(sanitizeForLLM(vn)).toBe(vn)
  })

  it('strips DEL character (0x7F)', () => {
    expect(sanitizeForLLM('before\x7Fafter')).toBe('beforeafter')
  })
})
