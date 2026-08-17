import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const processor = () => readFileSync(
  new URL('../../../../../supabase/functions/mobile-api/_shared/kael/learning/cron/process-learning-queue.ts', import.meta.url),
  'utf8',
)

const queueRead = () => readFileSync(
  new URL('../../../../../supabase/functions/mobile-api/_shared/kael/learning/queue-read.ts', import.meta.url),
  'utf8',
)

const queueWrite = () => readFileSync(
  new URL('../../../../../supabase/functions/mobile-api/_shared/kael/learning/queue-write.ts', import.meta.url),
  'utf8',
)

describe('learning queue atomic claims', () => {
  it('uses the atomic claim before any provider path', () => {
    const handler = processor()
    const claimSource = queueRead()

    const claim = handler.indexOf('claimLearningQueueRows')
    const deepSeek = handler.indexOf('processDeepSeekLearningQueue')
    const anthropic = handler.indexOf('submitAnthropicLearningBatch')

    expect(claim).toBeGreaterThan(-1)
    expect(deepSeek).toBeGreaterThan(claim)
    expect(anthropic).toBeGreaterThan(claim)
    expect(claimSource).toContain('claim_kael_learning_queue_atomic')
    expect(claimSource).not.toContain('.eq("queue_state", "pending")')
  })

  it('finalizes realtime effects through the atomic RPC instead of a direct lifecycle insert', () => {
    const source = queueWrite()
    const finalizeCall = source.indexOf('complete_kael_learning_queue_realtime_atomic')
    const legacyLifecycleInsert = source.indexOf('from("kael_rule_lifecycle_log").insert')

    expect(finalizeCall).toBeGreaterThan(-1)
    expect(legacyLifecycleInsert).toBe(-1)
  })

  it('checks owned queue and DeepSeek item writes instead of reporting false success', () => {
    const source = queueWrite()
    const queueUpdate = source.match(
      /export async function updateQueueRows[\s\S]*?export async function releaseQueueRows/,
    )?.[0] ?? ''
    const itemUpdate = source.match(
      /export async function updateDeepSeekBatchItem[\s\S]*?export async function updateAiBatch/,
    )?.[0] ?? ''

    expect(queueUpdate).toContain('.eq("claim_id", claimId)')
    expect(queueUpdate).toContain('.eq("queue_state", "processing")')
    expect(queueUpdate).toContain('result.error')
    expect(queueUpdate).toContain('LEARNING_QUEUE_WRITE_FAILED')
    expect(itemUpdate).toContain('result.error')
    expect(itemUpdate).toContain('DEEPSEEK_BATCH_ITEM_WRITE_FAILED')
  })
})
