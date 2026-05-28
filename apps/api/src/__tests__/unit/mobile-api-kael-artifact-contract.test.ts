import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildKaelMissingInfoArtifactProposal,
  kaelArtifactProposalSchema,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/artifact-contract'

describe('Kael artifact proposal contract', () => {
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
        problem_summary: 'VÃ²i lavabo rÃ² nÆ°á»›c liÃªn tá»¥c.',
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
    const servicesSource = readFileSync(
      join(process.cwd(), '../../supabase/functions/mobile-api/_shared/services.ts'),
      'utf8',
    )

    expect(servicesSource).toContain('missingFields: ["description_or_photo"]')
    expect(servicesSource).toContain('artifactType: "ai_notes"')
    expect(servicesSource).toContain('buildKaelMissingInfoArtifactProposal')
  })
})
