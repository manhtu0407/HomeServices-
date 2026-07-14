import { describe, it, expect } from 'vitest'
import {
  serviceTypeSchema,
  jobCreateSchema,
  kaelChatCreateSchema,
  kaelChatEvidenceSchema,
  kaelChatMediaUploadSchema,
  kaelChatProgressSchema,
  kaelChatTurnSchema,
  placesAutocompleteSchema,
  workerScopeChangeSchema,
  workerRegisterSchema,
  workerCancellationRequestSchema,
  workerCancellationDecisionSchema,
  workerAvatarUpdateSchema,
  workerAvatarUploadSchema,
  jobMediaAttachSchema,
  devicePushTokenSchema,
  reviewSchema,
  chatMessageSchema,
  customerKaelConversationCreateSchema,
  customerKaelConversationPinSchema,
  customerKaelConversationRenameSchema,
  customerKaelConversationTurnSchema,
  sanitizeForLLM,
  scrubSensitiveForLLM,
  SERVICE_TYPES,
} from '../index'

// Valid UUID for reuse
const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('worker avatar contracts', () => {
  it('accepts only bounded JPEG, PNG, or WebP profile images', () => {
    expect(workerAvatarUploadSchema.parse({
      file_name: 'avatar.webp',
      mime_type: 'image/webp',
      file_size_bytes: 5 * 1024 * 1024,
    })).toMatchObject({ mime_type: 'image/webp' })

    expect(() => workerAvatarUploadSchema.parse({
      file_name: 'avatar.mp4',
      mime_type: 'video/mp4',
      file_size_bytes: 1024,
    })).toThrow()
    expect(() => workerAvatarUploadSchema.parse({
      file_name: 'avatar.jpg',
      mime_type: 'image/jpeg',
      file_size_bytes: 5 * 1024 * 1024 + 1,
    })).toThrow()
  })

  it('accepts only private worker-avatar refs without traversal', () => {
    expect(workerAvatarUpdateSchema.parse({
      avatar_ref: `supabase://worker-avatars/${UUID}/avatar.webp`,
    })).toEqual({
      avatar_ref: `supabase://worker-avatars/${UUID}/avatar.webp`,
    })

    expect(() => workerAvatarUpdateSchema.parse({
      avatar_ref: `supabase://worker-avatars/${UUID}/../other-worker/avatar.webp`,
    })).toThrow()
    expect(() => workerAvatarUpdateSchema.parse({
      avatar_ref: 'https://example.test/fake-avatar.jpg',
    })).toThrow()
  })
})

// ===================================================================
// Rule #6: Kael chỉ trả lời về điện, nước, và vệ sinh — hard enforcement
// ===================================================================

describe('serviceTypeSchema (Rule #6: six approved home services)', () => {
  it('accepts electrical', () => {
    expect(serviceTypeSchema.parse('electrical')).toBe('electrical')
  })

  it('accepts plumbing', () => {
    expect(serviceTypeSchema.parse('plumbing')).toBe('plumbing')
  })

  it('accepts cleaning', () => {
    expect(serviceTypeSchema.parse('cleaning')).toBe('cleaning')
  })

  it.each(['hvac', 'upholstery', 'handyman'] as const)('accepts %s', (serviceType) => {
    expect(serviceTypeSchema.parse(serviceType)).toBe(serviceType)
  })

  it('still rejects an unsupported service', () => {
    expect(() => serviceTypeSchema.parse('painting')).toThrow()
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

describe('workerRegisterSchema districts', () => {
  const validWorker = {
    legal_name: 'Nguyen Van A',
    date_of_birth: '1990-01-01',
    service_types: ['plumbing'],
    years_experience: 5,
    districts: ['q7'],
    cccd_front_url: 'https://example.test/front.jpg',
    cccd_back_url: 'https://example.test/back.jpg',
    selfie_url: 'https://example.test/selfie.jpg',
    bank_account: '123456789',
    bank_name: 'VCB',
  }

  it('accepts explicit hcmc_all city-wide worker coverage', () => {
    const parsed = workerRegisterSchema.parse({
      ...validWorker,
      districts: ['hcmc_all'],
    })

    expect(parsed.districts).toEqual(['hcmc_all'])
  })

  it('still rejects unknown districts instead of silently granting hcmc_all', () => {
    expect(() =>
      workerRegisterSchema.parse({
        ...validWorker,
        districts: ['ha_noi'],
      }),
    ).toThrow()
  })

  it('accepts all six approved capabilities without widening beyond the launch set', () => {
    const parsed = workerRegisterSchema.parse({
      ...validWorker,
      service_types: [...SERVICE_TYPES],
    })

    expect(parsed.service_types).toEqual([...SERVICE_TYPES])
  })
})

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
// workerScopeChangeSchema — STRUCTURES.md A11/B6
// ===================================================================

describe('kaelChat schemas', () => {
  it('accepts a Kael chat session start with text and district', () => {
    const result = kaelChatCreateSchema.parse({
      service_type: 'plumbing',
      message: 'Ống nước dưới lavabo đang rò liên tục',
      problem_chips: ['Ống rò rỉ'],
      photo_urls: [],
      address_label: 'Landmark 81, Bình Thạnh, TP.HCM',
      address_district: 'q7',
    })

    expect(result.service_type).toBe('plumbing')
    expect(result.problem_chips).toEqual(['Ống rò rỉ'])
    expect(result.address_label).toContain('Landmark')
  })

  it('accepts a matching six-service profile and structured time window', () => {
    const result = kaelChatCreateSchema.parse({
      service_type: 'hvac',
      profile_id: 'air_scope',
      message: 'Máy lạnh yếu và chảy nước.',
      scheduled_at: '2026-07-12T01:00:00.000Z',
      schedule_window: {
        date: '2026-07-12',
        start: '08:00',
        end: '10:00',
        time_zone: 'Asia/Ho_Chi_Minh',
      },
    })

    expect(result.profile_id).toBe('air_scope')
    expect(() => kaelChatCreateSchema.parse({
      ...result,
      profile_id: 'task_scope',
    })).toThrow()
  })

  it('keeps voice on device and accepts only a reviewed transcript', () => {
    expect(() => kaelChatMediaUploadSchema.parse({
      file_name: 'voice.m4a',
      mime_type: 'audio/mp4',
    })).toThrow()

    const evidence = kaelChatEvidenceSchema.parse({
      decision: 'confirmed',
      evidence_items: [{
        kind: 'voice_transcript',
        transcript: 'Máy kêu to hơn bình thường.',
        model_eligible: true,
      }],
    })
    expect(evidence.evidence_items?.[0].kind).toBe('voice_transcript')
  })

  it('validates Places autocomplete input for the Edge proxy', () => {
    expect(placesAutocompleteSchema.parse({ input: 'Bình Thạnh' }).input).toBe('Bình Thạnh')
    expect(() => placesAutocompleteSchema.parse({ input: 'x' })).toThrow()
    expect(() => placesAutocompleteSchema.parse({ input: 'x'.repeat(200) })).toThrow()
  })

  it('accepts a follow-up turn while limiting media payload size', () => {
    expect(() =>
      kaelChatTurnSchema.parse({
        message: 'Tôi gửi thêm ảnh vị trí bị rò.',
        photo_urls: ['https://example.com/leak.jpg'],
      })
    ).not.toThrow()

    expect(() =>
      kaelChatTurnSchema.parse({
        message: 'Quá nhiều ảnh',
        photo_urls: Array.from({ length: 6 }, (_, index) => `https://example.com/${index}.jpg`),
      })
    ).toThrow()
  })
})

describe('Customer Kael conversation schemas', () => {
  it.each(['normal', 'case'] as const)('accepts the explicit %s catalog mode', (mode) => {
    expect(customerKaelConversationCreateSchema.parse({
      client_request_id: UUID,
      mode,
    })).toEqual({ client_request_id: UUID, mode })
  })

  it('keeps turns idempotent, bounded, and strict', () => {
    expect(customerKaelConversationTurnSchema.parse({
      client_request_id: UUID,
      language: 'vi',
      message: 'Kiểm tra máy lạnh phòng ngủ',
    })).toMatchObject({ language: 'vi' })
    expect(() => customerKaelConversationTurnSchema.parse({
      client_request_id: UUID,
      language: 'vi',
      message: ' ',
    })).toThrow()
    expect(() => customerKaelConversationTurnSchema.parse({
      client_request_id: UUID,
      language: 'vi',
      message: 'Nội dung',
      service_type: 'plumbing',
    })).toThrow()
  })

  it('validates rename and pin actions', () => {
    expect(customerKaelConversationRenameSchema.parse({ title: 'Nhà bếp' })).toEqual({ title: 'Nhà bếp' })
    expect(customerKaelConversationPinSchema.parse({ pinned: true })).toEqual({ pinned: true })
    expect(() => customerKaelConversationRenameSchema.parse({ title: ' '.repeat(65) })).toThrow()
  })
})

describe('kaelChatProgressSchema', () => {
  it('accepts safe Kael progress telemetry only', () => {
    const parsed = kaelChatProgressSchema.parse({
      current_stage: 'market_lookup',
      status: 'running',
      progress: 0.32,
      failure_reason: null,
      updated_at: '2026-06-04T13:58:30.716Z',
    })

    expect(parsed.current_stage).toBe('market_lookup')
    expect(parsed.progress).toBe(0.32)
    expect(kaelChatProgressSchema.parse({
      current_stage: 'scope_estimating',
      status: 'running',
      progress: 0.68,
      failure_reason: null,
      updated_at: '2026-06-04T13:58:30.716Z',
    }).current_stage).toBe('scope_estimating')
  })

  it('rejects out-of-range progress and unknown raw/provider fields', () => {
    expect(() =>
      kaelChatProgressSchema.parse({
        current_stage: 'price_synthesis',
        status: 'running',
        progress: 1.2,
        failure_reason: null,
        updated_at: '2026-06-04T13:58:30.716Z',
      })
    ).toThrow()

    expect(() =>
      kaelChatProgressSchema.parse({
        current_stage: 'price_synthesis',
        status: 'running',
        progress: 0.9,
        failure_reason: null,
        updated_at: '2026-06-04T13:58:30.716Z',
        provider: 'anthropic',
        raw_customer_text: 'Ống nước căn 1201 bị rò',
      })
    ).toThrow()
  })
})

describe('workerScopeChangeSchema (Phase 2.0 2026-05-23: no price fields)', () => {
  // Phase 2.0 (plan §22.7.B): worker does not propose price. Kael compute new
  // estimate from worker's reported scope. Schema accepts description + reason
  // + optional photo_urls only. Price tests were removed because workers no
  // longer pass price; the price authority moved to Kael per Tu's decision
  // 2026-05-23.
  const validScope = {
    new_description: 'Phạm vi thay đổi do ống chính bị hỏng',
    reason: 'Phát hiện ống chính rỉ nước nghiêm trọng',
    photo_urls: [],
  }

  it('accepts valid scope change (description + reason + optional photos)', () => {
    expect(() => workerScopeChangeSchema.parse(validScope)).not.toThrow()
  })

  it('does NOT require job_id in body (comes from URL params)', () => {
    expect(workerScopeChangeSchema.safeParse(validScope).success).toBe(true)
  })

  it('rejects price fields if a regressed client sends them', () => {
    // .strict() not enforced; current zod accepts unknown keys silently. But the
    // parsed object MUST NOT carry a price field — Edge ignores it anyway.
    const parsed = workerScopeChangeSchema.parse({
      ...validScope,
      new_price_min: 200000,
      new_price_max: 400000,
    } as unknown as typeof validScope)
    expect(parsed).not.toHaveProperty('new_price_min')
    expect(parsed).not.toHaveProperty('new_price_max')
  })

  it('accepts up to 5 photo urls', () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    expect(() =>
      workerScopeChangeSchema.parse({
        ...validScope,
        photo_urls: [
          `supabase://job-media/${jobId}/scope_change_evidence/1.jpg`,
          `supabase://job-media/${jobId}/scope_change_evidence/2.jpg`,
          `supabase://job-media/${jobId}/scope_change_evidence/3.jpg`,
          `supabase://job-media/${jobId}/scope_change_evidence/4.jpg`,
          `supabase://job-media/${jobId}/scope_change_evidence/5.jpg`,
        ],
      })
    ).not.toThrow()
  })

  it('rejects arbitrary remote URLs as scope evidence', () => {
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
      workerScopeChangeSchema.parse({ ...validScope, reason: 'short' })
    ).toThrow()
  })
})

// ===================================================================
// reviewSchema — STRUCTURES.md A14
// ===================================================================

describe('workflow support schemas', () => {
  it('validates worker cancellation request evidence safely', () => {
    expect(workerCancellationRequestSchema.parse({
      reason: 'Thợ không thể tiếp tục vì cần thiết bị an toàn bổ sung.',
      evidence_photo_urls: ['https://example.com/evidence.jpg'],
    }).evidence_photo_urls).toHaveLength(1)

    expect(() =>
      workerCancellationRequestSchema.parse({
        reason: 'quá ngắn',
        evidence_photo_urls: ['not-a-url'],
      })
    ).toThrow()
  })

  it('validates worker cancellation decisions', () => {
    expect(workerCancellationDecisionSchema.parse({ decision: 'approve' }).decision).toBe('approve')
    expect(() => workerCancellationDecisionSchema.parse({ decision: 'maybe' })).toThrow()
  })

  it('validates job media attachment payloads', () => {
    expect(() =>
      jobMediaAttachSchema.parse({
        assets: [{
          object_path: 'job-1/before/photo.jpg',
          stage: 'before',
          mime_type: 'image/jpeg',
          file_size_bytes: 1200,
        }],
      })
    ).not.toThrow()

    expect(() =>
      jobMediaAttachSchema.parse({
        assets: Array.from({ length: 6 }, (_, index) => ({
          object_path: `job-1/before/${index}.jpg`,
          stage: 'before',
        })),
      })
    ).toThrow()
  })

  it('accepts scope-change evidence as its own media stage', () => {
    expect(() =>
      jobMediaAttachSchema.parse({
        assets: [{
          object_path: '11111111-1111-1111-1111-111111111111/scope_change_evidence/evidence.jpg',
          stage: 'scope_change_evidence',
          mime_type: 'image/jpeg',
          file_size_bytes: 1200,
        }],
      })
    ).not.toThrow()
  })

  it('accepts the §32.7 worker lobby check-in photo as its own media stage', () => {
    expect(() =>
      jobMediaAttachSchema.parse({
        assets: [{
          object_path: '11111111-1111-1111-1111-111111111111/access_check_in/lobby.jpg',
          stage: 'access_check_in',
          mime_type: 'image/jpeg',
          file_size_bytes: 1200,
        }],
      })
    ).not.toThrow()
  })

  it('validates device push token registration payloads', () => {
    expect(devicePushTokenSchema.parse({
      platform: 'ios',
      push_token: 'ExponentPushToken[valid-token]',
      permission_status: 'granted',
    }).safe_metadata).toEqual({})

    expect(() =>
      devicePushTokenSchema.parse({
        platform: 'desktop',
        push_token: 'short',
        permission_status: 'granted',
      })
    ).toThrow()
  })
})

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

describe('scrubSensitiveForLLM', () => {
  it('removes phone, email, and id-like numbers after sanitizing text', () => {
    const input = '  SĐT 0901234567, email tu@example.com, CCCD 001234567890\x00  '

    expect(scrubSensitiveForLLM(input)).toBe('SĐT [phone], email [email], CCCD [id-number]')
  })
})
