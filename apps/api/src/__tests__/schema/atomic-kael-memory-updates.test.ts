import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../../../..')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260714106000_atomic_kael_memory_updates.sql',
)

describe('atomic Kael memory updates', () => {
  it('defines durable service-role-only memory mutation RPCs', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create table if not exists public.kael_memory_update_receipts')
    expect(sql).toContain('on conflict (event_key) do nothing')
    for (const functionName of [
      'record_worker_disintermediation_memory_atomic',
      'record_normal_transaction_memory_atomic',
      'record_worker_cancellation_memory_atomic',
      'record_customer_cancellation_memory_atomic',
    ]) {
      expect(sql).toContain(`function public.${functionName}`)
      expect(sql).toMatch(new RegExp(
        `revoke execute on function public\\.${functionName}\\([^;]+ from authenticated`,
        'i',
      ))
      expect(sql).toMatch(new RegExp(
        `grant execute on function public\\.${functionName}\\([^;]+ to service_role`,
        'i',
      ))
    }
  })

  it('removes read-merge-upsert memory writes from every production caller', () => {
    const callerPaths = [
      'supabase/functions/mobile-api/_shared/domains/job/chat.ts',
      'supabase/functions/mobile-api/_shared/domains/job/chat-support.ts',
      'supabase/functions/mobile-api/_shared/domains/payment/completion-review.ts',
      'supabase/functions/mobile-api/_shared/kael/agents/agentic/case-3-worker-cancel.ts',
      'supabase/functions/mobile-api/_shared/kael/agents/agentic/case-4-customer-cancel.ts',
    ]
    const source = callerPaths
      .map((path) => readFileSync(resolve(root, path), 'utf8'))
      .join('\n')

    expect(source).not.toMatch(/\.from\(["']customer_kael_memory["']\)[\s\S]{0,800}\.upsert\(/)
    expect(source).not.toMatch(/\.from\(["']worker_kael_memory["']\)[\s\S]{0,800}\.upsert\(/)
    expect(source).toContain('record_worker_disintermediation_memory_atomic')
    expect(source).toContain('record_normal_transaction_memory_atomic')
    expect(source).toContain('record_worker_cancellation_memory_atomic')
    expect(source).toContain('record_customer_cancellation_memory_atomic')
  })

  it('scrubs cancellation excerpts before writing memory and admin queues', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const sanitizedReasonWrites = sql.match(
      /private\.sanitize_kael_memory_excerpt\(v_record\.(?:reason|reason_note)\)/g,
    ) ?? []

    expect(sanitizedReasonWrites).toHaveLength(4)
    for (const marker of [
      '[phone]',
      '[email]',
      '[id-number]',
      '[bank-account]',
      '[address]',
      '[building]',
      '[unit]',
      '[floor]',
      '[house-no]',
    ]) {
      expect(sql).toContain(marker)
    }
  })

  it('keeps user-authored language summaries outside transaction learning writes', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const start = sql.indexOf(
      'create or replace function public.record_normal_transaction_memory_atomic',
    )
    const end = sql.indexOf(
      'revoke execute on function public.record_normal_transaction_memory_atomic',
      start,
    )
    const normalTransactionRpc = sql.slice(start, end)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(normalTransactionRpc).not.toContain('preference_summary')
    expect(normalTransactionRpc).not.toContain('service_skill_summary')
    expect(normalTransactionRpc).not.toContain("format('Normal")
  })

  it('keeps generated database types aligned with the receipt and RPC contract', () => {
    const databaseTypes = readGeneratedDatabaseTypes()

    expect(databaseTypes).toContain('kael_memory_update_receipts: {')
    for (const functionName of [
      'record_worker_disintermediation_memory_atomic',
      'record_normal_transaction_memory_atomic',
      'record_worker_cancellation_memory_atomic',
      'record_customer_cancellation_memory_atomic',
    ]) {
      expect(databaseTypes).toContain(`${functionName}: {`)
    }
  })
})
