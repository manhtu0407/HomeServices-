import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260714110000_atomic_learning_batch_results.sql',
)
const verificationPath = resolve(
  root,
  'supabase/tests/learning_batch_results_atomic_claims_verification.sql',
)

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\s+/g, ' ').toLowerCase()
}

describe('atomic learning batch-result claims', () => {
  it('claims due batches atomically with a recoverable stale lease', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const migration = normalized(migrationPath)

    expect(migration).toContain('create table private.kael_ai_batch_result_claims')
    expect(migration).toContain('function public.claim_kael_ai_batch_results')
    expect(migration).toContain('for update of batch skip locked')
    expect(migration).toContain('claim.claimed_at <= p_now - make_interval')
    expect(migration).toContain('on conflict (batch_id) do update')
    expect(migration).toContain('p_claim_token')
  })

  it('allows only the matching claim token to finalize a complete batch', () => {
    const migration = normalized(migrationPath)
    const completionStart = migration.indexOf('function public.complete_kael_ai_batch_results_claim')
    const batchLock = migration.indexOf('select batch.request_count', completionStart)
    const claimLock = migration.indexOf('from private.kael_ai_batch_result_claims as claim', completionStart)

    expect(migration).toContain('function public.complete_kael_ai_batch_results_claim')
    expect(migration).toContain('claim.claim_token = p_claim_token')
    expect(migration).toContain("item.status = 'pending'")
    expect(migration).toContain("set status = 'results_processed'")
    expect(migration).toContain("message = 'batch_claim_lost'")
    expect(migration).toContain("message = 'batch_items_incomplete'")
    expect(batchLock).toBeGreaterThan(completionStart)
    expect(claimLock).toBeGreaterThan(batchLock)
  })

  it('commits each item and queue terminal state in one owned transaction', () => {
    const migration = normalized(migrationPath)

    expect(migration).toContain('function public.record_kael_ai_batch_poll')
    expect(migration).toContain('set claimed_at = clock_timestamp()')
    expect(migration).toContain('function public.renew_kael_ai_batch_results_claim')
    expect(migration).toContain('function public.commit_kael_ai_batch_item_result')
    expect(migration).toContain('claim.claim_token = p_claim_token')
    expect(migration).toContain('for update of item')
    expect(migration).toContain('for update of queue')
    expect(migration).toContain('update public.kael_ai_batch_items as item')
    expect(migration).toContain('update public.kael_learning_queue as queue')
    expect(migration).toContain('v_item.response_payload is not distinct from p_response_payload')
    expect(migration).toContain('v_item.error_payload is not distinct from p_error_payload')
  })

  it('keeps claim management service-role-only', () => {
    const migration = normalized(migrationPath)

    for (const role of ['public', 'anon', 'authenticated']) {
      expect(migration).toMatch(new RegExp(
        `revoke execute on function public\\.claim_kael_ai_batch_results\\(\\s*integer, timestamptz, boolean, integer, uuid\\s*\\) from ${role}`,
      ))
      expect(migration).toMatch(new RegExp(
        `revoke execute on function public\\.complete_kael_ai_batch_results_claim\\(\\s*uuid, uuid\\s*\\) from ${role}`,
      ))
      expect(migration).toMatch(new RegExp(
        `revoke execute on function public\\.renew_kael_ai_batch_results_claim\\(\\s*uuid, uuid, timestamptz\\s*\\) from ${role}`,
      ))
      expect(migration).toMatch(new RegExp(
        `revoke execute on function public\\.record_kael_ai_batch_poll\\(\\s*uuid, uuid, text, integer, integer, integer, integer, integer,\\s*text, timestamptz, timestamptz, timestamptz\\s*\\) from ${role}`,
      ))
      expect(migration).toMatch(new RegExp(
        `revoke execute on function public\\.commit_kael_ai_batch_item_result\\(\\s*uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, timestamptz\\s*\\) from ${role}`,
      ))
    }
    expect(migration).toMatch(
      /grant execute on function public\.claim_kael_ai_batch_results\(\s*integer, timestamptz, boolean, integer, uuid\s*\) to service_role/,
    )
    expect(migration).toMatch(
      /grant execute on function public\.complete_kael_ai_batch_results_claim\(\s*uuid, uuid\s*\) to service_role/,
    )
    expect(migration).toMatch(
      /grant execute on function public\.renew_kael_ai_batch_results_claim\(\s*uuid, uuid, timestamptz\s*\) to service_role/,
    )
    expect(migration).toMatch(
      /grant execute on function public\.record_kael_ai_batch_poll\(\s*uuid, uuid, text, integer, integer, integer, integer, integer,\s*text, timestamptz, timestamptz, timestamptz\s*\) to service_role/,
    )
    expect(migration).toMatch(
      /grant execute on function public\.commit_kael_ai_batch_item_result\(\s*uuid, uuid, uuid, uuid, text, jsonb, jsonb, text, text, timestamptz\s*\) to service_role/,
    )
  })

  it('keeps rollback-safe SQL proof for lease exclusion and token ownership', () => {
    const verification = normalized(verificationPath)

    expect(verification).toContain('begin;')
    expect(verification).toContain('rollback;')
    expect(verification).toContain('active batch-result lease was claimed twice')
    expect(verification).toContain('stale batch-result lease was not recovered')
    expect(verification).toContain('stale poller rewrote provider batch status after losing ownership')
    expect(verification).toContain('stale poller finalized a batch after losing ownership')
    expect(verification).toContain('batch finalized while an item was still pending')
    expect(verification).toContain('conflicting terminal batch-item retry was accepted')
    expect(verification).toContain("has_function_privilege( 'anon'")
    expect(verification).toContain("has_function_privilege( 'service_role'")
  })
})
