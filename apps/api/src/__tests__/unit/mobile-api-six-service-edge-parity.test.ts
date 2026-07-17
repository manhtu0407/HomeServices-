import { describe, expect, it } from 'vitest'
import {
  JOB_STATUSES,
  SERVICE_TYPES,
  jobMediaAttachSchema,
  kaelChatCreateSchema,
  kaelChatEvidenceSchema,
  kaelChatMediaUploadSchema,
  kaelChatTurnSchema,
  serviceTypeSchema,
  workerCancellationRequestSchema,
  workerRegisterSchema,
} from '../../../../../supabase/functions/_shared/domain'
import {
  asServiceType,
  asServiceTypeArray,
  nullableServiceType,
} from '../../../../../supabase/functions/mobile-api/_shared/services/_runtime/coercions'
import {
  buildFallbackIntent,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/stages/intent'
import {
  evaluateMessageBoundary,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/guards/boundary-guard'
import {
  buildIntakeDiagnosisMessages,
  buildIntentMessages,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/charter/prompts'
import {
  FALLBACK_PROBLEM_SLUG_BY_SERVICE,
  intentResultSchema,
  PROBLEM_SLUGS_BY_SERVICE,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/types'
import {
  getPublicKaelCharter,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/charter/system-prompt'
import {
  getKaelPerformanceProfile,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/case-work/performance-profiles'
import {
  kaelServiceLabelVi,
  serviceLabel,
} from '../../../../../supabase/functions/mobile-api/_shared/services/_runtime/shared'
import {
  buildCustomerProfileInsights,
} from '../../../../../supabase/functions/mobile-api/_shared/services/profile-insights/index'
import {
  validateTransition,
} from '../../../../../supabase/functions/mobile-api/_shared/lifecycle'

const SIX_SERVICES = [
  'electrical',
  'plumbing',
  'cleaning',
  'hvac',
  'upholstery',
  'handyman',
] as const

describe('Edge six-service domain parity', () => {
  it('accepts exactly the six launched services across schemas and worker capability input', () => {
    expect(SERVICE_TYPES).toEqual(SIX_SERVICES)
    for (const service of SIX_SERVICES) {
      expect(serviceTypeSchema.parse(service)).toBe(service)
    }
    expect(serviceTypeSchema.safeParse('appliance_repair').success).toBe(false)

    const worker = workerRegisterSchema.safeParse({
      legal_name: 'Nguyen Van A',
      date_of_birth: '1990-01-01',
      service_types: [...SIX_SERVICES],
      years_experience: 5,
      districts: ['q1'],
      cccd_front_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/cccd-front/front.jpg',
      cccd_back_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/cccd-back/back.jpg',
      selfie_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/selfie/selfie.jpg',
      bank_account: '1234567890',
      bank_name: 'Vietcombank',
    })
    expect(worker.success).toBe(true)
    expect(JOB_STATUSES).toContain('worker_candidate_pending')
    expect(validateTransition('broadcasting', 'worker_matched').valid).toBe(false)
    expect(validateTransition('broadcasting', 'worker_candidate_pending').valid).toBe(true)
    expect(validateTransition('worker_candidate_pending', 'worker_matched').valid).toBe(true)
  })

  it('rejects public, cross-owner, traversal, and contradictory private media inputs', () => {
    const worker = {
      legal_name: 'Nguyen Van A',
      date_of_birth: '1990-01-01',
      service_types: ['electrical'],
      years_experience: 5,
      districts: ['q1'],
      cccd_front_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/cccd-front/front.jpg',
      cccd_back_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/cccd-back/back.jpg',
      selfie_url: 'supabase://worker-verification/22222222-2222-4222-8222-222222222222/selfie/selfie.jpg',
      bank_account: '1234567890',
      bank_name: 'Vietcombank',
    }
    expect(workerRegisterSchema.safeParse(worker).success).toBe(false)
    expect(workerRegisterSchema.safeParse({
      ...worker,
      cccd_front_url: 'https://example.test/front.jpg',
    }).success).toBe(false)

    expect(workerCancellationRequestSchema.safeParse({
      reason: 'The worker cannot safely continue this job.',
      evidence_photo_urls: ['https://example.test/cancellation.jpg'],
    }).success).toBe(false)
    expect(workerCancellationRequestSchema.safeParse({
      reason: 'The worker cannot safely continue this job.',
      evidence_photo_urls: [
        'supabase://job-media/11111111-1111-4111-8111-111111111111/cancellation_evidence/photo.jpg',
      ],
    }).success).toBe(true)

    const objectPath = '11111111-1111-4111-8111-111111111111/before/photo.jpg'
    expect(jobMediaAttachSchema.safeParse({
      assets: [{ object_path: objectPath, stage: 'after', file_size_bytes: 1 }],
    }).success).toBe(false)
    expect(jobMediaAttachSchema.safeParse({
      assets: [
        { object_path: objectPath, stage: 'before', file_size_bytes: 1 },
        { object_path: objectPath.toUpperCase(), stage: 'before', file_size_bytes: 1 },
      ],
    }).success).toBe(false)
    expect(jobMediaAttachSchema.safeParse({
      assets: [{ object_path: objectPath, stage: 'before', file_size_bytes: 0 }],
    }).success).toBe(false)
  })

  it('coerces all six services and fails closed instead of silently becoming electrical', () => {
    for (const service of SIX_SERVICES) {
      expect(asServiceType(service)).toBe(service)
      expect(nullableServiceType(service)).toBe(service)
    }
    expect(nullableServiceType('appliance_repair')).toBeNull()
    expect(() => asServiceType('appliance_repair')).toThrow(/service_type/i)
    expect(asServiceTypeArray([...SIX_SERVICES, 'appliance_repair'])).toEqual(SIX_SERVICES)
  })

  it('keeps service labels and customer profile usage distinct for all six services', () => {
    expect(new Set(SIX_SERVICES.map((service) => serviceLabel(service))).size).toBe(6)
    expect(kaelServiceLabelVi('not-a-service')).toBe('dịch vụ nhà ở')
    expect(serviceLabel('not-a-service' as never)).toBe('Dịch vụ nhà ở')
    const insights = buildCustomerProfileInsights({
      customerId: '11111111-1111-4111-8111-111111111111',
      customerProfile: null,
      disputes: [],
      kaelInteractionCount: 0,
      jobs: SIX_SERVICES.map((service, index) => ({
        id: `job-${index}`,
        status: 'completed_by_worker',
        service_type: service,
        created_at: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        completed_at: `2026-07-${String(index + 1).padStart(2, '0')}T01:00:00.000Z`,
        paid_at: null,
        reviewed_at: null,
        final_price: null,
        kael_price_min: null,
        kael_price_max: null,
      })),
      reviews: [],
      savedAddressCount: 0,
    })
    expect(insights.preferred_service_count).toBe(6)
  })

  it('accepts structured private evidence while rejecting raw voice media refs', () => {
    const voiceTranscript = {
      kind: 'voice_transcript' as const,
      transcript: 'Máy lạnh bắt đầu chảy nước từ tối qua.',
      model_eligible: true,
    }
    const create = kaelChatCreateSchema.safeParse({
      service_type: 'hvac',
      profile_id: 'air_scope',
      scheduled_at: '2026-07-12T08:00:00.000Z',
      schedule_window: {
        date: '2026-07-12',
        start: '08:00',
        end: '10:00',
        time_zone: 'Asia/Ho_Chi_Minh',
      },
      message: 'Máy lạnh chảy nước',
      evidence_items: [voiceTranscript],
    })
    expect(create.success).toBe(true)
    if (create.success) {
      expect(create.data.evidence_items).toEqual([voiceTranscript])
      expect(create.data).toMatchObject({
        schedule_window: {
          date: '2026-07-12',
          start: '08:00',
          end: '10:00',
          time_zone: 'Asia/Ho_Chi_Minh',
        },
      })
    }
    expect(kaelChatCreateSchema.safeParse({
      service_type: 'hvac',
      profile_id: 'fabric_scope',
      message: 'Máy lạnh chảy nước',
    }).success).toBe(false)
    const turn = kaelChatTurnSchema.safeParse({
      message: 'Tôi đã kiểm tra lại bản ghi.',
      evidence_items: [voiceTranscript],
      schedule_window: {
        date: '2026-07-12',
        start: '08:00',
        end: '10:00',
        time_zone: 'Asia/Ho_Chi_Minh',
      },
    })
    expect(turn.success).toBe(true)
    if (turn.success) expect(turn.data.evidence_items).toEqual([voiceTranscript])
    expect(kaelChatTurnSchema.safeParse({
      message: 'Khung giờ không hợp lệ.',
      schedule_window: {
        date: '2026-07-12',
        start: '10:00',
        end: '08:00',
        time_zone: 'Asia/Ho_Chi_Minh',
      },
    }).success).toBe(false)
    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'confirmed',
      evidence_items: [voiceTranscript],
    }).success).toBe(true)
    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'skipped',
      evidence_items: [voiceTranscript],
    }).success).toBe(false)
    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'skipped',
      media_refs: ['supabase://kael-chat-media/user-1/kael-chat/model_vision/frame.jpg'],
    }).success).toBe(false)
    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'skipped',
      photo_urls: ['https://example.test/private-evidence.jpg'],
    }).success).toBe(false)
    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'confirmed',
      media_refs: ['supabase://kael-chat-media/../kael-chat/model_vision/frame.jpg'],
    }).success).toBe(false)

    const rawAudioRef = 'supabase://kael-chat-media/user-1/kael-chat/session/evidence.m4a'
    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'confirmed',
      media_refs: [rawAudioRef],
    }).success).toBe(false)
    expect(kaelChatMediaUploadSchema.safeParse({
      file_name: 'voice-note.m4a',
      mime_type: 'audio/mp4',
      purpose: 'private_video_original',
      file_size_bytes: 1000,
    }).success).toBe(false)
    expect(kaelChatMediaUploadSchema.safeParse({
      file_name: 'private-evidence.mp4',
      mime_type: 'video/mp4',
      purpose: 'private_video_original',
      file_size_bytes: 1000,
    }).success).toBe(true)
    expect(kaelChatMediaUploadSchema.safeParse({
      file_name: 'private-evidence.mp4',
      mime_type: 'video/mp4',
      purpose: 'model_vision',
      file_size_bytes: 1000,
    }).success).toBe(false)
    expect(kaelChatMediaUploadSchema.safeParse({
      file_name: 'frame.jpg',
      mime_type: 'image/jpeg',
      purpose: 'private_video_original',
      file_size_bytes: 1000,
    }).success).toBe(false)
    expect(kaelChatMediaUploadSchema.safeParse({
      file_name: 'frame.jpg',
      mime_type: 'image/jpeg',
      purpose: 'model_vision',
      file_size_bytes: 1000,
    }).success).toBe(true)
    expect(kaelChatMediaUploadSchema.safeParse({
      file_name: 'unclassified.jpg',
      mime_type: 'image/jpeg',
      file_size_bytes: 1000,
    }).success).toBe(false)
    expect(kaelChatEvidenceSchema.safeParse({
      decision: 'confirmed',
      evidence_items: [{
        kind: 'video_original_private',
        ref: 'supabase://kael-chat-media/user-1/kael-chat/session/original.mp4',
        model_eligible: true,
      }],
    }).success).toBe(false)
  })
})

describe('Kael six-service intent and profile parity', () => {
  it('accepts grounded profile facts and rejects unknown safety signals', () => {
    const base = {
      confidence: 0.9,
      needs_clarification: false,
      problem_slug: 'routine_hvac_cleaning',
      profile_facts: {
        requested_work_mode: 'Vệ sinh định kỳ',
      },
      safety_signals: ['repair'],
      service_type: 'hvac',
    }
    expect(intentResultSchema.safeParse(base).success).toBe(true)
    expect(intentResultSchema.safeParse({
      ...base,
      safety_signals: ['invented_signal'],
    }).success).toBe(false)
  })

  it('validates, classifies, and falls back within the selected service profile', () => {
    for (const service of SIX_SERVICES) {
      const profile = getKaelPerformanceProfile(service)
      expect(profile?.service_type).toBe(service)
      expect(intentResultSchema.safeParse({
        service_type: service,
        problem_slug: FALLBACK_PROBLEM_SLUG_BY_SERVICE[service],
        confidence: 0.8,
        needs_clarification: false,
      }).success).toBe(true)
      expect(PROBLEM_SLUGS_BY_SERVICE[service]).toContain(FALLBACK_PROBLEM_SLUG_BY_SERVICE[service])
      expect(buildFallbackIntent(service, [], 'Mô tả hợp lệ').service_type).toBe(service)
      expect(buildFallbackIntent(service, [], 'Mô tả hợp lệ').problem_slug)
        .toBe(FALLBACK_PROBLEM_SLUG_BY_SERVICE[service])
    }
  })

  it('publishes every service and canonical performance profile to both intent prompts', () => {
    const intentPrompt = String(buildIntentMessages('hvac', [], 'Máy lạnh không mát')[0]?.content)
    const diagnosisPrompt = String(buildIntakeDiagnosisMessages('handyman', [], 'Cần lắp kệ')[0]?.content)
    for (const service of SIX_SERVICES) {
      const profile = getKaelPerformanceProfile(service)
      expect(intentPrompt).toContain(service)
      expect(diagnosisPrompt).toContain(service)
      expect(intentPrompt).toContain(profile?.id)
      expect(diagnosisPrompt).toContain(profile?.id)
    }
    expect(getPublicKaelCharter().identity_summary).toContain('HVAC')
    expect(getPublicKaelCharter().identity_summary).toContain('handyman')
  })

  it.each([
    ['Máy lạnh không mát và đang chảy nước', 'hvac'],
    ['Sofa có vết bẩn và mùi ẩm mốc', 'upholstery'],
    ['Cần khoan tường lắp kệ và thanh rèm', 'handyman'],
    ['Cần lắp đèn và thiết bị nhỏ', 'handyman'],
  ] as const)('keeps a %s request inside selected service %s', (message, service) => {
    expect(evaluateMessageBoundary(message, service)).toEqual({ ok: true })
  })

  it('detects a six-service mismatch without treating HVAC as unsupported', () => {
    const result = evaluateMessageBoundary('Máy lạnh không mát và đang chảy nước', 'electrical')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('service_mismatch')
      expect(result.suggestedService).toBe('hvac')
    }
  })
})
