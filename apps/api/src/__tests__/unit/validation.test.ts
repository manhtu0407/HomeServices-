import { describe, it, expect } from 'vitest'
import {
  serviceTypeSchema,
  jobCreateSchema,
  workerScopeChangeSchema,
  reviewSchema,
  chatMessageSchema,
  sanitizeForLLM,
  scrubSensitiveForLLM,
} from '@nestscout/shared'

describe('serviceTypeSchema (Rule #6: six launched services)', () => {
  it.each(['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'])(
    'accepts "%s"',
    (value) => {
      expect(serviceTypeSchema.parse(value)).toBe(value)
    },
  )

  it.each(['', 'ELECTRICAL', 'Plumbing', 'gas', 'painting', 'appliance_repair'])(
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
      jobCreateSchema.parse({ ...validJob, service_type: 'appliance_repair' })
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

describe('workerScopeChangeSchema (Phase 2.0 2026-05-23: Kael owns final price)', () => {
  // The worker does not send a price; Kael computes the new estimate
  // from worker's reported scope. Schema accepts description + reason + photos.
  const validScope = {
    client_request_id: '11111111-1111-4111-8111-111111111111',
    new_description: 'Phát hiện thêm ống nước bị rỉ ở bếp, cần thay đoạn lớn hơn',
    reason: 'Ống nước bếp cũ, cần thay mới toàn bộ',
    photo_urls: [],
  }

  it('accepts valid scope change (description + reason + optional photos)', () => {
    expect(() => workerScopeChangeSchema.parse(validScope)).not.toThrow()
  })

  it('does NOT include job_id (comes from URL, not body)', () => {
    const result = workerScopeChangeSchema.safeParse(validScope)
    expect(result.success).toBe(true)
  })

  it('drops worker-typed price fields if a regressed client sends them', () => {
    const parsed = workerScopeChangeSchema.parse({
      ...validScope,
      new_price_min: 300000,
      new_price_max: 500000,
    } as unknown as typeof validScope)
    expect(parsed).not.toHaveProperty('new_price_min')
    expect(parsed).not.toHaveProperty('new_price_max')
  })

  it('accepts up to 5 photo urls', () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    expect(() =>
      workerScopeChangeSchema.parse({
        ...validScope,
        photo_urls: Array.from(
          { length: 5 },
          (_, index) => `supabase://job-media/${jobId}/scope_change_evidence/${index}.jpg`,
        ),
      })
    ).not.toThrow()
  })

  it('rejects arbitrary remote scope evidence URLs', () => {
    expect(() => workerScopeChangeSchema.parse({
      ...validScope,
      photo_urls: ['https://attacker.example/pixel.jpg'],
    })).toThrow()
  })

  it('rejects more than 5 photo urls', () => {
    expect(() =>
      workerScopeChangeSchema.parse({
        ...validScope,
        photo_urls: Array.from(
          { length: 6 },
          (_, index) => `supabase://job-media/11111111-1111-4111-8111-111111111111/scope_change_evidence/${index}.jpg`,
        ),
      })
    ).toThrow()
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

describe('scrubSensitiveForLLM', () => {
  it('scrubs phone, email, and id-like numbers before AI prompts', () => {
    const input = 'SĐT 0901234567, email tu@example.com, CCCD 001234567890'

    expect(scrubSensitiveForLLM(input)).toBe('SĐT [phone], email [email], CCCD [id-number]')
  })

  it('scrubs separator-formatted Vietnamese phone numbers', () => {
    expect(scrubSensitiveForLLM('Gọi tôi theo số 090-123-4567')).toBe(
      'Gọi tôi theo số [phone]',
    )
    expect(scrubSensitiveForLLM('Liên hệ +84 90 123 4567')).toBe(
      'Liên hệ [phone]',
    )
  })

  it('strips HCMC apartment complex names', () => {
    expect(scrubSensitiveForLLM('Tôi ở Vinhomes Central Park')).toContain('[building]')
    expect(scrubSensitiveForLLM('Toi o Masteri An Phu')).toContain('[building]')
    expect(scrubSensitiveForLLM('Phú Mỹ Hưng quận 7')).toContain('[building]')
    expect(scrubSensitiveForLLM('The Manor 2')).toContain('[building]')
  })

  it('strips floor and unit identifiers', () => {
    expect(scrubSensitiveForLLM('tầng 25 căn A.25.07')).toBe('[floor] [unit]')
    expect(scrubSensitiveForLLM('lầu 10 phòng 1234')).toBe('[floor] [unit]')
    expect(scrubSensitiveForLLM('block A toà B2')).toContain('[unit]')
  })

  it('strips bank account numbers (8 or 13-15 digits)', () => {
    expect(scrubSensitiveForLLM('STK 12345678')).toBe('STK [bank-account]')
    expect(scrubSensitiveForLLM('Tài khoản 1234567890123')).toBe('Tài khoản [bank-account]')
    expect(scrubSensitiveForLLM('STK 123456789012345')).toBe('STK [bank-account]')
  })

  it('strips house number after "số"', () => {
    expect(scrubSensitiveForLLM('số 123 Nguyễn Văn Linh')).toBe('[house-no] Nguyễn Văn Linh')
    expect(scrubSensitiveForLLM('so 45A Le Loi')).toBe('[house-no] Le Loi')
  })

  it('strips a bare house number before a capitalized street name', () => {
    expect(scrubSensitiveForLLM('Tôi ở 123 Nguyễn Huệ')).toBe(
      'Tôi ở [house-no] Nguyễn Huệ',
    )
    expect(scrubSensitiveForLLM('Hẹn tại 45A Lê Lợi')).toBe(
      'Hẹn tại [house-no] Lê Lợi',
    )
  })

  it('combines patterns in a realistic customer message', () => {
    const input = 'Tôi ở Vinhomes Central Park tầng 25 căn A.25.07, STK 1234567890123'
    const out = scrubSensitiveForLLM(input)
    expect(out).toContain('[building]')
    expect(out).toContain('[floor]')
    expect(out).toContain('[unit]')
    expect(out).toContain('[bank-account]')
    expect(out).not.toContain('Vinhomes')
    expect(out).not.toContain('25')
  })

  it('does not strip legitimate problem description without PII', () => {
    expect(scrubSensitiveForLLM('Đèn bị chập, có mùi khét')).toBe('Đèn bị chập, có mùi khét')
    expect(scrubSensitiveForLLM('Vòi nước bị rò rỉ ở bồn rửa')).toBe(
      'Vòi nước bị rò rỉ ở bồn rửa',
    )
    expect(scrubSensitiveForLLM('Cần dọn dẹp sau sửa chữa')).toBe('Cần dọn dẹp sau sửa chữa')
  })

  it('does not strip standalone "tầng" without a number', () => {
    const input = 'Tầng dưới bị thấm nước'
    expect(scrubSensitiveForLLM(input)).toBe('Tầng dưới bị thấm nước')
  })

  it('does not strip short numbers (< 8 digits) outside phone/id patterns', () => {
    expect(scrubSensitiveForLLM('Tôi đếm 5 con muỗi')).toBe('Tôi đếm 5 con muỗi')
    expect(scrubSensitiveForLLM('Bóng đèn 60w')).toBe('Bóng đèn 60w')
    expect(scrubSensitiveForLLM('Hỏng 3 ổ cắm')).toBe('Hỏng 3 ổ cắm')
  })
})
