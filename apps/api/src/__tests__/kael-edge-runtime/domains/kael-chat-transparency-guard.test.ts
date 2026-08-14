import { describe, expect, it } from 'vitest'
import {
  buildInitialDiagnosisScopeArtifact,
  kaelDiagnosisScopeArtifactSchema,
} from '../../../../../../supabase/functions/mobile-api/_shared/kael'
import { maybeHandleDemandingCustomerKaelChatTurn } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/guard'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('chat transparency guard', () => {
  installEdgeRuntimeTestHooks()

  it('lets an active analysis continue when the customer asks for a price breakdown', async () => {
    const client = makeSequenceClient([])

    await expect(maybeHandleDemandingCustomerKaelChatTurn(client as never, {
      sessionId: 'kael-session-analysis',
      actorId: 'customer-1',
      jobId: null,
      status: 'active',
      casePhase: 'analysis',
      diagnosisScope: null,
      metadata: {},
      message: 'Hãy nêu điều đã biết, điều chưa biết, nguồn giá và cách tính giá.',
      qaCount: 2,
    })).resolves.toBe(false)

    expect(client.calls).toEqual([])
  })

  it('keeps a valid offer-review artifact when a soft transparency concern is intercepted', async () => {
    const initialArtifact = buildInitialDiagnosisScopeArtifact({
      customerGoal: 'Đo áp lực và định vị nguyên nhân không phá dỡ',
      serviceType: 'plumbing',
    })
    const offerArtifact = kaelDiagnosisScopeArtifactSchema.parse({
      ...initialArtifact,
      case_phase: 'offer_review',
      missing_facts: [],
      scope_summary: 'Khảo sát, đo áp lực và định vị nguyên nhân không phá dỡ.',
      quote_ready: true,
      quote_blockers: [],
      confidence: 0.76,
      next_action: { kind: 'prepare_offer' },
    })
    const client = makeSequenceClient([
      { data: { id: 'interaction-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          total_turns: 4,
          total_cost_usd: 0.002,
          safe_metadata: {},
        },
        error: null,
      },
      { data: { id: 'turn-soft' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
    ])

    await expect(maybeHandleDemandingCustomerKaelChatTurn(client as never, {
      sessionId: 'kael-session-1',
      actorId: 'customer-1',
      jobId: null,
      status: 'estimate_ready',
      casePhase: 'offer_review',
      diagnosisScope: offerArtifact,
      metadata: {},
      message: 'Tôi lo lắng về chất lượng và muốn xem rõ cơ sở giá.',
      qaCount: 2,
    })).resolves.toBe(true)

    const preservedOfferUpdate = client.calls
      .filter((call) => call.table === 'kael_chat_sessions')
      .flatMap((call) => call.operations)
      .find((operation) => {
        const value = operation[1] as Record<string, unknown> | undefined
        return operation[0] === 'update' && value?.case_phase === 'offer_review'
      })?.[1]
    expect(preservedOfferUpdate).toMatchObject({
      status: 'estimate_ready',
      case_phase: 'offer_review',
      diagnosis_scope: offerArtifact,
    })
  })
})
