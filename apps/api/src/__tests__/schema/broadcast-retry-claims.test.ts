import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(
  new URL(`../../../../../${path}`, import.meta.url),
  'utf8',
)

describe('broadcast retry claims', () => {
  it('uses a durable service-only claim with bounded crash recovery', () => {
    const sql = read('supabase/migrations/20260715113000_broadcast_retry_claims.sql')

    expect(sql).toContain('public.job_broadcast_retry_claims')
    expect(sql).toContain('function public.claim_job_broadcast_retry_atomic')
    expect(sql).toContain('function public.release_job_broadcast_retry_claim_atomic')
    expect(sql).toContain('on conflict (job_id) do update')
    expect(sql).toContain('v_now timestamptz := pg_catalog.clock_timestamp()')
    expect(sql).toContain('claim.expires_at <= v_now')
    expect(sql).not.toContain('p_now timestamptz')
    expect(sql).toContain("return query select false, 'ACTIVE_BROADCAST'::text")
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('to service_role')
    expect(sql).toContain('from public, anon, authenticated')
  })

  it('rechecks active rows under the claim and always releases the exact token', () => {
    const broadcasts = read('supabase/functions/mobile-api/_shared/services/matching/broadcasts.ts')
    const matching = read('supabase/functions/mobile-api/_shared/services/matching/index.ts')
    const candidate = read('supabase/functions/mobile-api/_shared/services/matching/candidates.ts')

    expect(broadcasts).toContain('claim_job_broadcast_retry_atomic')
    expect(broadcasts).toContain('release_job_broadcast_retry_claim_atomic')
    expect(broadcasts).not.toContain('p_now: nowIso')
    expect(broadcasts).not.toContain('Date.parse(nowIso) - 1_000')
    expect(broadcasts).toContain('finally {')
    expect(broadcasts).toContain('await releaseBroadcastRetryLease')
    expect(matching).toContain('runWithBroadcastRetryLease')
    expect(candidate).toContain('runWithBroadcastRetryLease')
    expect(matching).toContain('await hasActiveBroadcast(client, jobId, now)')
    expect(candidate).toContain('await hasActiveBroadcast(client, jobId, now)')
  })

  it('does not promise background matching when no such worker exists', () => {
    const matching = read('supabase/functions/mobile-api/_shared/services/matching/index.ts')

    expect(matching).not.toContain('Kael sẽ tiếp tục theo dõi và báo lại khi có thợ.')
    expect(matching).toContain('Bạn có thể thử tìm lại sau')
  })
})
