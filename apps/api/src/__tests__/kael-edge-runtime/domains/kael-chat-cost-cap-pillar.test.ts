import { afterEach, describe, expect, it, vi } from 'vitest'

import { installEdgeRuntimeTestHooks, makeSequenceClient, scriptedProviderFetch } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { prepareKaelChatPrePipeline } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/branches-pre-pipeline'
import { KAEL_CHAT_HARD_COST_CAP_USD } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/cost-cap'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'

export const PILLAR = {
  id: 'P14-kael-chat-cost-cap',
  invariant:
    'a chat session that has reached the hard USD cap stops before the pipeline, reaches no provider, and says so instead of answering',
  authority: [
    'governance/RULES.md #8 (no silent degradation, no fake success)',
    'governance/RULES.md #2 (provider spend stays inside the wrapper and its caps)',
    'governance/RULES.md #5 (user-facing text is Vietnamese by default)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/branches-pre-pipeline.ts',
  layer: 'integration',
  siblings: ['P11-kael-routing-conformance', 'P16-ai-spend-envelope', 'P15-kael-inbound-safety'],
  mutation:
    'change the guard to `currentCostUsd <= KAEL_CHAT_HARD_COST_CAP_USD` or raise the constant — the at-the-cap and no-provider-reached cases turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const SESSION_ID = 'session-p14'

afterEach(() => {
  vi.restoreAllMocks()
})

function sessionAt(totalCostUsd: number) {
  // Pinned per-table so the assertion does not depend on how many other reads the branch makes.
  // The session row is answered repeatedly because the boundary guard reads and writes it before
  // the cost state is loaded.
  const row = {
    data: {
      id: SESSION_ID,
      diagnosis_scope: null,
      total_turns: 3,
      total_cost_usd: totalCostUsd,
    },
    error: null,
  }
  const turn = { data: { id: 'turn-p14' }, error: null }
  return makeSequenceClient([], {}, {
    kael_chat_sessions: Array.from({ length: 12 }, () => ({ ...row })),
    kael_chat_turns: Array.from({ length: 12 }, () => ({ ...turn })),
  })
}

function runWith(client: ReturnType<typeof sessionAt>, language: 'vi' | 'en' = 'vi') {
  return prepareKaelChatPrePipeline({
    client: client as unknown as DbClient,
    sessionId: SESSION_ID,
    actorId: 'customer-p14',
    message: 'Vòi nước bồn rửa bị rỉ nhẹ',
    serviceType: 'plumbing',
    safeCustomerEvidence: 'Vòi nước bồn rửa bị rỉ nhẹ',
    durableCustomerDetail: 'Vòi nước bồn rửa bị rỉ nhẹ',
    problemChips: ['faucet_broken'],
    language,
    earlySafetySignals: [],
    progressTarget: { table: 'kael_chat_sessions', id: SESSION_ID },
    llmClarificationEnabled: false,
  })
}

function budgetTurn(client: ReturnType<typeof sessionAt>) {
  const payloads = client.calls.flatMap((call) =>
    call.operations
      .filter((operation) => operation[0] === 'insert' || operation[0] === 'update')
      .map((operation) => operation[1]),
  )
  return payloads.find(
    (payload) => JSON.stringify(payload ?? {}).includes('budget_exceeded'),
  ) as Record<string, unknown> | undefined
}

describe('prepareKaelChatPrePipeline cost cap', () => {
  it('states the cap as one dollar per session', () => {
    expect(
      KAEL_CHAT_HARD_COST_CAP_USD,
      pillarWhy(PILLAR, 'the cap is the only ceiling on what one conversation can spend'),
    ).toBe(1)
  })

  // A turn can legitimately be handled early for other reasons — a fresh session asks for a
  // district first — so the question is never "was it handled" but "was it refused for budget".
  it('does not refuse a session just below the cap', async () => {
    const client = sessionAt(KAEL_CHAT_HARD_COST_CAP_USD - 0.000001)
    await runWith(client)
    expect(
      budgetTurn(client),
      pillarWhy(PILLAR, 'a session still under budget must not be told it is out of budget'),
    ).toBeUndefined()
  })

  // `<` is the guard, so landing exactly on the cap already stops. That boundary is the whole
  // difference between a cap and a suggestion, and asserting on `handled` alone would not see it:
  // a fresh session is also "handled" by the clarification branch.
  it('stops exactly at the cap', async () => {
    const client = sessionAt(KAEL_CHAT_HARD_COST_CAP_USD)
    const result = await runWith(client)
    expect(
      budgetTurn(client),
      pillarWhy(PILLAR, 'reaching the cap is reaching it, not approaching it'),
    ).toBeDefined()
    expect(
      result.handled,
      pillarWhy(PILLAR, 'a refused turn must not fall through to the pipeline'),
    ).toBe(true)
  })

  it('stops past the cap', async () => {
    const client = sessionAt(KAEL_CHAT_HARD_COST_CAP_USD + 4)
    const result = await runWith(client)
    expect(
      budgetTurn(client),
      pillarWhy(PILLAR, 'an overspent session must not buy another turn'),
    ).toBeDefined()
    expect(
      result.handled,
      pillarWhy(PILLAR, 'a refused turn must not fall through to the pipeline'),
    ).toBe(true)
  })

  // The reason this branch sits before the pipeline rather than inside it: once a provider call
  // starts, the money is already committed.
  it('reaches no provider once the cap is hit', async () => {
    const provider = scriptedProviderFetch({
      anthropic: { content: '{}' },
      deepseek: { content: '{}' },
      perplexity: { content: '{}' },
    })
    vi.stubGlobal('fetch', provider.fetch)

    await runWith(sessionAt(KAEL_CHAT_HARD_COST_CAP_USD + 1))

    expect(
      provider.calls,
      pillarWhy(PILLAR, 'a capped session that still calls a model has not been capped'),
    ).toEqual([])
  })

  it('records why the turn was refused', async () => {
    const client = sessionAt(KAEL_CHAT_HARD_COST_CAP_USD + 2)
    await runWith(client)

    const turn = budgetTurn(client)
    expect(
      turn,
      pillarWhy(PILLAR, 'the session has to show a refusal, not an unexplained gap'),
    ).toBeDefined()
    expect(
      JSON.stringify(turn),
      pillarWhy(PILLAR, 'the recorded cap must be the constant, not a number typed at the call site'),
    ).toContain(`"hard_cap_usd":${KAEL_CHAT_HARD_COST_CAP_USD}`)
  })

  it('tells the customer in Vietnamese', async () => {
    const client = sessionAt(KAEL_CHAT_HARD_COST_CAP_USD + 2)
    await runWith(client, 'vi')

    expect(
      JSON.stringify(budgetTurn(client)),
      pillarWhy(PILLAR, 'a Vietnamese-first product must not explain a stop in English'),
    ).toContain('Kael tạm dừng phân tích thêm')
  })

  it('switches the refusal to English only through the language switch', async () => {
    const client = sessionAt(KAEL_CHAT_HARD_COST_CAP_USD + 2)
    await runWith(client, 'en')

    expect(
      JSON.stringify(budgetTurn(client)),
      pillarWhy(PILLAR, 'the selected language must not mix with the default one'),
    ).toContain('Kael has paused further analysis')
  })
})
