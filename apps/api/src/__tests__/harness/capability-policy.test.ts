import { describe, expect, it } from 'vitest'
import { createActorContext } from '../../../../../supabase/functions/mobile-api/_shared/platform/authz/actor-context'
import {
  CapabilityAuthorizationError,
  assertCapabilityEnvelope,
  authorizeRouteCapability,
  capabilityPolicyForRoute,
  requireCapability,
} from '../../../../../supabase/functions/mobile-api/_shared/platform/authz/capability-policy'

describe('mobile capability policies', () => {
  it('issues an immutable job capability envelope with resource scope', () => {
    const actor = createActorContext({
      userId: 'worker-1',
      role: 'worker',
      environment: 'staging',
      releaseId: 'release-1',
    })
    const envelope = authorizeRouteCapability(actor, {
      kind: 'jobs.status',
      method: 'PATCH',
      jobId: 'job-1',
      roles: ['worker', 'admin'],
    })

    expect(envelope).toMatchObject({
      capability: 'mobile.route.jobs.status',
      method: 'PATCH',
      risk: 'write',
      privileged: true,
      requiresResourceCheck: true,
      resource: { type: 'job', id: 'job-1' },
    })
    expect(Object.isFrozen(envelope)).toBe(true)
    expect(requireCapability({ actorContext: actor, capabilityEnvelope: envelope }, envelope.capability)).toBe(envelope)
  })

  it('denies an unregistered route instead of inventing a capability', () => {
    const actor = createActorContext({ userId: 'customer-1', role: 'customer' })

    expect(() => authorizeRouteCapability(actor, {
      kind: 'unknown.route',
      method: 'POST',
      roles: ['customer'],
    })).toThrow(CapabilityAuthorizationError)
    expect(capabilityPolicyForRoute({ kind: 'unknown.route' })).toBeNull()
  })

  it('denies a role that is absent from the route policy', () => {
    const actor = createActorContext({ userId: 'customer-1', role: 'customer' })

    expect(() => authorizeRouteCapability(actor, {
      kind: 'workers.availability',
      method: 'PATCH',
      roles: ['worker'],
    })).toThrow('cannot use mobile.route.workers.availability')
  })

  it('denies an HTTP method that is absent from the route policy', () => {
    const actor = createActorContext({ userId: 'worker-1', role: 'worker' })

    expect(() => authorizeRouteCapability(actor, {
      kind: 'jobs.status',
      method: 'DELETE',
      jobId: 'job-1',
      roles: ['worker'],
    })).toThrow('Method DELETE is not registered for mobile.route.jobs.status')
  })

  it('keeps account-deletion retry as the only capability for a processing account', () => {
    const actor = createActorContext({
      userId: 'customer-1',
      role: 'customer',
      accountState: 'deletion_processing',
    })

    expect(authorizeRouteCapability(actor, {
      kind: 'me.accountDeletion',
      method: 'POST',
      roles: ['customer'],
    }).capability).toBe('mobile.route.me.accountDeletion')
    expect(() => authorizeRouteCapability(actor, {
      kind: 'me.avatar',
      method: 'GET',
      roles: ['customer'],
    })).toThrow('account is not active')
  })


  it('rejects a stale capability envelope', () => {
    const actor = createActorContext({
      userId: 'customer-1',
      role: 'customer',
      environment: 'staging',
      releaseId: 'release-1',
    })
    const issuedAt = Date.parse('2026-08-06T00:00:00.000Z')
    const envelope = authorizeRouteCapability(actor, {
      kind: 'me.avatar',
      method: 'GET',
      roles: ['customer'],
    }, issuedAt)

    expect(() => assertCapabilityEnvelope(envelope, {
      actor,
      now: Date.parse(envelope.expiresAt),
    })).toThrow('stale or has invalid time bounds')
  })

  it('rejects resource, environment, and release scope mismatches', () => {
    const actor = createActorContext({
      userId: 'worker-1',
      role: 'worker',
      environment: 'staging',
      releaseId: 'release-1',
    })
    const envelope = authorizeRouteCapability(actor, {
      kind: 'jobs.status',
      method: 'PATCH',
      jobId: 'job-1',
      roles: ['worker'],
    })

    expect(() => assertCapabilityEnvelope(envelope, {
      actor,
      route: {
        kind: 'jobs.status',
        method: 'PATCH',
        jobId: 'job-2',
        roles: ['worker'],
      },
    })).toThrow('does not match the requested route or resource')

    expect(() => assertCapabilityEnvelope(envelope, {
      actor,
      route: {
        kind: 'jobs.status',
        method: 'DELETE',
        jobId: 'job-1',
        roles: ['worker'],
      },
    })).toThrow('does not match the requested route or resource')

    const differentRelease = createActorContext({
      userId: 'worker-1',
      role: 'worker',
      environment: 'staging',
      releaseId: 'release-2',
    })
    expect(() => assertCapabilityEnvelope(envelope, {
      actor: differentRelease,
    })).toThrow('does not belong to this actor, environment, or release')
  })

  it('classifies administrative and money-impacting routes explicitly', () => {
    expect(capabilityPolicyForRoute({
      kind: 'admin.kaelLearning.candidates.approve',
      method: 'POST',
      roles: ['admin'],
    })).toMatchObject({ risk: 'administrative', privileged: true })
    expect(capabilityPolicyForRoute({
      kind: 'jobs.paymentIntent',
      method: 'POST',
      roles: ['customer'],
    })).toMatchObject({ risk: 'money', privileged: true })
  })
})
