/**
 * S3 / authz-coverage (Plan.md §38 security hardening) — durable IDOR guardrail.
 *
 * The Edge builds its downstream Supabase client with the service-role key, so RLS
 * is bypassed inside handlers and authorization rests ENTIRELY on explicit Edge
 * checks (audit §2 "structural note"). Consequence: one resource-scoped route that
 * forgets its ownership guard = IDOR / money-state manipulation.
 *
 * This test DERIVES the resource-scoped route list directly from the `Route` union
 * in router.ts (the source of router dispatch) — it does NOT hand-pick. A route is
 * "resource-scoped" iff its descriptor carries a resource-id field
 * (jobId/sessionId/scopeChangeId/cancellationId/disputeId/candidateId/notificationId),
 * i.e. it targets one specific owned instance.
 *
 * It then asserts the derived set EQUALS the GUARDED registry below — every entry of
 * which was verified (audit §2/§4.1 + spot-checks) to enforce ownership via one of:
 * requireJobAccess (404), session-ownership preflight, an atomic RPC SQL owner/admin
 * check, or admin-role. If someone adds a NEW resource-scoped route later, the
 * derived set changes and this test FAILS LOUD until the route is reviewed and
 * registered with its guard — closing the "forgot the guard" regression window.
 *
 * Pure source-of-truth coverage check: 0 production code touched.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const routerPath = resolve(
  here,
  '../../../../../supabase/functions/mobile-api/_shared/router.ts',
)

/**
 * Every resource-scoped route -> the ownership mechanism that fails closed for it.
 * Verified against audit §2 ("Verified-strong") / §4.1 (exhaustive route authz) and
 * direct source spot-checks (e.g. markNotificationRead `.eq("user_id", ctx.user.id)`;
 * getKaelChatProgress `assertKaelSessionOwnership`). Keep in lockstep with router.ts.
 */
const GUARDED: Record<string, string> = {
  // job-scoped reads — requireJobAccess returns 404 (no existence leak)
  'jobs.get': 'requireJobAccess (404)',
  'jobs.messages.list': 'requireJobAccess (404)',
  // job-scoped writes — service ownership check or atomic RPC owner/participant SQL check
  'jobs.messages.send': 'service participant check',
  'jobs.media': 'service participant + stage check',
  'jobs.status': 'service worker-owner check (403)',
  'jobs.confirmSearch': 'RPC customer-owner (atomic)',
  'jobs.cancel': 'service owner check',
  'jobs.customerCancellation': 'RPC pre-gate customer-owner',
  'jobs.workerCancellation': 'RPC pre-gate worker-owner',
  'jobs.openDispute': 'open_dispute_atomic participant',
  'jobs.accept': 'accept_broadcast worker-eligibility',
  'jobs.decline': 'broadcast worker-eligibility',
  'jobs.accessAuthorize': 'service customer-owner check',
  'jobs.scopeChange': 'service worker-owner (Edge)',
  'jobs.kaelClarify': 'service participant check',
  'jobs.confirmCompletion': 'RPC customer-owner',
  'jobs.review': 'service customer-owner',
  // scope/cancellation/dispute by id — atomic RPC owner/admin SQL check
  'scope.decide': 'decide_scope_change_atomic p_customer_id',
  'workerCancellation.decide': 'decide_worker_cancellation_atomic admin',
  'disputes.counterStatement': 'dispute participant check',
  'disputes.adminDecision': 'admin role + dispute',
  // Kael customer chat sessions — session-ownership preflight
  'kael.chat.get': 'assertKaelSessionOwnership',
  'kael.chat.progress': 'assertKaelSessionOwnership',
  'kael.chat.stream': 'getKaelChat preflight before stream',
  'kael.chat.turn': 'getKaelChat / session ownership',
  'kael.chat.confirm': 'confirm_kael_chat_atomic p_customer_id',
  // Kael worker chat sessions — readWorkerKaelSession ownership
  'workers.kaelChat.get': 'readWorkerKaelSession ownership',
  'workers.kaelChat.stream': 'readWorkerKaelSession ownership',
  'workers.kaelChat.turn': 'readWorkerKaelSession ownership',
  // learning candidate by id — admin-only at router (S2/F2) + service ctx.role guard
  'admin.kaelLearning.candidates.approve': 'admin-only (S2/F2) + service guard',
  'admin.kaelLearning.candidates.reject': 'admin-only (S2/F2) + service guard',
  // notification by id — recipient-owner check
  'notifications.read': 'service recipient-owner (.eq user_id)',
}

const RESOURCE_ID_FIELD =
  /\b(jobId|sessionId|scopeChangeId|cancellationId|disputeId|candidateId|notificationId)\s*:/

function deriveResourceScopedRoutes(): Set<string> {
  const src = readFileSync(routerPath, 'utf8')
  const unionStart = src.indexOf('type Route =')
  const unionEnd = src.indexOf('function matchRoute(')
  expect(unionStart, 'Route union must exist in router.ts').toBeGreaterThanOrEqual(0)
  expect(unionEnd, 'matchRoute must follow the Route union').toBeGreaterThan(unionStart)
  const union = src.slice(unionStart, unionEnd)

  const kindRe = /kind:\s*"([^"]+)"/g
  const matches = [...union.matchAll(kindRe)]
  // Guard against a silent parse failure (regex drift) masking missing coverage.
  expect(matches.length, 'parsed too few routes — parser drifted?').toBeGreaterThan(40)

  const derived = new Set<string>()
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index ?? 0
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? union.length) : union.length
    const memberText = union.slice(start, end)
    if (RESOURCE_ID_FIELD.test(memberText)) derived.add(matches[i][1])
  }
  return derived
}

describe('S3: every resource-scoped Edge route has a registered ownership guard', () => {
  const derived = deriveResourceScopedRoutes()

  it('finds the expected number of resource-scoped routes (sanity)', () => {
    expect(derived.size).toBeGreaterThan(25)
  })

  it('no resource-scoped route is missing an ownership guard (fail loud on new routes)', () => {
    const missing = [...derived].filter((kind) => !(kind in GUARDED)).sort()
    expect(
      missing,
      `Resource-scoped route(s) added to router.ts without a registered ownership ` +
        `guard. Verify each enforces ownership (requireJobAccess / session preflight / ` +
        `RPC SQL owner check / admin role) and add it to GUARDED:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('the GUARDED registry has no stale entries (kept in lockstep with router.ts)', () => {
    const stale = Object.keys(GUARDED).filter((kind) => !derived.has(kind)).sort()
    expect(
      stale,
      `GUARDED lists route(s) that no longer exist as resource-scoped in router.ts ` +
        `(renamed/removed?). Update GUARDED:\n  ${stale.join('\n  ')}`,
    ).toEqual([])
  })

  it('coverage is exact: derived resource-scoped set === GUARDED registry', () => {
    expect(new Set(Object.keys(GUARDED))).toEqual(derived)
  })
})
