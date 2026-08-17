import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { matchRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/index'
import { CAPABILITY_POLICIES } from '../../../../../supabase/functions/mobile-api/_shared/platform/authz/capability-registry'

export const PILLAR = {
  id: 'P18-capability-registry-parity',
  invariant:
    'the audited capability policy for a route grants exactly the roles its descriptor declares plus the admin override, so the record that authorises a request is never wider than the route itself',
  authority: [
    'governance/RULES.md #7 (the customer confirms a proposed worker before final assignment)',
    'governance/RULES.md #0 (role guards belong to the server, not to a generated guess)',
  ],
  target: 'supabase/functions/mobile-api/_shared/platform/authz/capability-registry.ts',
  layer: 'static-type',
  siblings: ['P19-job-access-ownership', 'P12-workflow-transition-composition', 'P10-per-actor-rls'],
  mutation:
    'add "worker" to the roles of jobs.workerCandidateConfirm in platform/authz/capability-registry.ts — that route turns red by name, twice. Reverting the shorthand-roles fix in the generator no longer reaches this pillar: rolesForUndeclared refuses to build the registry at all',
} as const satisfies PillarManifest

// The descriptors are the oracle. Re-running scripts/harness/capability-registry.mjs would not be:
// the shipped registry is that generator's own output, so comparing the two can only ever agree.
// Driving matchRoute with a real Request reads what the server will actually enforce.
const PROBES = [
  { path: '/jobs/job-1/candidates/cand-1/confirm', method: 'POST' },
  { path: '/jobs/job-1/candidates/cand-1/reject', method: 'POST' },
  { path: '/kael/chat/session-1', method: 'GET' },
  { path: '/kael/chat/session-1', method: 'POST' },
  { path: '/kael/chat/session-1/confirm', method: 'POST' },
  { path: '/kael/chat/session-1/progress', method: 'GET' },
  { path: '/kael/chat/session-1/stream', method: 'POST' },
  { path: '/kael/chat/session-1/evidence', method: 'POST' },
  { path: '/kael/chat/session-1/evidence-stream', method: 'POST' },
  { path: '/kael/chat/session-1/intake-confirmation', method: 'POST' },
  { path: '/me/favorite-workers/worker-1', method: 'POST' },
  { path: '/me/favorite-workers/worker-1', method: 'DELETE' },
] as const

type Probe = { kind: string; declared: readonly string[]; audited: readonly string[] }

function probe(path: string, method: string): Probe | null {
  const route = matchRoute(new Request(`https://edge.test${path}`, { method }))
  if (!route || 'public' in route) return null
  const declared = (route as { roles?: readonly string[] }).roles
  if (declared === undefined) return null
  const policy = CAPABILITY_POLICIES[route.kind as keyof typeof CAPABILITY_POLICIES] as
    | { roles?: readonly string[] }
    | undefined
  if (!policy?.roles) return null
  return { kind: route.kind, declared, audited: policy.roles }
}

const RESOLVED = PROBES.map(({ path, method }) => ({
  path,
  method,
  result: probe(path, method),
}))

describe('route descriptors resolve', () => {
  it.each(RESOLVED.map((entry) => [`${entry.method} ${entry.path}`, entry] as const))(
    '%s matches a route carrying a declared role list',
    (_label, entry) => {
      expect(
        entry.result,
        pillarWhy(PILLAR, 'a route with no declared roles cannot be checked against its policy'),
      ).not.toBeNull()
    },
  )
})

// `_shared/platform/auth.ts:141-143` refuses a role outside `allowedRoles` unless the actor is an
// admin, so an admin genuinely reaches every protected route and the registry recording it is
// accurate. That override is the only role the registry may add: the expectation below is derived
// from the descriptor rather than relaxed to a superset check, so any *other* extra role is red.
const ADMIN_OVERRIDE = 'admin'

describe('audited roles equal declared roles plus the admin override', () => {
  it.each(
    RESOLVED.filter((entry) => entry.result !== null).map(
      (entry) => [entry.result!.kind, entry.result!] as const,
    ),
  )('%s is audited with exactly the roles it declares', (_kind, result) => {
    const expected = [...new Set([...result.declared, ADMIN_OVERRIDE])].sort()
    expect(
      [...result.audited].sort(),
      pillarWhy(
        PILLAR,
        `the descriptor declares [${[...result.declared].sort().join(', ')}] but the audited policy grants [${[...result.audited].sort().join(', ')}]`,
      ),
    ).toEqual(expected)
  })
})

describe('money-gated routes stay customer-only', () => {
  // RULES #7: a worker acceptance creates a candidate, and the customer confirms it. A policy that
  // lists `worker` here says a worker may confirm its own candidacy.
  it.each([
    ['jobs.workerCandidateConfirm', '/jobs/job-1/candidates/cand-1/confirm'],
    ['jobs.workerCandidateReject', '/jobs/job-1/candidates/cand-1/reject'],
  ])('%s never admits a worker', (kind, path) => {
    const result = probe(path, 'POST')
    expect(
      result,
      pillarWhy(PILLAR, `${kind} must resolve for this assertion to mean anything`),
    ).not.toBeNull()
    expect(
      result!.audited.includes('worker'),
      pillarWhy(PILLAR, 'a worker confirming its own candidacy defeats the proposed-worker gate'),
    ).toBe(false)
  })

  it('keeps the proposed-worker confirmation gate recorded on both routes', () => {
    for (const kind of ['jobs.workerCandidateConfirm', 'jobs.workerCandidateReject'] as const) {
      const policy = CAPABILITY_POLICIES[kind] as { confirmationGate?: string; risk?: string }
      expect(
        policy.confirmationGate,
        pillarWhy(PILLAR, `${kind} is the gate RULES #7 names, so it must be marked as one`),
      ).toBe('proposed_worker')
      expect(
        policy.risk,
        pillarWhy(PILLAR, 'assignment decides who gets paid, so the route carries money risk'),
      ).toBe('money')
    }
  })
})

describe('every audited policy names at least one role', () => {
  // A blanket three-role list is not by itself a defect: some routes are genuinely open to every
  // authenticated actor. What is never acceptable is a protected route whose policy grants nobody,
  // because `allowedRoles.includes(actor.role)` would then refuse everyone or, worse, be skipped.
  it.each(
    Object.entries(CAPABILITY_POLICIES)
      .filter(([, policy]) => !(policy as { public?: boolean }).public)
      .map(([kind, policy]) => [kind, policy as { roles?: readonly string[] }] as const),
  )('%s grants a non-empty role list', (_kind, policy) => {
    expect(
      (policy.roles ?? []).length,
      pillarWhy(PILLAR, 'a protected route with no roles has no one it can legitimately serve'),
    ).toBeGreaterThan(0)
  })
})
