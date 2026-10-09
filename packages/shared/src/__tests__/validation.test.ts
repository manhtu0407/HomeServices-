import { describe, it, expect } from 'vitest'
import {
  serviceTypeSchema,
  jobCreateSchema,
  kaelChatCreateSchema,
  kaelChatConfirmSchema,
  kaelChatEvidenceSchema,
  kaelChatIntakeConfirmationDecisionSchema,
  kaelChatMediaRevokeSchema,
  kaelChatMediaUploadSchema,
  kaelChatProgressSchema,
  kaelChatTurnSchema,
  placesAutocompleteSchema,
  workerScopeChangeSchema,
  workerKaelChatTurnSchema,
  workerRegisterSchema,
  workerServiceAreaUpdateSchema,
  workerServicePreferencesUpdateSchema,
  workerCancellationRequestSchema,  workerAvatarUpdateSchema,
  workerAvatarUploadSchema,
  customerAvatarUpdateSchema,
  customerAvatarUploadSchema,
  jobMediaAttachSchema,
  devicePushTokenSchema,
  reviewSchema,
  chatMessageSchema,
  customerKaelConversationCreateSchema,
  customerKaelConversationPinSchema,
  customerKaelConversationRenameSchema,
  customerKaelConversationTurnSchema,
  jobMessageSendSchema,
  disputeOpenRequestSchema,
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

describe('customer avatar contracts', () => {
  it('accepts only bounded still images', () => {
    expect(customerAvatarUploadSchema.parse({
      file_name: 'avatar.png',
      mime_type: 'image/png',
      file_size_bytes: 5 * 1024 * 1024,
    })).toMatchObject({ mime_type: 'image/png' })

    expect(() => customerAvatarUploadSchema.parse({
      file_name: 'avatar.mp4',
      mime_type: 'video/mp4',
      file_size_bytes: 1024,
    })).toThrow()
    expect(() => customerAvatarUploadSchema.parse({
      file_name: 'avatar.jpg',
      mime_type: 'image/jpeg',
      file_size_bytes: 5 * 1024 * 1024 + 1,
    })).toThrow()
  })

  it('accepts only private customer-avatar refs without traversal', () => {
    expect(customerAvatarUpdateSchema.parse({
      avatar_ref: `supabase://customer-avatars/${UUID}/avatar.webp`,
    })).toEqual({
      avatar_ref: `supabase://customer-avatars/${UUID}/avatar.webp`,
    })

    expect(() => customerAvatarUpdateSchema.parse({
      avatar_ref: `supabase://customer-avatars/${UUID}/../other-user/avatar.webp`,
    })).toThrow()
    expect(() => customerAvatarUpdateSchema.parse({
      avatar_ref: `supabase://worker-avatars/${UUID}/avatar.webp`,
    })).toThrow()
    expect(() => customerAvatarUpdateSchema.parse({
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
    cccd_front_url: `supabase://worker-verification/${UUID}/cccd-front/front.jpg`,
    cccd_back_url: `supabase://worker-verification/${UUID}/cccd-back/back.jpg`,
    selfie_url: `supabase://worker-verification/${UUID}/selfie/selfie.jpg`,
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

  it('rejects public or cross-owner worker verification references', () => {
    expect(workerRegisterSchema.safeParse({
      ...validWorker,
      cccd_front_url: 'https://attacker.example/front.jpg',
    }).success).toBe(false)

    expect(workerRegisterSchema.safeParse({
      ...validWorker,
      selfie_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/selfie/selfie.jpg',
    }).success).toBe(false)
  })

  it('rejects future birth dates and one-sided home coordinates', () => {
    expect(workerRegisterSchema.safeParse({
      ...validWorker,
      date_of_birth: '2099-01-01',
    }).success).toBe(false)
    expect(workerRegisterSchema.safeParse({
      ...validWorker,
      home_lat: 10.762622,
    }).success).toBe(false)
    expect(workerRegisterSchema.safeParse({
      ...validWorker,
      home_lat: 10.762622,
      home_lng: 106.660172,
    }).success).toBe(true)
  })

  it('rejects one-sided service-area coordinate updates', () => {
    expect(workerServiceAreaUpdateSchema.safeParse({
      districts: ['q7'],
      home_lat: 10.762622,
    }).success).toBe(false)
    expect(workerServiceAreaUpdateSchema.safeParse({
      districts: ['q7'],
      home_lat: null,
      home_lng: null,
    }).success).toBe(true)
    expect(workerServiceAreaUpdateSchema.safeParse({
      districts: ['q7'],
      home_lat: null,
      home_lng: 106.660172,
    }).success).toBe(false)
    expect(workerServiceAreaUpdateSchema.safeParse({
      districts: ['q7'],
      home_lat: 10.762622,
      home_lng: null,
    }).success).toBe(false)
  })
})

describe('workerServicePreferencesUpdateSchema', () => {
  it('accepts only a non-empty unique set of worker-selected services', () => {
    expect(workerServicePreferencesUpdateSchema.parse({
      selected_service_types: ['plumbing', 'electrical'],
    })).toEqual({
      selected_service_types: ['plumbing', 'electrical'],
    })

    expect(workerServicePreferencesUpdateSchema.safeParse({
      selected_service_types: [],
    }).success).toBe(false)
    expect(workerServicePreferencesUpdateSchema.safeParse({
      selected_service_types: ['plumbing', 'plumbing'],
    }).success).toBe(false)
    expect(workerServicePreferencesUpdateSchema.safeParse({
      selected_service_types: ['painting'],
    }).success).toBe(false)
  })

  it('accepts only declared capabilities that belong to a selected service', () => {
    expect(workerServicePreferencesUpdateSchema.safeParse({
      selected_service_types: ['hvac'],
      problem_specializations: ['hvac_fault_diagnosis'],
    }).success).toBe(true)
    expect(workerServicePreferencesUpdateSchema.safeParse({
      selected_service_types: ['hvac'],
      problem_specializations: ['electrical_fault_isolation'],
    }).success).toBe(false)
    expect(workerServicePreferencesUpdateSchema.safeParse({
      selected_service_types: ['hvac'],
      problem_specializations: ['hvac_fault_diagnosis', 'hvac_fault_diagnosis'],
    }).success).toBe(false)
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
    expect(jobCreateSchema.safeParse({
      ...validJob,
      scheduled_at: '2026-02-31T10:00:00.000Z',
    }).success).toBe(false)
  })

  it('rejects whitespace-only booking text and non-v4 retry ids', () => {
    expect(jobCreateSchema.safeParse({
      ...validJob,
      description: ' '.repeat(12),
    }).success).toBe(false)
    expect(jobCreateSchema.safeParse({
      ...validJob,
      client_request_id: '550e8400-e29b-11d4-a716-446655440000',
    }).success).toBe(false)
  })
})

// ===================================================================
// workerScopeChangeSchema — STRUCTURES.md A11/B6
// ===================================================================

describe('kaelChat schemas', () => {
  it('rejects whitespace-only messages and problem chips', () => {
    expect(kaelChatTurnSchema.safeParse({ message: '   ' }).success).toBe(false)
    expect(kaelChatCreateSchema.safeParse({
      service_type: 'electrical',
      message: '   ',
    }).success).toBe(false)
    expect(kaelChatCreateSchema.safeParse({
      service_type: 'electrical',
      problem_chips: ['   '],
    }).success).toBe(false)
  })

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

  it('requires a complete structured booking before opening the intake confirmation Pre-Step', () => {
    const booking = {
      address_district: 'Quận 3',
      address_label: 'Chung cư Căn Hộ An Gia, Quận 3',
      intake_description: 'Ổ cắm chập chờn và phát tiếng lẹt xẹt khi sử dụng.',
      intake_source: 'booking',
      message: 'Dịch vụ: Sửa điện. Vấn đề: Ổ cắm/công tắc hỏng.',
      problem_chips: ['Ổ cắm/công tắc hỏng'],
      profile_id: 'electric_diagnose',
      schedule_window: {
        date: '2026-07-30',
        end: '12:00',
        start: '10:00',
        time_zone: 'Asia/Ho_Chi_Minh',
      },
      scheduled_at: '2026-07-30T03:00:00.000Z',
      service_type: 'electrical',
    }

    expect(kaelChatCreateSchema.parse(booking)).toMatchObject({
      intake_source: 'booking',
      intake_description: booking.intake_description,
    })
    expect(kaelChatCreateSchema.safeParse({
      ...booking,
      intake_description: undefined,
    }).success).toBe(false)
    expect(kaelChatCreateSchema.safeParse({
      ...booking,
      schedule_window: undefined,
    }).success).toBe(false)
  })

  it('accepts only an explicit intake confirmation or correction request', () => {
    expect(kaelChatIntakeConfirmationDecisionSchema.parse({
      decision: 'confirmed',
    })).toEqual({ decision: 'confirmed' })
    expect(kaelChatIntakeConfirmationDecisionSchema.parse({
      decision: 'correction_requested',
    })).toEqual({ decision: 'correction_requested' })
    expect(kaelChatIntakeConfirmationDecisionSchema.safeParse({
      decision: 'skip',
    }).success).toBe(false)
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

  it('rejects a skipped evidence decision that still carries evidence', () => {
    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'skipped',
      evidence_items: [{
        kind: 'voice_transcript',
        transcript: 'This transcript should not be retained after skipping.',
        model_eligible: true,
      }],
    }).success).toBe(false)

    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'skipped',
      media_refs: [`supabase://kael-chat-media/${UUID}/kael-chat/model_vision/photo.jpg`],
    }).success).toBe(false)
  })

  it('requires a short reason before continuing without optional evidence', () => {
    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'skipped',
    }).success).toBe(false)
    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'skipped',
      skip_reason: 'Không có ảnh hiện trạng lúc này.',
    }).success).toBe(true)
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

  it('separates a price question from a scope adjustment and binds approval to a receipt', () => {
    expect(kaelChatTurnSchema.parse({
      message: 'Why is the upper amount needed for this scope?',
      turn_intent: 'price_question',
    }).turn_intent).toBe('price_question')
    expect(kaelChatTurnSchema.parse({
      message: 'The leak reaches the wall behind the basin.',
      turn_intent: 'scope_adjustment',
    }).turn_intent).toBe('scope_adjustment')
    expect(kaelChatTurnSchema.safeParse({
      message: 'Please change the price.',
      turn_intent: 'repricing',
    }).success).toBe(false)
    expect(kaelChatConfirmSchema.parse({
      price_reasoning_receipt_id: 'receipt_kael_price_20260811_01',
    }).price_reasoning_receipt_id).toBe('receipt_kael_price_20260811_01')
    expect(kaelChatConfirmSchema.safeParse({
      price_reasoning_receipt_id: ' ',
    }).success).toBe(false)
  })

  it('rejects traversal-like Kael media refs for customer and worker turns', () => {
    expect(kaelChatMediaRevokeSchema.safeParse({
      media_refs: ['supabase://kael-chat-media/../kael-chat/model_vision/photo.jpg'],
    }).success).toBe(false)

    expect(workerKaelChatTurnSchema.safeParse({
      message: 'Please inspect this reference.',
      media_refs: [`supabase://job-media/${UUID}/kael_reference/../../after/photo.jpg`],
      client_request_id: UUID,
    }).success).toBe(false)
    expect(workerKaelChatTurnSchema.safeParse({
      message: 'Please inspect this reference.',
      media_refs: [`supabase://job-media/${UUID}/kael_reference/nested/photo.jpg`],
      client_request_id: UUID,
    }).success).toBe(false)
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

  it('accepts only unique private vision-image refs for normal chat', () => {
    const imageRef = `supabase://kael-chat-media/${UUID}/kael-chat/model_vision/room.jpg`
    const videoRef = `supabase://kael-chat-media/${UUID}/kael-chat/private_video_original/room.mp4`
    const base = { client_request_id: UUID, language: 'vi', message: 'Phân tích ảnh này' }

    expect(customerKaelConversationTurnSchema.parse({ ...base, media_refs: [imageRef] }).media_refs).toEqual([imageRef])
    expect(() => customerKaelConversationTurnSchema.parse({ ...base, media_refs: [videoRef] })).toThrow()
    expect(() => customerKaelConversationTurnSchema.parse({ ...base, media_refs: [imageRef, imageRef] })).toThrow()
    expect(() => customerKaelConversationTurnSchema.parse({ ...base, media_refs: Array(6).fill(imageRef) })).toThrow()
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

describe('workerScopeChangeSchema price authority', () => {
  // Workers do not propose price. Kael computes a new
  // estimate from worker's reported scope. Schema accepts description + reason
  // + retry key + optional photo_urls only. Price tests were removed because workers no
  // longer pass price; Kael owns price authority.
  const validScope = {
    client_request_id: '11111111-1111-4111-8111-111111111111',
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

  it('rejects a non-v4 scope-change retry id', () => {
    expect(workerScopeChangeSchema.safeParse({
      ...validScope,
      client_request_id: '550e8400-e29b-11d4-a716-446655440000',
    }).success).toBe(false)
  })
})

// ===================================================================
// reviewSchema — STRUCTURES.md A14
// ===================================================================

describe('workflow support schemas', () => {
  it('validates worker cancellation request evidence safely', () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    expect(workerCancellationRequestSchema.parse({
      reason: 'Thợ không thể tiếp tục vì cần thiết bị an toàn bổ sung.',
      evidence_photo_urls: [`supabase://job-media/${jobId}/cancellation_evidence/evidence.jpg`],
    }).evidence_photo_urls).toHaveLength(1)

    expect(workerCancellationRequestSchema.safeParse({
      reason: 'Thợ không thể tiếp tục vì cần thiết bị an toàn bổ sung.',
      evidence_photo_urls: ['https://attacker.example/evidence.jpg'],
    }).success).toBe(false)
    expect(workerCancellationRequestSchema.safeParse({
      reason: 'quá ngắn',
      evidence_photo_urls: [`supabase://job-media/${jobId}/cancellation_evidence/evidence.jpg`],
    }).success).toBe(false)
  })


  it('validates job media attachment payloads', () => {
    expect(() =>
      jobMediaAttachSchema.parse({
        assets: [{
          object_path: `${UUID}/before/photo.jpg`,
          stage: 'before',
          mime_type: 'image/jpeg',
          file_size_bytes: 1200,
        }],
      })
    ).not.toThrow()

    expect(() =>
      jobMediaAttachSchema.parse({
        assets: Array.from({ length: 6 }, (_, index) => ({
          object_path: `${UUID}/before/${index}.jpg`,
          stage: 'before',
        })),
      })
    ).toThrow()
  })

  it('rejects arbitrary remote dispute evidence URLs', () => {
    const base = {
      dispute_type: 'damage_claim' as const,
      initiator_statement: 'The completed work caused visible damage that needs review.',
    }
    expect(disputeOpenRequestSchema.safeParse({
      ...base,
      evidence_photo_urls: ['https://attacker.example/evidence.jpg'],
    }).success).toBe(false)
    expect(disputeOpenRequestSchema.safeParse({
      ...base,
      evidence_photo_urls: [`supabase://job-media/${UUID}/after/evidence.jpg`],
    }).success).toBe(true)
    expect(disputeOpenRequestSchema.safeParse({
      ...base,
      evidence_photo_urls: [`supabase://job-media/${UUID}/after/nested/evidence.jpg`],
    }).success).toBe(false)
  })

  it('rejects unsafe, stage-mismatched, empty, or duplicate media attachments', () => {
    const asset = {
      object_path: `${UUID}/before/photo.jpg`,
      stage: 'before' as const,
      mime_type: 'image/jpeg',
      file_size_bytes: 1200,
    }

    expect(jobMediaAttachSchema.safeParse({
      assets: [{ ...asset, object_path: `${UUID}/before/../after/photo.jpg` }],
    }).success).toBe(false)
    expect(jobMediaAttachSchema.safeParse({
      assets: [{ ...asset, object_path: `${UUID}/after/photo.jpg` }],
    }).success).toBe(false)
    expect(jobMediaAttachSchema.safeParse({
      assets: [{ ...asset, object_path: `${UUID}/before/nested/photo.jpg` }],
    }).success).toBe(false)
    expect(jobMediaAttachSchema.safeParse({
      assets: [{ ...asset, file_size_bytes: 0 }],
    }).success).toBe(false)
    expect(jobMediaAttachSchema.safeParse({ assets: [asset, asset] }).success).toBe(false)
  })

  it('accepts scope-change evidence as its own media stage', () => {
    expect(() =>
      jobMediaAttachSchema.parse({
        assets: [{
          object_path: '11111111-1111-4111-8111-111111111111/scope_change_evidence/evidence.jpg',
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
          object_path: '11111111-1111-4111-8111-111111111111/access_check_in/lobby.jpg',
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

  it('rejects whitespace-only tags', () => {
    expect(reviewSchema.safeParse({ ...validReview, tags: ['   '] }).success).toBe(false)
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

  it('rejects whitespace-only content on both chat message boundaries', () => {
    expect(chatMessageSchema.safeParse({ job_id: UUID, content: '   ' }).success).toBe(false)
    expect(jobMessageSendSchema.safeParse({ content: '\n\t ' }).success).toBe(false)
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

  it('does not split a Unicode surrogate pair at the length boundary', () => {
    const sanitized = sanitizeForLLM(`${'A'.repeat(4999)}😀`)

    expect(sanitized).toBe('A'.repeat(4999))
    expect(sanitized).not.toMatch(/[\uD800-\uDFFF]$/)
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

  it('removes C1, bidi, and zero-width formatting controls from prompt text', () => {
    expect(sanitizeForLLM('safe\u0085\u200B\u202E\u2066text')).toBe('safetext')
  })
})

describe('scrubSensitiveForLLM', () => {
  it('removes phone, email, and id-like numbers after sanitizing text', () => {
    const input = '  SĐT 0901234567, email tu@example.com, CCCD 001234567890\x00  '

    expect(scrubSensitiveForLLM(input)).toBe('SĐT [phone], email [email], CCCD [id-number]')
  })

  it('removes long unlabelled bank-account numbers', () => {
    expect(scrubSensitiveForLLM('STK 1234567890123456')).toBe('STK [bank-account]')
    expect(scrubSensitiveForLLM('Tài khoản 12345678901234567890')).toBe('Tài khoản [bank-account]')
  })

  it('preserves ordinary apartment wording and redacts only a real unit identifier', () => {
    expect(scrubSensitiveForLLM('Vị trí nào trong căn hộ cần xử lý?')).toBe(
      'Vị trí nào trong căn hộ cần xử lý?',
    )
    expect(scrubSensitiveForLLM('Vị trí là căn hộ A.25.07.')).toBe('Vị trí là [unit].')
  })

})
