import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(
  new URL(`../../../../../${path}`, import.meta.url),
  'utf8',
)

describe('broadcast retry claims', () => {
  it('rechecks active rows under the claim and always releases the exact token', () => {
    const broadcasts = [
      'supabase/functions/mobile-api/_shared/domains/matching/broadcasts.ts',
      'supabase/functions/mobile-api/_shared/domains/matching/broadcast-support.ts',
    ].map(read).join('\n')
    const matching = read('supabase/functions/mobile-api/_shared/domains/matching/flow.ts')
    const candidate = [
      'supabase/functions/mobile-api/_shared/domains/matching/candidate.ts',
      'supabase/functions/mobile-api/_shared/domains/matching/candidate-support.ts',
    ].map(read).join('\n')

    expect(broadcasts).toContain('claim_job_broadcast_retry_atomic')
    expect(broadcasts).toContain('release_job_broadcast_retry_claim_atomic')
    expect(broadcasts).not.toContain('p_now: nowIso')
    expect(broadcasts).not.toContain('Date.parse(nowIso) - 1_000')
    expect(broadcasts).toContain('finally {')
    expect(broadcasts).toContain('await releaseBroadcastRetryLease')
    expect(matching).toContain('runWithBroadcastRetryLease')
    expect(candidate).toContain('runWithBroadcastRetryLease')
    expect(matching).toContain('await hasActiveBroadcast(input.client, input.jobId, input.now)')
    expect(candidate).toContain('await hasActiveBroadcast(client, jobId, now)')
  })

  it('does not promise background matching when no such worker exists', () => {
    const matching = read('supabase/functions/mobile-api/_shared/domains/matching/flow.ts')

    expect(matching).not.toContain('Kael sẽ tiếp tục theo dõi và báo lại khi có thợ.')
    expect(matching).toContain('Bạn có thể thử tìm lại sau')
  })
})
