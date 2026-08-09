import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/index'

const root = resolve(__dirname, '../../../../../')
const candidateServiceSource = readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/domains/matching/candidate.ts'),
  'utf8',
)
const candidateSupportSource = readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/domains/matching/candidate-support.ts'),
  'utf8',
)
const candidateSources = `${candidateServiceSource}\n${candidateSupportSource}`
const acceptServiceSource = readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/domains/matching/accept.ts'),
  'utf8',
)
const dtoSource = readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/domains/contracts/job.ts'),
  'utf8',
)
const broadcastSource = [
  'supabase/functions/mobile-api/_shared/domains/matching/broadcasts.ts',
  'supabase/functions/mobile-api/_shared/domains/matching/broadcast-support.ts',
  'supabase/functions/mobile-api/_shared/domains/matching/broadcast-workers.ts',
  'supabase/functions/mobile-api/_shared/domains/matching/broadcast-ranking.ts',
  'supabase/functions/mobile-api/_shared/domains/matching/geo.ts',
  'supabase/functions/mobile-api/_shared/domains/matching/query-batches.ts',
].map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n')
const favoriteServiceSource = readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/domains/customer/favorite-worker.ts'),
  'utf8',
)

describe('mobile-api worker-candidate gate', () => {
  it.each([
    ['GET', 'candidate', 'jobs.workerCandidate'],
    [
      'POST',
      'candidates/candidate-1/confirm',
      'jobs.workerCandidateConfirm',
    ],
    [
      'POST',
      'candidates/candidate-1/reject',
      'jobs.workerCandidateReject',
    ],
  ] as const)('routes %s /jobs/:id/%s to owning-customer services', (method, suffix, kind) => {
    const route = matchRoute(
      new Request(`https://edge.test/jobs/job-1/${suffix}`, { method }),
    )
    expect(route).toMatchObject({ kind, jobId: 'job-1', roles: ['customer'] })
    if (method === 'POST') {
      expect(route).toMatchObject({ candidateId: 'candidate-1' })
    }
  })

  it.each([
    ['POST', 'me.favoriteWorkerSave'],
    ['DELETE', 'me.favoriteWorkerRemove'],
  ] as const)('routes %s favorite-worker mutations to the owning customer', (method, kind) => {
    expect(matchRoute(new Request('https://edge.test/me/favorite-workers/worker-1', { method })))
      .toMatchObject({ kind, workerId: 'worker-1', roles: ['customer'] })
  })

  it('returns only the reviewed safe worker projection', () => {
    expect(dtoSource).toContain('export type EdgeWorkerCandidateView')
    for (const safeField of [
      'candidate_id',
      'worker_id',
      'display_name',
      'avatar_url',
      'rating',
      'total_jobs',
      'years_experience',
      'verification_status',
      'is_favorite',
      'proposed_at',
      'expires_at',
    ]) {
      expect(dtoSource).toContain(`${safeField}:`)
    }

    const candidateType = dtoSource.match(
      /export type EdgeWorkerCandidateView = \{[\s\S]*?\n\};/,
    )?.[0] ?? ''
    expect(candidateType).not.toMatch(
      /\b(phone|bank_account|bank_name|cccd|legal_name|address_|home_lat|home_lng)\b/,
    )
    expect(candidateSources).toContain('.select("full_name, avatar_url")')
    expect(candidateSources).toContain('resolveWorkerAvatarUrl(client, profile.data.avatar_url)')
    expect(candidateSources).toContain('avatar_url: avatarUrl')
    expect(candidateSources).not.toContain('phone,')
    expect(candidateSources).not.toContain('bank_account')
    expect(candidateSources).not.toContain('cccd_front_url')
  })

  it('prioritizes and labels a real customer-owned favorite without exposing preference data publicly', () => {
    expect(candidateSources).toContain('customer_favorite_workers')
    expect(candidateSources).toContain('is_favorite: favorite.data !== null')
    expect(broadcastSource).toContain('loadAllFavoriteWorkerIds')
    expect(broadcastSource).toContain('favoriteWorkerIds.has')
    expect(broadcastSource).toContain('FAVORITE_WORKER_SCORE_BONUS')
    expect(broadcastSource).toContain('.in("id", Array.from(favoriteWorkerIds))')
    expect(broadcastSource).toContain('combinedCandidates')
    expect(favoriteServiceSource).toContain('customer_id: ctx.user.id')
    expect(favoriteServiceSource).toContain('.eq("customer_id", ctx.user.id)')
    expect(favoriteServiceSource).toContain('.eq("is_approved", true)')
    expect(favoriteServiceSource).toContain('.eq("is_suspended", false)')
  })

  it('requires every server artifact worker capability before ranking or broadcast', () => {
    expect(broadcastSource).toContain('hasEveryRequiredCapability')
    expect(broadcastSource).toContain('workerRequirements: asStringArray(diagnosisScope.worker_requirements)')
    expect(broadcastSource).toContain('reservedWorkerIds')
  })

  it('keeps address locked on worker accept and releases match only after customer confirm', () => {
    const acceptBody = acceptServiceSource.match(
      /export async function acceptBroadcast[\s\S]*?\n\}/,
    )?.[0] ?? ''
    expect(acceptBody).toContain('worker_candidate_pending')
    expect(acceptBody).not.toContain('projectAddressAccess')
    expect(acceptBody).not.toContain('notifyCustomerWorkerMatched')

    const confirmBody = candidateServiceSource.match(
      /export async function confirmWorkerCandidate[\s\S]*?\n\}/,
    )?.[0] ?? ''
    expect(confirmBody).toContain('confirm_worker_candidate_atomic')
    expect(confirmBody).toContain('notifyCustomerWorkerMatched')
  })

  it('restarts ranked matching after rejection without rebroadcasting previous recipients', () => {
    const rejectBody = candidateServiceSource.match(
      /export async function rejectWorkerCandidate[\s\S]*?\n\}/,
    )?.[0] ?? ''
    expect(rejectBody).toContain('reject_worker_candidate_atomic')
    expect(rejectBody).toContain('resumeMatchingAfterCandidateRejection')
    expect(candidateSources).toContain('listBroadcastRecipientWorkerIds')
    expect(candidateSources).toContain('excludeWorkerIds')
    expect(candidateSources).toContain('createBroadcasts')
  })

  it('expires stale proposals and keeps worker availability as an independent preference', () => {
    expect(candidateSources).toContain('candidateHasExpired')
    expect(candidateSources).toContain('worker_candidate_expired')
    expect(candidateSources).toMatch(
      /errorCode === "WORKER_NOT_ELIGIBLE" \|\| errorCode === "EXPIRED"/,
    )
    expect(candidateSources).toMatch(
      /errorCode === "EXPIRED"[\s\S]*?"worker_candidate_expired"[\s\S]*?resumeMatchingAfterCandidateRejection/,
    )
    expect(broadcastSource).toContain('job_worker_candidates')
    expect(broadcastSource).toContain('expires_at')
  })
})
