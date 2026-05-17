import { describe, it, expect } from 'vitest'
import {
  serviceTypeSchema,
  jobCreateSchema,
  workerScopeChangeSchema,
  reviewSchema,
  chatMessageSchema,
  sanitizeForLLM,
} from '@home-services/shared'

describe('serviceTypeSchema (Rule #6: only electrical + plumbing)', () => {
  it('accepts "electrical"', () => {
    expect(serviceTypeSchema.parse('electrical')).toBe('electrical')
  })

  it('accepts "plumbing"', () => {
    expect(serviceTypeSchema.parse('plumbing')).toBe('plumbing')
  })

  it.each(['hvac', 'cleaning', '', 'ELECTRICAL', 'Plumbing', 'gas', 'painting'])(
    'rejects "%s"',
    (value) => {
      expect(() => serviceTypeSchema.parse(value)).toThrow()
    }
  )
})

describe('jobCreateSchema', () => {
  const validJob = {
    service_type: 'electrical' as const,
    description: 'Ổ cắm phòng khách bị cháy, không sử dụng được',
    problem_chips: ['Ổ cắm/công tắc hỏng'],
  }

  it('accepts minimal valid input', () => {
    const result = jobCreateSchema.parse(validJob)
    expect(result.service_type).toBe('electrical')
    expect(result.photo_urls).toEqual([])
  })

  it('accepts full input with all optional fields', () => {
    const full = {
      ...validJob,
      photo_urls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
      address_building: 'Vinhomes Central Park',
      address_unit: 'A-1205',
      address_floor: '12',
      address_district: 'Binh Thanh',
      scheduled_at: '2026-06-01T10:00:00Z',
    }
    expect(() => jobCreateSchema.parse(full)).not.toThrow()
  })

  it('defaults photo_urls to empty array', () => {
    const result = jobCreateSchema.parse(validJob)
    expect(result.photo_urls).toEqual([])
  })

  it('rejects description under 10 chars', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, description: 'ngắn' })
    ).toThrow()
  })

  it('rejects description over 2000 chars', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, description: 'x'.repeat(2001) })
    ).toThrow()
  })

  it('accepts description at boundary (10 chars)', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, description: 'a'.repeat(10) })
    ).not.toThrow()
  })

  it('rejects empty problem_chips', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, problem_chips: [] })
    ).toThrow()
  })

  it('rejects >10 problem_chips', () => {
    expect(() =>
      jobCreateSchema.parse({
        ...validJob,
        problem_chips: Array.from({ length: 11 }, (_, i) => `chip ${i}`),
      })
    ).toThrow()
  })

  it('rejects >5 photo URLs', () => {
    expect(() =>
      jobCreateSchema.parse({
        ...validJob,
        photo_urls: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}.jpg`),
      })
    ).toThrow()
  })

  it('accepts exactly 5 photo URLs', () => {
    expect(() =>
      jobCreateSchema.parse({
        ...validJob,
        photo_urls: Array.from({ length: 5 }, (_, i) => `https://example.com/${i}.jpg`),
      })
    ).not.toThrow()
  })

  it('rejects invalid photo URL format', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, photo_urls: ['not-a-url'] })
    ).toThrow()
  })

  it('rejects invalid service_type', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, service_type: 'hvac' })
    ).toThrow()
  })

  it('rejects invalid scheduled_at format', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, scheduled_at: 'tomorrow' })
    ).toThrow()
  })

  it('accepts valid ISO datetime for scheduled_at', () => {
    expect(() =>
      jobCreateSchema.parse({ ...validJob, scheduled_at: '2026-06-01T14:30:00Z' })
    ).not.toThrow()
  })
})

describe('workerScopeChangeSchema (B6 — worker requests scope change)', () => {
  const validScope = {
    new_description: 'Phát hiện thêm ống nước bị rỉ ở bếp, cần thay đoạn lớn hơn',
    new_price_min: 300000,
    new_price_max: 500000,
    reason: 'Ống nước bếp cũ, cần thay mới toàn bộ',
  }

  it('accepts valid scope change', () => {
    expect(() => workerScopeChangeSchema.parse(validScope)).not.toThrow()
  })

  it('does NOT include job_id (comes from URL, not body)', () => {
    // The schema should not require job_id — it's derived from URL params
    const result = workerScopeChangeSchema.safeParse(validScope)
    expect(result.success).toBe(true)
  })

  it('rejects negative price', () => {
    expect(() =>
      workerScopeChangeSchema.parse({ ...validScope, new_price_min: -100000 })
    ).toThrow()
  })

  it('rejects zero price', () => {
    expect(() =>
      workerScopeChangeSchema.parse({ ...validScope, new_price_max: 0 })
    ).toThrow()
  })

  it('rejects float price (prices are integer VND)', () => {
    expect(() =>
      workerScopeChangeSchema.parse({ ...validScope, new_price_min: 150000.5 })
    ).toThrow()
  })

  it('rejects min > max', () => {
    expect(() =>
      workerScopeChangeSchema.parse({
        ...validScope,
        new_price_min: 600000,
        new_price_max: 300000,
      })
    ).toThrow()
  })

  it('accepts min == max (fixed price)', () => {
    expect(() =>
      workerScopeChangeSchema.parse({
        ...validScope,
        new_price_min: 400000,
        new_price_max: 400000,
      })
    ).not.toThrow()
  })

  it('rejects short new_description', () => {
    expect(() =>
      workerScopeChangeSchema.parse({ ...validScope, new_description: 'short' })
    ).toThrow()
  })

  it('rejects short reason', () => {
    expect(() =>
      workerScopeChangeSchema.parse({ ...validScope, reason: 'too short' })
    ).toThrow()
  })
})

describe('reviewSchema', () => {
  const validReview = {
    job_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    rating: 5,
  }

  it('accepts valid review with defaults', () => {
    const result = reviewSchema.parse(validReview)
    expect(result.tags).toEqual([])
    expect(result.comment).toBeUndefined()
  })

  it('accepts full review with tags and comment', () => {
    expect(() =>
      reviewSchema.parse({
        ...validReview,
        tags: ['Đúng giờ', 'Chuyên nghiệp', 'Giá hợp lý'],
        comment: 'Thợ sửa nhanh và gọn gàng. Rất hài lòng.',
      })
    ).not.toThrow()
  })

  it.each([1, 2, 3, 4, 5])('accepts rating %d', (rating) => {
    expect(() => reviewSchema.parse({ ...validReview, rating })).not.toThrow()
  })

  it('rejects rating 0', () => {
    expect(() => reviewSchema.parse({ ...validReview, rating: 0 })).toThrow()
  })

  it('rejects rating 6', () => {
    expect(() => reviewSchema.parse({ ...validReview, rating: 6 })).toThrow()
  })

  it('rejects float rating', () => {
    expect(() => reviewSchema.parse({ ...validReview, rating: 3.5 })).toThrow()
  })

  it('rejects >10 tags', () => {
    expect(() =>
      reviewSchema.parse({
        ...validReview,
        tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
      })
    ).toThrow()
  })

  it('rejects comment over 1000 chars', () => {
    expect(() =>
      reviewSchema.parse({ ...validReview, comment: 'x'.repeat(1001) })
    ).toThrow()
  })
})

describe('chatMessageSchema', () => {
  const validMsg = {
    job_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    content: 'Xin chào, tôi đang ở tầng 12',
  }

  it('accepts valid message', () => {
    expect(() => chatMessageSchema.parse(validMsg)).not.toThrow()
  })

  it('rejects empty content', () => {
    expect(() => chatMessageSchema.parse({ ...validMsg, content: '' })).toThrow()
  })

  it('rejects content over 5000 chars', () => {
    expect(() =>
      chatMessageSchema.parse({ ...validMsg, content: 'x'.repeat(5001) })
    ).toThrow()
  })

  it('accepts content at boundary (5000 chars)', () => {
    expect(() =>
      chatMessageSchema.parse({ ...validMsg, content: 'x'.repeat(5000) })
    ).not.toThrow()
  })

  it('rejects non-UUID job_id', () => {
    expect(() =>
      chatMessageSchema.parse({ ...validMsg, job_id: 'abc123' })
    ).toThrow()
  })
})

describe('sanitizeForLLM', () => {
  it('strips null bytes', () => {
    expect(sanitizeForLLM('hello\x00world')).toBe('helloworld')
  })

  it('strips control chars (0x01-0x08)', () => {
    expect(sanitizeForLLM('a\x01b\x02c\x08d')).toBe('abcd')
  })

  it('strips vertical tab and form feed', () => {
    expect(sanitizeForLLM('a\x0Bb\x0Cc')).toBe('abc')
  })

  it('strips DEL character (0x7F)', () => {
    expect(sanitizeForLLM('hello\x7Fworld')).toBe('helloworld')
  })

  it('preserves tab characters', () => {
    expect(sanitizeForLLM('col1\tcol2')).toBe('col1\tcol2')
  })

  it('preserves newlines', () => {
    expect(sanitizeForLLM('line1\nline2')).toBe('line1\nline2')
  })

  it('preserves carriage returns', () => {
    expect(sanitizeForLLM('line1\r\nline2')).toBe('line1\r\nline2')
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeForLLM('  hello  ')).toBe('hello')
  })

  it('truncates to 5000 characters', () => {
    const long = 'a'.repeat(6000)
    expect(sanitizeForLLM(long)).toHaveLength(5000)
  })

  it('handles empty string', () => {
    expect(sanitizeForLLM('')).toBe('')
  })

  it('handles whitespace-only string', () => {
    expect(sanitizeForLLM('   \t\n  ')).toBe('')
  })

  it('preserves Vietnamese characters', () => {
    const vn = 'Ổ cắm phòng khách bị cháy, không sử dụng được'
    expect(sanitizeForLLM(vn)).toBe(vn)
  })

  it('preserves emoji', () => {
    expect(sanitizeForLLM('test 🔧 plumbing')).toBe('test 🔧 plumbing')
  })

  it('strips + trims + truncates in correct order', () => {
    const input = '  \x00' + 'a'.repeat(5010) + '  '
    const result = sanitizeForLLM(input)
    expect(result).toHaveLength(5000)
    expect(result).not.toContain('\x00')
    expect(result).not.toMatch(/^\s/)
  })
})
