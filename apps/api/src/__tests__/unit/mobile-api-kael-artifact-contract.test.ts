import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildKaelAutonomyDecision,
  buildInitialDiagnosisScopeArtifact,
  buildKaelMissingInfoArtifactProposal,
  kaelAutonomyDecisionSchema,
  kaelArtifactProposalSchema,
  kaelDiagnosisScopeArtifactSchema,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/artifact-contract'
import {
  diagnosisScopeForIncomingTurn,
  diagnosisScopeWithUncertainAnswer,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-artifact'

describe('Kael artifact proposal contract', () => {
  it('preserves the pending question until the core classifies a text reply', () => {
    const initial = buildInitialDiagnosisScopeArtifact({
      serviceType: 'handyman',
      customerGoal: 'Khoan một vị trí để treo giá máy tập.',
    })
    const pending = kaelDiagnosisScopeArtifactSchema.parse({
      ...initial,
      missing_facts: ['task_types_and_total_count'],
      quote_blockers: ['task_types_and_total_count'],
      next_action: {
        kind: 'ask_question',
        question: 'Có bao nhiêu hạng mục cần được xử lý?',
      },
    })

    const textTurn = diagnosisScopeForIncomingTurn(pending, {
      evidence: pending.evidence,
      voiceTranscript: null,
    })

    expect(textTurn.next_action).toEqual(pending.next_action)
    expect(textTurn.quote_blockers).toEqual(['task_types_and_total_count'])
  })

  it('stops an unknown-answer loop without inventing the missing fact', () => {
    const initial = buildInitialDiagnosisScopeArtifact({
      serviceType: 'electrical',
      customerGoal: 'Một phòng đang mất điện.',
    })
    const pending = kaelDiagnosisScopeArtifactSchema.parse({
      ...initial,
      missing_facts: ['affected_area_and_power_state'],
      quote_blockers: ['missing_profile_fact:affected_area_and_power_state'],
      next_action: {
        kind: 'ask_question',
        question: 'Tình trạng cấp điện hiện tại tại khu vực bị ảnh hưởng là gì?',
      },
    })

    const resolved = diagnosisScopeWithUncertainAnswer(
      pending,
      'affected_area_and_power_state',
      'Cần xác minh tình trạng cấp điện tại chỗ.',
    )

    expect(resolved.facts).not.toHaveProperty('affected_area_and_power_state')
    expect(resolved.facts).toMatchObject({
      latest_unavailable_fact: 'affected_area_and_power_state',
    })
    expect(resolved.missing_facts).toContain('affected_area_and_power_state')
    expect(resolved.quote_blockers).toContain('onsite_inspection_required')
    expect(resolved.next_action).toEqual({
      kind: 'escalate',
      reason: 'Cần xác minh tình trạng cấp điện tại chỗ.',
    })
  })

  it('builds a durable six-profile diagnosis/scope artifact without workflow authority', () => {
    const artifact = buildInitialDiagnosisScopeArtifact({
      serviceType: 'hvac',
      customerGoal: 'Máy lạnh yếu và chảy nước.',
      workerRequirements: ['hvac_diagnosis'],
    })

    expect(kaelDiagnosisScopeArtifactSchema.parse(artifact)).toMatchObject({
      version: 1,
      service_type: 'hvac',
      profile_id: 'air_scope',
      quote_ready: false,
      next_action: { kind: 'ask_question' },
    })
  })

  it('rejects quote-ready artifacts while facts or quote blockers remain', () => {
    const artifact = buildInitialDiagnosisScopeArtifact({
      serviceType: 'plumbing',
      customerGoal: 'Ống nước đang rò.',
      workerRequirements: ['water_leak_diagnosis'],
    })

    expect(kaelDiagnosisScopeArtifactSchema.safeParse({
      ...artifact,
      case_phase: 'offer_review',
      quote_ready: true,
      next_action: { kind: 'prepare_offer' },
    }).success).toBe(false)
  })

  it('keeps raw audio and original video outside model-eligible evidence', () => {
    const artifact = buildInitialDiagnosisScopeArtifact({
      serviceType: 'electrical',
      customerGoal: 'Ổ cắm phát tia lửa.',
      workerRequirements: ['electrical_fault_isolation'],
    })

    expect(kaelDiagnosisScopeArtifactSchema.safeParse({
      ...artifact,
      evidence: [{ kind: 'raw_audio', model_eligible: true }],
    }).success).toBe(false)
    expect(kaelDiagnosisScopeArtifactSchema.safeParse({
      ...artifact,
      evidence: [{
        kind: 'video_original_private',
        ref: 'supabase://kael-chat-media/customer/kael-chat/session/video.mp4',
        model_eligible: true,
      }],
    }).success).toBe(false)
  })

  it('rejects owner traversal and blank facts in durable diagnosis artifacts', () => {
    const artifact = buildInitialDiagnosisScopeArtifact({
      serviceType: 'hvac',
      customerGoal: 'Máy lạnh chảy nước.',
    })

    expect(kaelDiagnosisScopeArtifactSchema.safeParse({
      ...artifact,
      evidence: [{
        kind: 'video_frame',
        ref: 'supabase://kael-chat-media/../kael-chat/model_vision/frame-1.jpg',
        model_eligible: true,
      }],
    }).success).toBe(false)
    expect(kaelDiagnosisScopeArtifactSchema.safeParse({
      ...artifact,
      facts: { customer_goal: '   ' },
    }).success).toBe(false)
  })

  it('keeps offer preparation and stop-level safety consistent with quote readiness', () => {
    const artifact = buildInitialDiagnosisScopeArtifact({
      serviceType: 'electrical',
      customerGoal: 'Ổ cắm phát tia lửa.',
    })

    expect(kaelDiagnosisScopeArtifactSchema.safeParse({
      ...artifact,
      next_action: { kind: 'prepare_offer' },
    }).success).toBe(false)
    expect(kaelDiagnosisScopeArtifactSchema.safeParse({
      ...artifact,
      case_phase: 'offer_review',
      missing_facts: [],
      quote_blockers: [],
      scope_summary: 'A complete electrical repair scope.',
      quote_ready: true,
      next_action: { kind: 'prepare_offer' },
      safety_flags: [{ code: 'electrical_fire', severity: 'stop' }],
    }).success).toBe(false)
  })

  it('carries evidence requirement policy and defaults older evidence requests to mandatory', () => {
    const artifact = buildInitialDiagnosisScopeArtifact({
      serviceType: 'electrical',
      customerGoal: 'Ổ cắm không hoạt động.',
    })
    const optional = kaelDiagnosisScopeArtifactSchema.parse({
      ...artifact,
      next_action: {
        kind: 'request_evidence',
        evidence_kind: 'any',
        prompt: 'Thêm ảnh, video hoặc bản chép lời nếu thuận tiện.',
        required: false,
      },
    })
    const legacyMandatory = kaelDiagnosisScopeArtifactSchema.parse({
      ...artifact,
      next_action: {
        kind: 'request_evidence',
        evidence_kind: 'photo',
        prompt: 'Cần ảnh hiện trạng.',
      },
    })

    expect(optional.next_action).toMatchObject({ kind: 'request_evidence', evidence_kind: 'any', required: false })
    expect(legacyMandatory.next_action).toMatchObject({ kind: 'request_evidence', required: true })
  })

  it('accepts a partial ticket update that cannot transition workflow state', () => {
    const result = kaelArtifactProposalSchema.parse({
      artifact_type: 'process_ticket',
      visibility: 'partial',
      confidence: 0.72,
      missing_fields: ['address_district'],
      may_transition: false,
      ticket_patch: {
        problem_summary: 'Vòi lavabo rò nước liên tục.',
      },
      recommended_next_question: 'Bạn đang ở quận nào của TP.HCM?',
    })

    expect(result.artifact_type).toBe('process_ticket')
    expect(result.may_transition).toBe(false)
  })

  it('accepts lifecycle artifact proposals without giving them transition authority', () => {
    const lifecycleTypes = [
      'worker_brief',
      'cancellation_review',
      'completion_review',
      'dispute_decision',
      'payment_decision',
    ] as const

    for (const artifact_type of lifecycleTypes) {
      const result = kaelArtifactProposalSchema.parse({
        artifact_type,
        visibility: artifact_type === 'worker_brief' ? 'worker_visible' : 'internal',
        confidence: 0.74,
        missing_fields: [],
        may_transition: false,
        ticket_patch: {
          summary: `${artifact_type} draft`,
        },
      })

      expect(result.artifact_type).toBe(artifact_type)
      expect(result.may_transition).toBe(false)
    }
  })

  it('rejects AI output that attempts to mutate workflow phase directly', () => {
    const result = kaelArtifactProposalSchema.safeParse({
      artifact_type: 'estimate',
      visibility: 'customer_review',
      confidence: 0.9,
      missing_fields: [],
      may_transition: true,
    })

    expect(result.success).toBe(false)
  })

  it('accepts a separate server-side Kael autonomy decision for workflow transitions', () => {
    const decision = buildKaelAutonomyDecision({
      action: 'start_matching',
      policyId: 'kael.autonomy.v2.estimate_to_matching',
      evidence: [
        {
          kind: 'artifact',
          reference_id: 'estimate-card-1',
          summary: 'Estimate, service scope, and HCMC district were validated server-side.',
        },
      ],
      confidence: 0.91,
      resultingEvent: 'kael_started_matching',
      reversible: true,
      appealable: true,
    })

    expect(kaelAutonomyDecisionSchema.parse(decision)).toMatchObject({
      actor: 'kael_system',
      action: 'start_matching',
      resulting_event: 'kael_started_matching',
    })
  })

  it('rejects Kael autonomy decisions without audit evidence', () => {
    const result = kaelAutonomyDecisionSchema.safeParse({
      actor: 'kael_system',
      action: 'start_matching',
      policy_id: 'kael.autonomy.v2.estimate_to_matching',
      evidence: [],
      confidence: 0.8,
      reversible: true,
      appealable: true,
      resulting_event: 'kael_started_matching',
    })

    expect(result.success).toBe(false)
  })

  it('rejects unknown workflow phase fields instead of silently stripping them', () => {
    const result = kaelArtifactProposalSchema.safeParse({
      artifact_type: 'process_ticket',
      visibility: 'partial',
      confidence: 0.7,
      missing_fields: [],
      may_transition: false,
      current_phase: 'done',
    })

    expect(result.success).toBe(false)
  })

  it('rejects ticket patch fields that try to carry status changes', () => {
    const result = kaelArtifactProposalSchema.safeParse({
      artifact_type: 'process_ticket',
      visibility: 'partial',
      confidence: 0.7,
      missing_fields: [],
      may_transition: false,
      ticket_patch: {
        problem_summary: 'Vòi lavabo rò nước liên tục.',
        status: 'reviewed',
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects nested ticket patch fields that try to carry workflow state', () => {
    const result = kaelArtifactProposalSchema.safeParse({
      artifact_type: 'process_ticket',
      visibility: 'partial',
      confidence: 0.7,
      missing_fields: [],
      may_transition: false,
      ticket_patch: {
        problem_summary: 'Vòi lavabo rò nước liên tục.',
        metadata: {
          current_phase: 'done',
        },
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects backend status aliases inside ticket patches', () => {
    const result = kaelArtifactProposalSchema.safeParse({
      artifact_type: 'process_ticket',
      visibility: 'partial',
      confidence: 0.7,
      missing_fields: [],
      may_transition: false,
      ticket_patch: {
        problem_summary: 'Vòi lavabo rò nước liên tục.',
        job_status: 'reviewed',
        next_status: 'done',
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects camelCase workflow aliases inside ticket patches', () => {
    const result = kaelArtifactProposalSchema.safeParse({
      artifact_type: 'process_ticket',
      visibility: 'partial',
      confidence: 0.7,
      missing_fields: [],
      may_transition: false,
      ticket_patch: {
        problem_summary: 'Voi lavabo ro nuoc lien tuc.',
        currentPhase: 'done',
        jobStatus: 'reviewed',
        workflowEvent: 'review_submitted',
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects transition event aliases inside nested ticket patches', () => {
    const result = kaelArtifactProposalSchema.safeParse({
      artifact_type: 'process_ticket',
      visibility: 'partial',
      confidence: 0.7,
      missing_fields: [],
      may_transition: false,
      ticket_patch: {
        metadata: {
          workflow_event: 'review_submitted',
          transition_event: 'payment_confirmed',
        },
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects nested estimate fields outside the structured artifact contract', () => {
    const result = kaelArtifactProposalSchema.safeParse({
      artifact_type: 'estimate',
      visibility: 'customer_review',
      confidence: 0.9,
      missing_fields: [],
      may_transition: false,
      estimate: {
        price_min: 250_000,
        price_max: 350_000,
        confidence: 0.9,
        disclaimer: 'Giá để khách xem lại trước khi xác nhận.',
        current_phase: 'done',
      },
    })

    expect(result.success).toBe(false)
  })

  it('requires estimate payloads for estimate artifacts only', () => {
    expect(kaelArtifactProposalSchema.safeParse({
      artifact_type: 'estimate',
      visibility: 'customer_review',
      confidence: 0.9,
      missing_fields: [],
      may_transition: false,
    }).success).toBe(false)

    expect(kaelArtifactProposalSchema.safeParse({
      artifact_type: 'process_ticket',
      visibility: 'partial',
      confidence: 0.7,
      missing_fields: [],
      may_transition: false,
      estimate: {
        price_min: 250_000,
        price_max: 350_000,
        confidence: 0.9,
        disclaimer: 'Review-only estimate.',
      },
    }).success).toBe(false)
  })

  it('builds missing-information proposals that cannot transition workflow state', () => {
    const proposal = buildKaelMissingInfoArtifactProposal({
      missingFields: ['address_district'],
      question: 'Bạn đang ở quận nào của TP.HCM?',
    })

    expect(proposal).toMatchObject({
      artifact_type: 'process_ticket',
      visibility: 'partial',
      missing_fields: ['address_district'],
      may_transition: false,
    })
  })

  it('wires failed Kael chat analysis back into a non-transitioning AI notes artifact proposal', () => {
    const servicesSource = [
      'domains.ts',
      'domains/kael-chat/branches-post-pipeline.ts',
    ].map((path) => readFileSync(
      join(process.cwd(), '../../supabase/functions/mobile-api/_shared', path),
      'utf8',
    )).join('\n')

    expect(servicesSource).toContain('missingFields: ["description_or_photo"]')
    expect(servicesSource).toContain('artifactType: "ai_notes"')
    expect(servicesSource).toContain('buildKaelMissingInfoArtifactProposal')
  })
})
