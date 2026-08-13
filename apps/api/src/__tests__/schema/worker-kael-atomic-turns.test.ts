import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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
  })
})
