import { describe, expect, it } from 'vitest'

import {
  buildProfileSafetyFlags,
  buildPriceEvidenceUnavailableArtifact,
  requiredCaseWorkEvidenceRequest,
  resolveCaseWorkEvidenceRequest,
  resolveProfileFactCoverage,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/case-work-controls'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../supabase/functions/mobile-api/_shared/kael/artifact-contract'
import { getKaelPerformanceProfile } from '../../../../../supabase/functions/mobile-api/_shared/kael/performance-profiles'
import { diagnosisScopeWithEvidenceRequest } from '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat-case-work'
import { serializeKaelEstimate } from '../../../../../supabase/functions/mobile-api/_shared/services/_shared'

describe('Kael Case Work deterministic controls', () => {
  it('requires every selected profile quote driver to have a structured fact', () => {
    const profile = getKaelPerformanceProfile('hvac')!
    const facts = Object.fromEntries(profile.quote_drivers.slice(0, -1).map((driver) => [driver, `known:${driver}`]))
    expect(resolveProfileFactCoverage(profile, facts)).toMatchObject({
      missing: [profile.quote_drivers.at(-1)],
    })
  })

  it('turns selected-profile safety signals into server-owned stop/review flags', () => {
    const profile = getKaelPerformanceProfile('hvac')!
    expect(buildProfileSafetyFlags(profile, ['burning_smell', 'repair'])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'hvac_electrical_refrigerant_or_burning_hazard', severity: 'stop' }),
      expect.objectContaining({ code: 'hvac_repair_or_refrigerant_work', severity: 'review' }),
    ]))
  })

  it('requires visual evidence for handyman quotes and does not accept voice-only evidence', () => {
    const voiceOnly = [{
      kind: 'voice_transcript' as const,
      transcript: 'Tôi muốn treo một kệ lên tường.',
      model_eligible: true,
    }]

    expect(requiredCaseWorkEvidenceRequest({
      serviceType: 'handyman',
      problemCategory: 'drill_or_mount_shelf',
      customerMessage: 'Treo một kệ lên tường bê tông.',
      evidence: voiceOnly,
    })).toMatchObject({
      blocker: 'handyman_visual_evidence',
      evidenceKind: 'photo',
      prompt: 'Gửi ảnh rõ vật cần sửa/lắp và vị trí thi công để Kael kiểm tra bề mặt, kích thước, dụng cụ cần dùng.',
    })

    expect(requiredCaseWorkEvidenceRequest({
      serviceType: 'handyman',
      problemCategory: 'drill_or_mount_shelf',
      customerMessage: 'Treo một kệ lên tường bê tông.',
      evidence: [{
        kind: 'video_frame',
        ref: 'supabase://kael-chat-media/customer/kael-chat/frame.jpg',
        model_eligible: true,
      }],
    })).toBeNull()
  })

  it('requires a visual for stain, mold, child-accident, or unknown-material upholstery cases', () => {
    for (const input of [
      { problemCategory: 'stain_treatment', customerMessage: 'Sofa có vết bẩn lâu ngày.' },
      { problemCategory: 'odor_or_mold', customerMessage: 'Nệm có mùi mốc.' },
      { problemCategory: 'sofa_cleaning', customerMessage: 'Không rõ chất liệu sofa.' },
      { problemCategory: 'mattress_cleaning', customerMessage: 'Nệm bị trẻ nhỏ làm bẩn.' },
    ]) {
      expect(requiredCaseWorkEvidenceRequest({
        serviceType: 'upholstery',
        evidence: [],
        ...input,
      })).toMatchObject({
        blocker: 'upholstery_condition_visual_evidence',
        evidenceKind: 'photo',
      })
    }

    expect(requiredCaseWorkEvidenceRequest({
      serviceType: 'upholstery',
      problemCategory: 'sofa_cleaning',
      customerMessage: 'Giặt định kỳ sofa vải, không có vết bẩn riêng.',
      evidence: [],
    })).toBeNull()
  })

  it.each([
    ['electrical', 'outlet_or_switch_broken'],
    ['plumbing', 'leaking_faucet'],
    ['cleaning', 'routine_cleaning'],
    ['hvac', 'routine_hvac_cleaning'],
    ['upholstery', 'sofa_cleaning'],
  ] as const)('offers skippable profile evidence after clarification for %s', (serviceType, problemCategory) => {
    expect(resolveCaseWorkEvidenceRequest({
      serviceType,
      problemCategory,
      customerMessage: 'Đã cung cấp đủ thông tin mô tả để Kael tiếp tục.',
      evidence: [],
      language: 'vi',
    })).toMatchObject({
      blocker: 'profile_evidence_review',
      evidenceKind: 'any',
      required: false,
    })
  })

  it('does not reopen skippable evidence after a recorded decision', () => {
    expect(resolveCaseWorkEvidenceRequest({
      serviceType: 'electrical',
      problemCategory: 'outlet_or_switch_broken',
      customerMessage: 'Ổ cắm đã hỏng hai ngày.',
      evidence: [],
      evidenceDecision: 'skipped',
    })).toBeNull()
  })

  it('keeps mandatory visual evidence mandatory even if a client claims it was skipped', () => {
    expect(resolveCaseWorkEvidenceRequest({
      serviceType: 'handyman',
      problemCategory: 'drill_or_mount_shelf',
      customerMessage: 'Treo một kệ lên tường bê tông.',
      evidence: [],
      evidenceDecision: 'skipped',
    })).toMatchObject({
      blocker: 'handyman_visual_evidence',
      evidenceKind: 'photo',
      required: true,
    })
  })

  it('persists optional evidence policy in the server-owned next action', () => {
    const initial = buildInitialDiagnosisScopeArtifact({
      serviceType: 'electrical',
      customerGoal: 'Ổ cắm không hoạt động.',
    })
    const request = resolveCaseWorkEvidenceRequest({
      serviceType: 'electrical',
      problemCategory: 'outlet_or_switch_broken',
      customerMessage: 'Ổ cắm không hoạt động trong hai ngày.',
      evidence: [],
    })!

    expect(diagnosisScopeWithEvidenceRequest(initial, request, {
      customerDetail: 'Ổ cắm không hoạt động trong hai ngày.',
      problemSummary: 'Kiểm tra ổ cắm không hoạt động.',
      complexity: 'small',
      problemChips: ['outlet_or_switch_broken'],
      workerRequirements: ['electrical_fault_isolation'],
      confidence: 0.8,
    }).next_action).toMatchObject({
      kind: 'request_evidence',
      evidence_kind: 'any',
      required: false,
    })
  })

  it('turns a missing validated price source into a terminal review artifact, not another generic question', () => {
    const initial = buildInitialDiagnosisScopeArtifact({
      serviceType: 'hvac',
      customerGoal: 'Máy lạnh không mát.',
    })

    const artifact = buildPriceEvidenceUnavailableArtifact(initial, {
      customerDetail: 'Máy lạnh không mát dù đã vệ sinh lưới lọc.',
      scopeSummary: 'Kiểm tra nguyên nhân máy lạnh không mát.',
    })

    expect(artifact).toMatchObject({
      case_phase: 'analysis',
      missing_facts: [],
      quote_ready: false,
      quote_blockers: ['validated_price_evidence'],
      next_action: {
        kind: 'escalate',
        reason: 'validated_price_evidence_unavailable',
      },
    })
    expect(artifact.scope_summary).toBe('Kiểm tra nguyên nhân máy lạnh không mát.')
  })

  it('unwraps estimate_card.v3 honesty fields for the mobile contract', () => {
    expect(serializeKaelEstimate({
      service_type: 'hvac',
      problem_category: 'routine_hvac_cleaning',
      problem_summary: 'Vệ sinh một máy lạnh treo tường.',
      complexity: 'small',
      price_min: 160_000,
      price_max: 220_000,
      confidence: 0.44,
      disclaimer: 'Ước tính theo dữ liệu hiện có.',
    }, {
      schema_version: 'estimate_card.v3',
      card: {
        needs_inspection: true,
        price_source: 'inspection_required',
        kael_reasoning: {
          complexity_reasoning: 'Phạm vi hiện tại được xếp mức vừa.',
          market_signals: 'Tổng hợp 3 nguồn đã kiểm chứng.',
          needs_inspection_reason: 'Cần kiểm tra vị trí dàn nóng.',
        },
        analysis_receipt: {
          schema_version: 'analysis_receipt.v1',
          evidence: {
            photo_count: 1,
            video_frame_count: 2,
            voice_transcript_count: 0,
            skipped: false,
          },
          market: {
            accepted_source_count: 3,
            high_trust_source_count: 2,
            quorum_met: true,
          },
        },
      },
    })).toMatchObject({
      analysis_receipt: {
        schema_version: 'analysis_receipt.v1',
        evidence: {
          photo_count: 1,
          video_frame_count: 2,
          voice_transcript_count: 0,
          skipped: false,
        },
        market: {
          accepted_source_count: 3,
          high_trust_source_count: 2,
          quorum_met: true,
        },
      },
      complexity_reasoning: 'Phạm vi hiện tại được xếp mức vừa.',
      market_signals: 'Tổng hợp 3 nguồn đã kiểm chứng.',
      needs_inspection: true,
      price_source: 'inspection_required',
      needs_inspection_reason: 'Cần kiểm tra vị trí dàn nóng.',
    })
  })

  it('fails closed when a stored analysis receipt contains impossible evidence counts', () => {
    expect(() => serializeKaelEstimate({
      service_type: 'plumbing',
      problem_category: 'pipe_leak',
      problem_summary: 'Rò nước dưới bồn rửa.',
      complexity: 'medium',
      price_min: 250_000,
      price_max: 450_000,
      confidence: 0.72,
      disclaimer: 'Ước tính theo dữ liệu hiện có.',
    }, {
      card: {
        analysis_receipt: {
          schema_version: 'analysis_receipt.v1',
          evidence: {
            photo_count: -1,
            video_frame_count: 0,
            voice_transcript_count: 0,
            skipped: false,
          },
          market: {
            accepted_source_count: null,
            high_trust_source_count: null,
            quorum_met: null,
          },
        },
      },
    })).toThrow()
  })
})
