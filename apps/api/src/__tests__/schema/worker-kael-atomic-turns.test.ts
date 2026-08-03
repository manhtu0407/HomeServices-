import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = () => readFileSync(
  new URL('../../../../../supabase/migrations/20260714108000_atomic_worker_kael_turns.sql', import.meta.url),
  'utf8',
)

const service = () => readFileSync(
  new URL('../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-chat-turn.ts', import.meta.url),
  'utf8',
)

const core = () => readFileSync(
  new URL('../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-chat.ts', import.meta.url),
  'utf8',
)

const edgeWorkerContract = () => readFileSync(
  new URL('../../../../../supabase/functions/_shared/contracts/worker.ts', import.meta.url),
  'utf8',
)

const edgeContractCommon = () => readFileSync(
  new URL('../../../../../supabase/functions/_shared/contracts/common.ts', import.meta.url),
  'utf8',
)

const sharedWorkerContract = () => readFileSync(
  new URL('../../../../../packages/shared/src/contracts/worker.ts', import.meta.url),
  'utf8',
)

const sharedContractCommon = () => readFileSync(
  new URL('../../../../../packages/shared/src/contracts/common.ts', import.meta.url),
  'utf8',
)

describe('worker Kael atomic turn boundary', () => {
  it('keeps provider ownership and the three-question cap behind service-role RPCs', () => {
    const sql = migration()

    for (const name of [
      'claim_worker_kael_chat_turn_atomic',
      'complete_worker_kael_chat_turn_atomic',
      'release_worker_kael_chat_turn_claim_atomic',
      'record_worker_kael_qa_atomic',
    ]) {
      expect(sql).toContain(`function public.${name}`)
    }
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('to service_role')
    expect(sql).toContain("status in ('in_flight', 'retryable')")
    expect(sql).toContain('source_turn_id')
    expect(sql).toContain("'KAEL_QA_LIMIT_REACHED'")
  })

  it('claims before the provider call and completes the answer through the atomic RPC', () => {
    const source = service()
    const handler = source.match(
      /export async function sendWorkerKaelChatTurn\([\s\S]*?export async function readWorkerKaelSession/,
    )?.[0] ?? ''

    const claim = handler.indexOf('claimWorkerKaelChatTurn')
    const provider = handler.indexOf('answer = await runWorkerAssist')
    const complete = handler.indexOf('completeWorkerKaelChatTurn')

    expect(claim).toBeGreaterThan(-1)
    expect(provider).toBeGreaterThan(claim)
    expect(complete).toBeGreaterThan(provider)
    expect(handler).not.toContain('findExistingWorkerKaelTurnByClientRequest')
    expect(handler).not.toContain('appendWorkerKaelAnswerTurn')
    expect(core()).toContain('record_worker_kael_qa_atomic')
  })

  it('requires a durable UUID for every worker chat turn', () => {
    const contractPairs = [
      { common: edgeContractCommon(), worker: edgeWorkerContract() },
      { common: sharedContractCommon(), worker: sharedWorkerContract() },
    ]
    const schemas = contractPairs.map(({ worker }) => worker.match(
      /export const workerKaelChatTurnSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/,
    )?.[0] ?? '')

    for (const [index, schema] of schemas.entries()) {
      expect(contractPairs[index].common).toContain('const clientRequestIdSchema = z.uuidv4()')
      expect(schema).toContain('client_request_id: clientRequestIdSchema,')
      expect(schema).not.toContain('client_request_id: clientRequestIdSchema.optional()')
    }
  })

  it('accepts only private kael_reference media at every validation layer', () => {
    for (const source of [edgeWorkerContract(), sharedWorkerContract()]) {
      const mediaSchema = source.match(
        /const workerKaelMediaRefSchema = z[\s\S]*?const workerKaelMediaRefsSchema/,
      )?.[0] ?? ''
      expect(mediaSchema).toContain('kael_reference')
      expect(mediaSchema).not.toMatch(/before|after|cancellation_evidence|scope_change_evidence/)
    }
    expect(migration()).toContain("|| '/kael_reference/[^[:space:]?#]+$'")
    expect(migration()).not.toContain("/(?:before|after|kael_reference|cancellation_evidence|scope_change_evidence)/")
  })
})
