import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../../../..')
describe('atomic Kael memory updates', () => {
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
