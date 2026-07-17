import { describe, expect, it } from 'vitest'

import {
  buildProfileSafetyFlags,
  buildPriceEvidenceUnavailableArtifact,
  requiredCaseWorkEvidenceRequest,
  resolveProfileFactCoverage,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/case-work/case-work-controls'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../supabase/functions/mobile-api/_shared/kael/case-work/artifact-contract'
import { getKaelPerformanceProfile } from '../../../../../supabase/functions/mobile-api/_shared/kael/case-work/performance-profiles'
import { serializeKaelEstimate } from '../../../../../supabase/functions/mobile-api/_shared/services/_runtime/shared'

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
          needs_inspection_reason: 'Cần kiểm tra vị trí dàn nóng.',
        },
      },
    })).toMatchObject({
      needs_inspection: true,
      price_source: 'inspection_required',
      needs_inspection_reason: 'Cần kiểm tra vị trí dàn nóng.',
    })
  })
})
