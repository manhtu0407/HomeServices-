import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from './pillar-manifest'
import { workerKaelChatCreateSchema } from '../validation'

export const PILLAR = {
  id: 'P58-worker-kael-opportunity-intake-contract',
  invariant:
    'worker Kael keeps normal chat jobless while intake supports both an accepted job and a jobless opportunity-search scope without adding a third public mode',
  authority: [
    'governance/STRUCTURES.md (Worker Kael uses the existing normal and intake modes)',
    'governance/RULES.md #0 (workflow-sensitive writes remain behind the Edge boundary)',
    'governance/RULES.md #8 (no silent fallback or invented workflow state)',
  ],
  target: 'packages/shared/src/contracts/worker.ts',
  layer: 'security-negative',
  siblings: ['P04-remote-snapshot-validation', 'P57-worker-home-production-absorption'],
  mutation:
    'restore the old intake-without-job validation or allow normal chat to carry a job — the four-case matrix turns red',
} as const satisfies PillarManifest

const requestId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'

function parse(mode: 'normal' | 'intake', job_id?: string) {
  return workerKaelChatCreateSchema.safeParse({
    client_request_id: requestId,
    language: 'vi',
    mode,
    ...(job_id ? { job_id } : {}),
  })
}

describe('P58 worker Kael opportunity-intake contract', () => {
  it('accepts exactly the three supported public mode and job combinations', () => {
    expect(parse('normal').success, pillarWhy(PILLAR, 'normal chat stays jobless')).toBe(true)
    expect(parse('normal', jobId).success, pillarWhy(PILLAR, 'normal chat must never inherit job context')).toBe(false)
    expect(parse('intake', jobId).success, pillarWhy(PILLAR, 'accepted-job intake remains compatible')).toBe(true)
    expect(parse('intake').success, pillarWhy(PILLAR, 'jobless intake is the opportunity-search scope')).toBe(true)
  })

  it('keeps the Edge contract twin on the same two-mode matrix', () => {
    const edgeContract = readFileSync(
      new URL('../../../../supabase/functions/_shared/contracts/worker.ts', import.meta.url),
      'utf8',
    )
    const createBlock = edgeContract.match(
      /export const workerKaelChatCreateSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)\.superRefine\([\s\S]*?\n\}\);/,
    )?.[0] ?? ''

    expect(createBlock, pillarWhy(PILLAR, 'the Edge create schema must remain discoverable')).not.toBe('')
    expect(createBlock, pillarWhy(PILLAR, 'normal chat with a job stays invalid at the Edge boundary')).toContain(
      'value.mode === "normal" && value.job_id',
    )
    expect(createBlock, pillarWhy(PILLAR, 'the Edge boundary must not restore the old job requirement for intake')).not.toContain(
      'value.mode === "intake" && !value.job_id',
    )
    expect(edgeContract, pillarWhy(PILLAR, 'no third public chat mode may be introduced')).toContain(
      'z.enum(["normal", "intake"])',
    )
  })
})
