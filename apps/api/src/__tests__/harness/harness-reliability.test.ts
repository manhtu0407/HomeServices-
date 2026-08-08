import { describe, expect, it, vi } from 'vitest'
import {
  assertHarnessCapabilityEnabled,
  readHarnessKillSwitch,
} from '../../../../../supabase/functions/_shared/harness/promotion'
import {
  acquireDependencyPermit,
  completeHarnessIdempotency,
  degradedModeFor,
  dependencyCircuitState,
  recordDependencyResult,
  hashReliabilityValue,
  markHarnessIdempotencyReconcileRequired,
  reliabilityPolicyForOperation,
  reserveHarnessIdempotency,
  startHarnessIdempotencyExecution,
  validateIdempotencyKey,
} from '../../../../../supabase/functions/_shared/harness/reliability'

describe('Harness reliability runtime', () => {
  it('pins money-impacting operations to one confirmed idempotent attempt', () => {
    expect(reliabilityPolicyForOperation('money_impacting')).toMatchObject({
      max_attempts: 1,
      idempotency: true,
      confirmation: true,
    })
  })

  it('validates bounded opaque idempotency keys', () => {
    expect(validateIdempotencyKey('payment:550e8400-e29b-41d4-a716-446655440000')).toBeTruthy()
    expect(validateIdempotencyKey('short')).toBeNull()
    expect(validateIdempotencyKey('bad key with spaces')).toBeNull()
  })

  it('hashes raw request bytes without coercing their contents to text', async () => {
    const bytes = new Uint8Array([0, 255, 10])
    await expect(hashReliabilityValue(bytes)).resolves.toMatch(/^[0-9a-f]{64}$/)
    await expect(hashReliabilityValue(bytes)).resolves.not.toBe(
      await hashReliabilityValue('\u0000\u00ff\n'),
    )
  })

  it('detects replay and request-hash conflict from the durable ledger', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ state: 'completed', reservation_id: 'r1', response_hash: 'a'.repeat(64) }], error: null })
      .mockResolvedValueOnce({ data: [{ state: 'conflict', reservation_id: null }], error: null })
    const client = { rpc }
    const base = {
      environment: 'staging',
      releaseId: 'harness-test',
      operationId: 'jobs.paymentIntent',
      actorId: 'customer-1',
      idempotencyKey: 'payment:550e8400-e29b-41d4-a716-446655440000',
      requestFingerprint: 'POST:/jobs/1/payment-intent:{}',
    }
    await expect(reserveHarnessIdempotency(client, base)).resolves.toMatchObject({ state: 'completed' })
    await expect(reserveHarnessIdempotency(client, { ...base, requestFingerprint: 'changed' })).resolves.toEqual({ state: 'conflict', reservationId: null })
  })

  it('moves an execution into durable reconciliation instead of reopening it', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: [{ state: 'reconcile_required', reservation_id: 'r1', response_hash: null }],
        error: null,
      })
    const client = { rpc }
    await expect(startHarnessIdempotencyExecution(client, 'r1')).resolves.toBe(true)
    await markHarnessIdempotencyReconcileRequired(client, 'r1', 'RESPONSE_RECEIPT_COMMIT_FAILED')
    await expect(reserveHarnessIdempotency(client, {
      environment: 'staging',
      releaseId: 'harness-test',
      operationId: 'jobs.review',
      actorId: 'customer-1',
      idempotencyKey: 'review:550e8400-e29b-41d4-a716-446655440000',
      requestFingerprint: 'POST:/jobs/1/review:{}',
    })).resolves.toEqual({ state: 'reconcile_required', reservationId: 'r1' })
    expect(rpc).toHaveBeenNthCalledWith(1, 'start_harness_idempotency_execution', {
      p_reservation_id: 'r1',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'mark_harness_idempotency_reconcile_required', {
      p_reservation_id: 'r1',
      p_error_code: 'RESPONSE_RECEIPT_COMMIT_FAILED',
    })
  })


  it('leases one half-open probe and records release-scoped dependency outcomes', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [{ allowed: true, state: 'half_open', retry_after_ms: 0, probe_token: 'probe-1' }],
        error: null,
      })
      .mockResolvedValueOnce({ data: 'closed', error: null })
    const client = { rpc }
    await expect(acquireDependencyPermit(client, { dependency: 'push', environment: 'staging' }))
      .resolves.toEqual({ allowed: true, state: 'half_open', retryAfterMs: 0, probeToken: 'probe-1' })
    await recordDependencyResult(client, {
      dependency: 'push',
      environment: 'staging',
      releaseId: 'harness-test',
      success: true,
      probeToken: 'probe-1',
    })
    expect(rpc).toHaveBeenLastCalledWith('record_harness_dependency_result', expect.objectContaining({
      p_dependency: 'push',
      p_environment: 'staging',
      p_release_id: 'harness-test',
      p_probe_token: 'probe-1',
      p_success: true,
    }))
  })

  it('fails closed when durable circuit state cannot be read', async () => {
    const client = { rpc: vi.fn().mockRejectedValue(new Error('db down')) }
    await expect(dependencyCircuitState(client, { dependency: 'sepay', environment: 'production' }))
      .resolves.toEqual({ state: 'open', retryAfterMs: 30_000 })
  })

  it('keeps local kill switches off without a remote control plane', async () => {
    await expect(readHarnessKillSwitch(null, {
      environment: 'local',
      switchId: 'global_ai',
    })).resolves.toEqual({ enabled: false, reasonCode: null })
  })

  it('fails closed when a remote kill-switch read is unavailable', async () => {
    const client = { rpc: vi.fn().mockRejectedValue(new Error('database unavailable')) }
    await expect(assertHarnessCapabilityEnabled(client, {
      environment: 'production',
      switches: ['global_ai'],
    })).resolves.toEqual({
      allowed: false,
      switchId: 'global_ai',
      reasonCode: 'KILL_SWITCH_READ_FAILED',
    })
  })

  it('blocks the first enabled switch in deterministic order', async () => {
    const client = { rpc: vi.fn()
      .mockResolvedValueOnce({ data: [{ enabled: false, reason_code: null }], error: null })
      .mockResolvedValueOnce({ data: [{ enabled: true, reason_code: 'PROVIDER_INCIDENT' }], error: null }) }
    await expect(assertHarnessCapabilityEnabled(client, {
      environment: 'staging',
      switches: ['global_ai', 'provider_anthropic'],
    })).resolves.toEqual({
      allowed: false,
      switchId: 'provider_anthropic',
      reasonCode: 'PROVIDER_INCIDENT',
    })
  })

  it('hashes response receipts before persistence and exposes honest degraded modes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    await expect(completeHarnessIdempotency({ rpc }, 'r1', 'safe-response')).resolves.toBe(true)
    expect(rpc).toHaveBeenCalledWith('complete_harness_idempotency', {
      p_reservation_id: 'r1',
      p_response_hash: await hashReliabilityValue('safe-response'),
    })
    expect(degradedModeFor('payment_unavailable')).toBe('payment_confirmation_locked')
  })
})
