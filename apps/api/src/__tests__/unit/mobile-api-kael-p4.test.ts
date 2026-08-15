import { describe, expect, it } from 'vitest'

import {
  buildEstimateCardOutput,
  buildScopeChangeOutputs,
  buildWorkerBriefOutput,
  runKaelOutputPipeline,
  sanitizeKaelText,
  scrubKaelPiiText,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/output-pipeline'
import {
  KAEL_PRICE_DISCLAIMER_V3,
  calculateScopeChangeAnomaly,
  calculateScopeChangeMargin,
  matchSuspiciousScopeKeywords,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/scope-change'
import { kaelArtifactProposalSchema } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/artifact-contract'
import type { KaelDiagnosisScopeArtifact } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/artifact-contract'
import { buildKaelEstimateAnalysisEvidence } from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support'
import { mergeKaelCustomerDetailForReanalysis } from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-context'
import { buildVisionMessages } from '../../../../../supabase/functions/mobile-api/_shared/kael/prompts/prompts'
import { buildFallbackVision } from '../../../../../supabase/functions/mobile-api/_shared/kael/tools/vision'

describe('mobile-api Kael P4 output pipeline', () => {
  it('requires a grounded analysis result for every supplied image', () => {
    const messages = buildVisionMessages(
      'Khớp ren dưới bồn rửa rò khi xả.',
      'plumbing: pipe_leak',
      [
        { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: 'one' } },
        { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: 'two' } },
        { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: 'three' } },
      ],
      'vi',
    )
    const systemPrompt = String(messages[0]?.content ?? '')

    expect(systemPrompt).toContain('exactly one evidence_findings entry for every supplied image')
    expect(systemPrompt).toContain('unclear or does not contain relevant service evidence')
    expect(systemPrompt).toContain('evidence_findings must never be empty when images are supplied')
    expect(systemPrompt).toContain('Do not merge separate images')
    expect(systemPrompt).not.toContain('no supported indicator or finding exists')
    expect(Array.isArray(messages[1]?.content) ? messages[1].content : []).toHaveLength(4)
  })

  it('renders a sanitized Estimate Card v3 from a pipeline estimate', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        service_type: 'plumbing',
        problem_category: 'pipe_leak',
        problem_summary: 'Ống nước dưới lavabo rò, SĐT 0901234567, giá 450.000 VND',
        complexity: 'medium',
        price_min: 250000,
        price_max: 450000,
        confidence: 0.62,
        advisory: 'Khóa van nếu nước rò liên tục.',
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      priceSource: 'baseline_with_market',
      baselineUsed: 'plumbing:pipe_leak:medium',
    })

    expect(output.schema_version).toBe('estimate_card.v3')
    expect(output.card.disclaimer).toBe(KAEL_PRICE_DISCLAIMER_V3)
    expect(output.card.problem_summary).not.toContain('0901234567')
    expect(output.card.problem_summary.toLowerCase()).not.toContain('vnd')
    expect(kaelArtifactProposalSchema.parse(output.artifact_proposal)).toMatchObject({
      artifact_type: 'estimate',
      visibility: 'customer_review',
      may_transition: false,
    })
  })

  it('uses cleaning-specific scope, uncertainty, and cost components in the receipt', () => {
    const fallback = buildFallbackVision(
      'cleaning: standard_home_cleaning',
      'vi',
      false,
      'Căn hộ 65m² cần hút bụi, lau sàn và vệ sinh hai phòng tắm.',
    )
    const output = buildEstimateCardOutput({
      analysisEvidence: {
        photoCount: 0,
        skipped: true,
        videoFrameCount: 0,
        voiceTranscriptCount: 0,
      },
      estimate: {
        service_type: 'cleaning',
        problem_category: 'standard_home_cleaning',
        problem_summary: 'Vệ sinh nhà tiêu chuẩn cho căn hộ 65m².',
        complexity: 'small',
        price_min: 253_000,
        price_max: 315_000,
        confidence: 0.58,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      baselineUsed: 'cleaning:standard_home_cleaning:small',
      customerScopeContext: 'Căn hộ 65m² cần hút bụi, lau sàn và vệ sinh hai phòng tắm.',
      visionAnalysis: {
        analysisStatus: 'not_provided',
        evidenceFindings: [],
        problemSummary: fallback.problem_identified,
        recommendedScope: fallback.recommended_scope,
        remainingUncertainty: fallback.remaining_uncertainty,
        severityIndicators: [],
      },
    })

    const receipt = output.card.price_reasoning_receipt
    const serialized = JSON.stringify(receipt)
    expect(receipt.problem.possible_causes[0]?.statement).toContain('Mức công và phương pháp vệ sinh')
    expect(receipt.problem.unknowns).toEqual(expect.arrayContaining([
      expect.stringContaining('mức bẩn'),
    ]))
    expect(receipt.scope.included).toEqual(expect.arrayContaining([
      expect.stringContaining('mức bẩn, bề mặt và lối tiếp cận'),
      expect.stringContaining('Gói vệ sinh nhà'),
    ]))
    expect(receipt.costs.components.map((component) => component.kind)).toContain('equipment')
    expect(receipt.costs.components.map((component) => component.kind)).not.toContain('replacement_parts')
    expect(serialized).not.toContain('hạng mục sửa chữa')
    expect(serialized).not.toContain('Linh kiện thay thế')
    expect(serialized).not.toContain('Nguyên nhân cụ thể')
  })

  it('keeps booking metadata and redacted address tokens out of upholstery facts', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        service_type: 'upholstery',
        problem_category: 'sofa_cleaning',
        problem_summary: 'Vệ sinh một sofa vải polyester hai chỗ.',
        complexity: 'small',
        price_min: 250_000,
        price_max: 300_000,
        confidence: 0.62,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      customerScopeContext: [
        'Dịch vụ: Sofa, nệm, rèm, thảm Vấn đề: Vệ sinh sofa Khu vực: [unit] E2E, Quận Bình Thạnh Thời gian: 14:00 Mô tả: Sofa hơi bẩn.',
        'Chỉ có 1 sofa vải dệt polyester dài khoảng 1,8m, loại 2 chỗ ngồi.',
        'Hiện trạng là bụi nhẹ và một vết nước ngọt gốc nước nhỏ.',
      ].join('\n\n'),
      language: 'vi',
      priceSource: 'baseline_with_market',
      baselineUsed: 'upholstery_care:sofa_cleaning:small',
    })
    const facts = output.card.price_reasoning_receipt.problem.confirmed_facts.join(' ')

    expect(facts).toContain('polyester')
    expect(facts).not.toContain('Dịch vụ:')
    expect(facts).not.toContain('Khu vực:')
    expect(facts).not.toContain('[unit]')
  })

  it('does not invent an inspection blocker from low price confidence alone', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        service_type: 'electrical',
        problem_category: 'outlet_or_switch_broken',
        problem_summary: 'Một ổ cắm âm tường bị xém, cầu dao nhánh đã ngắt.',
        complexity: 'medium',
        price_min: 300000,
        price_max: 700000,
        confidence: 0.4,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
        needs_inspection: false,
      },
      priceSource: 'baseline_only',
      baselineUsed: 'electrical:outlet_or_switch_broken:medium',
    })

    expect(output.card.confidence).toBe('low')
    expect(output.card.needs_inspection).toBe(false)
    expect(output.card.price_source).toBe('baseline_only')
    expect(output.artifact_proposal.missing_fields).toEqual([])
  })

  it('keeps a structured receipt of the evidence and market checks behind the estimate', () => {
    const output = buildEstimateCardOutput({
      analysisEvidence: {
        photoCount: 2,
        skipped: false,
        videoFrameCount: 3,
        voiceTranscriptCount: 1,
      },
      estimate: {
        service_type: 'plumbing',
        problem_category: 'pipe_leak',
        problem_summary: 'Rò nước dưới bồn rửa bếp.',
        complexity: 'medium',
        price_min: 350_000,
        price_max: 650_000,
        confidence: 0.74,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      marketEvidence: {
        acceptedSourceCount: 4,
        highTrustSourceCount: 3,
        quorumMet: true,
      },
      marketSignals: 'Tổng hợp 4 nguồn đã kiểm chứng.',
      priceSource: 'baseline_with_market',
      baselineUsed: 'plumbing:pipe_leak:medium',
    })

    expect(output.card.analysis_receipt).toEqual({
      schema_version: 'analysis_receipt.v1',
      evidence: {
        photo_count: 2,
        video_frame_count: 3,
        voice_transcript_count: 1,
        skipped: false,
      },
      market: {
        accepted_source_count: 4,
        high_trust_source_count: 3,
        quorum_met: true,
      },
    })
  })

  it('maps validated vision findings to the correct customer evidence without leaking private text', () => {
    const output = buildEstimateCardOutput({
      analysisEvidence: {
        photoCount: 2,
        skipped: false,
        videoFrameCount: 1,
        voiceTranscriptCount: 0,
        visualEvidenceRefs: [
          { evidenceIndex: 2, evidenceKind: 'photo' },
          { evidenceIndex: 1, evidenceKind: 'video_frame' },
        ],
      },
      estimate: {
        service_type: 'electrical',
        problem_category: 'outlet_or_switch_broken',
        problem_summary: 'Ổ cắm chập chờn và nóng lên khi sử dụng.',
        complexity: 'medium',
        price_min: 300_000,
        price_max: 650_000,
        confidence: 0.74,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      marketEvidence: {
        acceptedSourceCount: 4,
        highTrustSourceCount: 3,
        quorumMet: true,
      },
      priceSource: 'baseline_with_market',
      baselineUsed: 'electrical:outlet_or_switch_broken:medium',
      visionAnalysis: {
        evidenceFindings: [
          {
            confidence: 'high',
            evidenceIndex: 1,
            observation: 'Mặt ổ cắm có vùng sẫm màu; SĐT 0901234567 xuất hiện trên nhãn gần đó.',
            possibleMeaning: 'Có thể đã phát nhiệt tại điểm tiếp xúc.',
          },
          {
            confidence: 'medium',
            evidenceIndex: 2,
            observation: 'Khung hình cho thấy đèn báo chập chờn khi phích cắm được giữ yên.',
            possibleMeaning: 'Có thể liên quan tới tiếp xúc lỏng hoặc dây phía sau.',
          },
        ],
        problemSummary: 'Ổ cắm có dấu hiệu tiếp xúc điện không ổn định và phát nhiệt cục bộ.',
        recommendedScope: 'Thợ kiểm tra điểm tiếp xúc, dây dẫn phía sau và thay phần hỏng sau khi xác nhận hiện trạng.',
        remainingUncertainty: 'Ảnh và khung hình chưa cho thấy phần dây phía sau mặt ổ cắm.',
        severityIndicators: ['Có dấu hiệu phát nhiệt gần khe cắm.'],
      },
    })

    expect(output.card.analysis_receipt).toMatchObject({
      evidence: {
        findings: [
          {
            confidence: 'high',
            evidence_index: 2,
            evidence_kind: 'photo',
            observation: expect.stringContaining('[phone]'),
            possible_meaning: 'Có thể đã phát nhiệt tại điểm tiếp xúc.',
          },
          {
            confidence: 'medium',
            evidence_index: 1,
            evidence_kind: 'video_frame',
          },
        ],
      },
      problem: {
        recommended_scope: expect.stringContaining('kiểm tra điểm tiếp xúc'),
        remaining_uncertainty: expect.stringContaining('chưa cho thấy phần dây'),
        severity_indicators: ['Có dấu hiệu phát nhiệt gần khe cắm.'],
        summary: expect.stringContaining('tiếp xúc điện không ổn định'),
      },
    })
    expect(JSON.stringify(output.card.analysis_receipt)).not.toContain('0901234567')
  })

  it('preserves the global evidence index when Vision analyzes only the newest media', () => {
    const priorPhoto = {
      kind: 'photo' as const,
      model_eligible: true,
      ref: 'supabase://kael-chat-media/customer-1/kael-chat/model_vision/prior.jpg',
    }
    const currentPhoto = {
      kind: 'photo' as const,
      model_eligible: true,
      ref: 'supabase://kael-chat-media/customer-1/kael-chat/model_vision/current.jpg',
    }
    const currentFrame = {
      kind: 'video_frame' as const,
      model_eligible: true,
      ref: 'supabase://kael-chat-media/customer-1/kael-chat/model_vision/frame.jpg',
    }
    const artifact = {
      evidence: [priorPhoto, currentPhoto, currentFrame],
      facts: { evidence_gate_decision: 'provided' },
    } as unknown as KaelDiagnosisScopeArtifact

    expect(buildKaelEstimateAnalysisEvidence(artifact, [currentPhoto, currentFrame])).toMatchObject({
      photoCount: 2,
      videoFrameCount: 1,
      visualEvidenceRefs: [
        { evidenceIndex: 2, evidenceKind: 'photo' },
        { evidenceIndex: 1, evidenceKind: 'video_frame' },
      ],
    })
  })

  it('keeps the original case scope while adding successive customer adjustments', () => {
    const artifact = {
      facts: {
        customer_goal: 'The sink drain joint leaks and the cabinet base is damp.',
        latest_customer_detail: [
          'The sink drain joint leaks and the cabinet base is damp.',
          'The customer already shut the valve.',
        ].join('\n\n'),
      },
    } as unknown as KaelDiagnosisScopeArtifact

    const detail = mergeKaelCustomerDetailForReanalysis(
      artifact,
      'The leak appears only while the sink is draining.',
    )

    expect(detail).toContain('The sink drain joint leaks')
    expect(detail).toContain('already shut the valve')
    expect(detail).toContain('only while the sink is draining')
    expect(detail.match(/The sink drain joint leaks/g)).toHaveLength(1)
  })

  it('prioritizes the latest customer correction in a reanalyzed price receipt', () => {
    const artifact = {
      facts: {
        customer_goal: 'Một máy lạnh treo tường [house-no] HP cần vệ sinh định kỳ.',
        latest_customer_detail: [
          'Một máy lạnh treo tường [house-no] HP cần vệ sinh định kỳ.',
          'Luồng gió yếu nhưng ổn định, không có dấu hiệu nguy hiểm.',
          'Dàn lạnh và dàn nóng đều tiếp cận an toàn.',
          'Không gồm nạp gas, thay bo mạch hoặc thay linh kiện.',
          'Chỉ vệ sinh và kiểm tra cơ bản.',
        ].join('\n\n'),
      },
    } as unknown as KaelDiagnosisScopeArtifact
    const detail = mergeKaelCustomerDetailForReanalysis(
      artifact,
      'Công suất của máy lạnh là 1 HP; đây là thông số thiết bị, không phải số nhà.',
    )
    const receipt = buildEstimateCardOutput({
      estimate: {
        service_type: 'hvac',
        problem_category: 'ac_cleaning',
        problem_summary: 'Vệ sinh định kỳ một máy lạnh treo tường.',
        complexity: 'small',
        price_min: 200_000,
        price_max: 200_000,
        confidence: 0.62,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      customerScopeContext: detail,
      language: 'vi',
      priceSource: 'baseline_with_market',
      baselineUsed: 'hvac:ac_cleaning:small',
    }).card.price_reasoning_receipt

    expect(detail).toMatch(/^Công suất của máy lạnh là 1 HP/)
    expect(detail).not.toContain('[house-no] HP')
    expect(receipt.problem.confirmed_facts.join(' ')).toContain('1 HP')
    expect(receipt.problem.confirmed_facts.join(' ')).not.toContain('[house-no] HP')
  })

  it('retains a verified prior image receipt during a text-only adjustment', () => {
    const output = buildEstimateCardOutput({
      analysisEvidence: {
        photoCount: 1,
        skipped: false,
        videoFrameCount: 0,
        voiceTranscriptCount: 0,
      },
      estimate: {
        service_type: 'plumbing',
        problem_category: 'pipe_leak',
        problem_summary: 'The drain joint leaks only while water is flowing.',
        complexity: 'small',
        price_min: 150_000,
        price_max: 350_000,
        confidence: 0.72,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      language: 'en',
      baselineUsed: 'plumbing:pipe_leak:small',
      previousAnalysisReceipt: {
        schema_version: 'analysis_receipt.v1',
        evidence: {
          analysis_status: 'analyzed',
          findings: [{
            confidence: 'medium',
            evidence_index: 1,
            evidence_kind: 'photo',
            observation: 'A water droplet is visible at the threaded drain joint.',
            possible_meaning: 'The seal or thread may be loose or worn.',
          }],
          photo_count: 1,
          skipped: false,
          video_frame_count: 0,
          voice_transcript_count: 0,
        },
        market: {
          accepted_source_count: 2,
          high_trust_source_count: 1,
          quorum_met: false,
        },
        problem: {
          remaining_uncertainty: 'The inner seal is not visible.',
          recommended_scope: 'Inspect and reseal the threaded joint.',
          severity_indicators: ['Localized moisture below the joint.'],
          summary: 'A localized leak is visible at the threaded drain joint.',
        },
      },
      visionAnalysis: {
        analysisStatus: 'not_provided',
        evidenceFindings: [],
        problemSummary: 'Text-only adjustment received.',
        recommendedScope: 'Inspect the described location.',
        remainingUncertainty: 'No new image was submitted.',
        severityIndicators: [],
      },
    })

    expect(output.card.analysis_receipt).toMatchObject({
      evidence: {
        analysis_status: 'analyzed',
        findings: [{
          evidence_index: 1,
          evidence_kind: 'photo',
          observation: 'A water droplet is visible at the threaded drain joint.',
        }],
      },
      problem: {
        recommended_scope: 'Inspect and reseal the threaded joint.',
        summary: 'A localized leak is visible at the threaded drain joint.',
      },
    })
  })

  it('never exposes taxonomy keys and records unavailable visual analysis honestly', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        service_type: 'plumbing',
        problem_category: 'pipe_leak',
        problem_summary: 'plumbing: pipe_leak',
        complexity: 'medium',
        price_min: 350_000,
        price_max: 800_000,
        confidence: 0.42,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      language: 'vi',
      baselineUsed: 'plumbing:pipe_leak:medium',
      analysisEvidence: {
        photoCount: 1,
        videoFrameCount: 0,
        voiceTranscriptCount: 0,
        skipped: false,
      },
      marketEvidence: {
        acceptedSourceCount: 2,
        highTrustSourceCount: 1,
        quorumMet: false,
      },
      visionAnalysis: {
        analysisStatus: 'unavailable',
        evidenceFindings: [],
        problemSummary: 'plumbing: pipe_leak',
        recommendedScope: 'Thợ cần kiểm tra trực tiếp vị trí được mô tả.',
        remainingUncertainty: 'Kael đã nhận ảnh nhưng chưa thể xác nhận chi tiết trong ảnh.',
        severityIndicators: [],
      },
    })

    expect(output.card.problem_summary).toBe('Ống rò rỉ')
    expect(output.card.analysis_receipt).toMatchObject({
      evidence: {
        analysis_status: 'unavailable',
        photo_count: 1,
      },
      problem: {
        summary: 'Ống rò rỉ',
      },
    })
    expect(output.card.analysis_receipt?.evidence.findings).toBeUndefined()
    expect(JSON.stringify(output.card)).not.toContain('plumbing: pipe_leak')
  })

  it('marks missing inspection information without allowing AI to transition workflow', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        service_type: 'electrical',
        problem_category: 'unknown',
        problem_summary: 'Ổ cắm nóng bất thường nhưng chưa có ảnh hiện trạng.',
        complexity: 'medium',
        price_min: 200000,
        price_max: 350000,
        confidence: 0.28,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      priceSource: 'inspection_required',
      baselineUsed: null,
      needsInspectionReason: 'Thiếu ảnh và vị trí ổ cắm.',
    })

    const artifact = kaelArtifactProposalSchema.parse(output.artifact_proposal)
    expect(artifact.missing_fields).toContain('inspection')
    expect(artifact.recommended_next_question).toBeDefined()
    expect(artifact.may_transition).toBe(false)
  })

  it('uses the generic Schema + Sanitizer + Fallback + Renderer pipeline', () => {
    const fallback: { value: string; disclaimer: string } = {
      value: 'safe fallback',
      disclaimer: KAEL_PRICE_DISCLAIMER_V3,
    }

    const result = runKaelOutputPipeline<
      typeof fallback,
      typeof fallback,
      typeof fallback
    >({
      raw: {
        value: 'Có số 0901234567 và giá 300000đ',
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      fallback,
      schema: {
        safeParse(value: unknown) {
          return typeof value === 'object' && value !== null && 'value' in value
            ? { success: true as const, data: value as typeof fallback }
            : { success: false as const }
        },
      },
      sanitize(value) {
        return {
          ...value,
          value: value.value.replace(/\d/g, ''),
        }
      },
      render(value) {
        return value
      },
    })

    expect(result.fallback_used).toBe(false)
    expect(result.output.value).not.toMatch(/\d/)
  })

  it('removes hidden controls before PII matching and truncates Unicode safely', () => {
    expect(sanitizeKaelText('SĐT 0901\u200B234567')).toBe('SĐT [phone]')
    expect(sanitizeKaelText('safe\u0085\u00AD\u202E\u2066text')).toBe('safetext')
    expect(scrubKaelPiiText('STK 1234567890123456')).not.toContain('1234567890123456')
    expect(sanitizeKaelText('A😀', 2)).toBe('A')
    expect(sanitizeKaelText('abcdef', -1)).toBe('')
    expect(sanitizeKaelText('a'.repeat(600), Number.POSITIVE_INFINITY)).toHaveLength(500)
  })

  it('builds Worker Brief core without address and guidance with address after accept', () => {
    const core = buildWorkerBriefOutput({
      stage: 'core',
      serviceType: 'electrical',
      problemSummary: 'Cầu dao thường xuyên bị trip.',
      district: 'Quận 7',
      fullAddress: {
        building: 'Sunrise City',
        floor: '18',
        unit: '18.02',
        district: 'Quận 7',
      },
      estimatedEarningMin: 180000,
      estimatedEarningMax: 300000,
      knowledgeSafetyGuidance: ['Safety warning: Khoa nuoc khu vuc lien quan truoc khi thao tac.'],
    })
    const guidance = buildWorkerBriefOutput({
      stage: 'guidance',
      serviceType: 'electrical',
      problemSummary: 'Cầu dao thường xuyên bị trip.',
      district: 'Quận 7',
      fullAddress: {
        building: 'Sunrise City',
        floor: '18',
        unit: '18.02',
        district: 'Quận 7',
      },
      estimatedEarningMin: 180000,
      estimatedEarningMax: 300000,
    })

    expect(JSON.stringify(core.brief)).not.toContain('Sunrise City')
    expect(JSON.stringify(core.brief)).not.toContain('18.02')
    expect(core.brief.sections.safety[0]).toContain('Khoa nuoc')
    expect(JSON.stringify(guidance.brief)).toContain('Sunrise City')
    expect(JSON.stringify(guidance.brief)).toContain('18.02')
    expect(guidance.brief.sections.safety).toContain('Không bắt đầu phần phát sinh khi khách chưa xác nhận đề xuất đổi phạm vi trong ứng dụng.')
    expect(guidance.brief.sections.guidance).toContain(
      'Nếu phát sinh thêm, gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Chỉ làm khi khách xác nhận trong ứng dụng.',
    )
  })

  it('normalizes legacy knowledge guidance so Kael never owns a customer scope decision', () => {
    const output = buildWorkerBriefOutput({
      stage: 'guidance',
      serviceType: 'plumbing',
      problemSummary: 'Cần kiểm tra đường ống sau tường.',
      district: 'Quận 1',
      knowledgeSafetyGuidance: [
        'Nếu cần đục tường, tháo gạch hoặc mở trần, dừng để gửi scope-change kèm lý do và ảnh; không làm trước khi Kael quyết định.',
      ],
    })

    expect(output.brief.sections.safety).toContain(
      'Nếu cần đục tường, tháo gạch hoặc mở trần, dừng để gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Không làm trước khi khách xác nhận đề xuất trong ứng dụng.',
    )
    expect(JSON.stringify(output.brief)).not.toContain('Kael quyết định')
  })

  it('builds scope-change worker challenge and customer card together', () => {
    const outputs = buildScopeChangeOutputs({
      serviceType: 'plumbing',
      originalPriceMax: 200000,
      newPriceMin: 500000,
      newPriceMax: 750000,
      newComplexity: 'large',
      hasPhotos: false,
      workerDescription: 'Phải đào tường vì đường ống chính hỏng.',
      workerReason: 'Vấn đề lớn hơn dự kiến.',
      workerScopeChangeRate: 0.4,
      riskConfig: {
        complexityHours: { small: 1, medium: 3, large: 6 },
        hcmcHourlyRateVnd: 100000,
        baseMultiplier: 1.5,
      },
    })

    expect(outputs.worker_challenge.challenge_required).toBe(true)
    expect(outputs.customer_card.price_change.new_price_max).toBe(750000)
    expect(outputs.customer_card.disclaimer).toBe(KAEL_PRICE_DISCLAIMER_V3)
    expect(outputs.anti_fraud.admin_flag_required).toBe(true)
  })
})

describe('mobile-api Kael P4 anti-fraud helpers', () => {
  it('keeps anomaly and margin calculations available from Edge scope-change module', () => {
    expect(calculateScopeChangeAnomaly({
      originalPriceMax: 100000,
      newPriceMax: 220000,
      hasPhotos: false,
      workerScopeChangeRate: 0.1,
      description: 'Cần thay đoạn nhỏ',
      reason: 'Có ảnh hiện trường',
    }).score).toBeCloseTo(0.5)

    expect(calculateScopeChangeMargin({
      newComplexity: 'small',
      newPriceMax: 400000,
      config: {
        complexityHours: { small: 1, medium: 3, large: 6 },
        hcmcHourlyRateVnd: 100000,
        baseMultiplier: 1.5,
      },
    }).assessment).toBe('requires_attention')
  })

  it('fails closed with finite output for malformed scope-risk numbers', () => {
    const anomaly = calculateScopeChangeAnomaly({
      originalPriceMax: Number.POSITIVE_INFINITY,
      newPriceMax: Number.NaN,
      hasPhotos: true,
      workerScopeChangeRate: Number.NaN,
      description: 'Scope changed.',
      reason: 'Needs review.',
    })

    expect(Number.isFinite(anomaly.driftRatio)).toBe(true)
    expect(anomaly).toMatchObject({
      score: 1,
      challengeRequired: true,
      adminFlagRequired: true,
      reasons: ['invalid_scope_change_risk_input'],
    })

    const margin = calculateScopeChangeMargin({
      newComplexity: 'medium',
      newPriceMax: Number.POSITIVE_INFINITY,
      config: {
        complexityHours: { small: 1, medium: Number.NaN, large: 6 },
        hcmcHourlyRateVnd: 100000,
        baseMultiplier: 1.5,
      },
    })
    expect(Number.isFinite(margin.fairPriceMax)).toBe(true)
    expect(margin).toEqual({
      fairPriceMax: 0,
      assessment: 'requires_attention',
      adminAlert: true,
    })
  })

  it('ignores blank and duplicate suspicious keyword configuration', () => {
    expect(matchSuspiciousScopeKeywords(
      'A normal scope update.',
      [' ', 'scope', ' scope '],
    )).toEqual(['scope'])
  })

  it('matches Vietnamese suspicious scope phrases with or without diacritics', () => {
    expect(matchSuspiciousScopeKeywords('phai thay het duong ong nay')).toContain('phải thay hết')
    expect(matchSuspiciousScopeKeywords('Phải thay hết đường ống này')).toContain('phải thay hết')
  })
})
