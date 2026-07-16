import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = () => readFileSync(
  new URL('../../../../../supabase/migrations/20260714109000_atomic_learning_queue_claims.sql', import.meta.url),
  'utf8',
)

const processor = () => readFileSync(
  new URL('../../../../../supabase/functions/mobile-api/_shared/kael/cron/process-learning-queue.ts', import.meta.url),
  'utf8',
)

describe('learning queue atomic claims', () => {
  it('claims due or stale rows with a service-only skip-locked lease', () => {
    const sql = migration()

    expect(sql).toContain('function public.claim_kael_learning_queue_atomic')
    expect(sql).toContain("queue_state = 'processing'")
    expect(sql).toContain('for update skip locked')
    expect(sql).toContain("claimed_at < p_now - interval '15 minutes'")
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('to service_role')
    expect(sql).toContain('from public, anon, authenticated')
  })

  it('uses the atomic claim before any provider path', () => {
    const source = processor()
    const handler = source.match(
      /export async function processLearningQueue\([\s\S]*?type DeepSeekLearningQueueResult/,
    )?.[0] ?? ''

    const claim = handler.indexOf('claim_kael_learning_queue_atomic')
    const deepSeek = handler.indexOf('processDeepSeekLearningQueue')
    const anthropic = handler.indexOf('submitAnthropicLearningBatch')

    expect(claim).toBeGreaterThan(-1)
    expect(deepSeek).toBeGreaterThan(claim)
    expect(anthropic).toBeGreaterThan(claim)
    expect(handler).not.toContain('.eq("queue_state", "pending")')
  })

  it('atomically finalizes realtime effects with exact-claim replay protection', () => {
    const sql = migration()
    const source = processor()
    const finalizeCall = source.indexOf('complete_kael_learning_queue_realtime_atomic')
    const legacyLifecycleInsert = source.indexOf('from("kael_rule_lifecycle_log").insert')

    expect(sql).toContain('function public.complete_kael_learning_queue_realtime_atomic')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain("v_queue.claim_id is distinct from p_claim_id")
    expect(sql).toContain("v_queue.finalized_claim_id = p_claim_id")
    expect(sql).toContain("lifecycle.safe_metadata->>'q4_queue_id' = v_queue.id::text")
    expect(sql).toContain("set queue_state = 'realtime_fallback'")
    expect(sql).toContain('to service_role')
    expect(sql).toContain('from public, anon, authenticated')
    expect(finalizeCall).toBeGreaterThan(-1)
    expect(legacyLifecycleInsert).toBe(-1)
  })

  it('checks owned queue and DeepSeek item writes instead of reporting false success', () => {
    const source = processor()
    const queueUpdate = source.match(
      /async function updateQueueRows[\s\S]*?function queueCustomId/,
    )?.[0] ?? ''
    const itemUpdate = source.match(
      /async function updateDeepSeekBatchItem[\s\S]*?async function mapWithConcurrency/,
    )?.[0] ?? ''

    expect(queueUpdate).toContain('.eq("claim_id", claimId)')
    expect(queueUpdate).toContain('.eq("queue_state", "processing")')
    expect(queueUpdate).toContain('result.error')
    expect(queueUpdate).toContain('LEARNING_QUEUE_WRITE_FAILED')
    expect(itemUpdate).toContain('result.error')
    expect(itemUpdate).toContain('DEEPSEEK_BATCH_ITEM_WRITE_FAILED')
  })
})
