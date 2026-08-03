import { describe, expect, it } from 'vitest'
import {
  assertNeutralDisputeLanguage,
  buildDisputeEvidenceSnapshot,
  buildNeutralDisputeSummary,
  determineDisputeSubCase,
  evaluateDisputeAbuse,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/agentic/case-5-dispute'

describe('Kael P13 dispute case', () => {
  it('T13: determines the four active dispute sub-cases and defers unpaid service', () => {
    expect(determineDisputeSubCase({
      disputeType: 'completion_rejected',
      jobStatus: 'completed_by_worker',
    })).toMatchObject({ subCase: 'completion_rejected', deferred: false })

    expect(determineDisputeSubCase({
      disputeType: 'damage_claim',
      jobStatus: 'confirmed_by_customer',
      hoursAfterCompletion: 36,
    })).toMatchObject({ subCase: 'damage_claim', deferred: false })

    expect(determineDisputeSubCase({
      disputeType: 'unpaid_service',
      jobStatus: 'confirmed_by_customer',
    })).toMatchObject({ subCase: 'unpaid_service', deferred: true })

    expect(determineDisputeSubCase({
      disputeType: 'abusive_behavior_worker',
      jobStatus: 'completed_by_worker',
    })).toMatchObject({ subCase: 'abusive_behavior', deferred: false })

    expect(determineDisputeSubCase({
      disputeType: 'scope_disagreement_post_job',
      jobStatus: 'completed_by_worker',
    })).toMatchObject({ subCase: 'scope_disagreement_post_job', deferred: false })
  })

  it('T13.6: builds a neutral fact summary without outcome or money recommendations', () => {
    const summary = buildNeutralDisputeSummary({
      disputeType: 'completion_rejected',
      initiatedBy: 'customer',
      initiatorStatement: 'Khach noi cong viec chua xong.',
      counterPartyStatement: 'Tho noi da sua dung pham vi ban dau.',
      evidenceCounts: {
        chatMessages: 3,
        photoUrls: 2,
        statusEvents: 5,
        scopeChanges: 1,
        kaelArtifacts: 1,
      },
    })

    expect(summary).toContain('Customer statement')
    expect(summary).toContain('Worker statement')
    expect(summary).toContain('Evidence snapshot')
    expect(assertNeutralDisputeLanguage(summary).ok).toBe(true)
    expect(summary.toLowerCase()).not.toContain('refund')
    expect(summary).not.toMatch(/\b\d{2,}\s?k\b/i)
  })

  it('T13.7: creates an immutable evidence snapshot payload from safe IDs and URLs', () => {
    const snapshot = buildDisputeEvidenceSnapshot({
      lockedAt: '2026-05-26T00:00:00.000Z',
      chatMessageIds: ['11111111-1111-4111-8111-111111111111'],
      photoUrls: ['supabase://job-media/job-1/after/a.jpg'],
      statusTimeline: [{ status: 'completed_by_worker', at: '2026-05-25T23:00:00.000Z' }],
      scopeChangeIds: ['22222222-2222-4222-8222-222222222222'],
      kaelArtifactIds: ['33333333-3333-4333-8333-333333333333'],
    })

    expect(snapshot.evidence_locked_at).toBe('2026-05-26T00:00:00.000Z')
    expect(snapshot.evidence_snapshot).toMatchObject({
      chat_message_ids: ['11111111-1111-4111-8111-111111111111'],
      photo_urls: ['supabase://job-media/job-1/after/a.jpg'],
      scope_changes: ['22222222-2222-4222-8222-222222222222'],
      kael_artifacts: ['33333333-3333-4333-8333-333333333333'],
    })
  })

  it('T13.10: dispute anti-abuse opens admin review signals only', () => {
    const abuse = evaluateDisputeAbuse({
      customerDisputes30d: 3,
      customerCompletedJobs30d: 10,
      workerDisputes30d: 2,
      workerCompletedJobs30d: 10,
      frivolousDisputes30d: 3,
      samePartyRepeatDisputes30d: 2,
    })

    expect(abuse.adminReviewRequired).toBe(true)
    expect(abuse.signals).toEqual(expect.arrayContaining([
      'customer_dispute_rate_threshold',
      'worker_dispute_rate_threshold',
      'frivolous_dispute_threshold',
      'same_party_repeat_threshold',
    ]))
    expect(JSON.stringify(abuse)).not.toContain('auto_suspend')
    expect(JSON.stringify(abuse)).not.toContain('refund_amount')
  })
})
