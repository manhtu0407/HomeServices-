import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ConfirmationOperationReceipt } from '@nestscout/shared'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import {
  clearPendingConfirmation,
  getOrCreatePendingConfirmation,
  listPendingConfirmations,
  readPendingConfirmation,
  writePendingConfirmation,
} from '../frontend-workflow/confirmation-recovery'
import { reconcilePendingConfirmationRequest } from '../frontend-workflow/confirmation-reconciliation'

export const PILLAR = {
  id: 'P74-customer-confirmation-relaunch-recovery',
  invariant:
    'an ambiguous Customer confirmation survives process death under the exact account and replays the same intent and idempotency identity before any second job can exist',
  authority: [
    'governance/RULES.md #7 (Customer authority)',
    'governance/STRUCTURES.md Stage 1 durable confirmation operation',
  ],
  target: 'apps/mobile/lib/frontend-workflow/confirmation-recovery.ts',
  layer: 'integration',
  siblings: ['P46-stage1-customer-intake-mode', 'P48-durable-confirmation-operation'],
  mutation:
    'scope pending state only by session, omit the confirmed input, or generate a new key during replay — owner isolation or exact replay turns red',
} as const satisfies PillarManifest

const receipt: ConfirmationOperationReceipt = {
  accepted_at: '2026-09-05T01:00:00.000Z',
  idempotency_key: 'kael-confirm:session-a:customer-a',
  job_id: '33333333-3333-4333-8333-333333333333',
  operation_id: '22222222-2222-4222-8222-222222222222',
  quote_mode: 'rfq',
  retry_after_ms: 1_000,
  session_id: '11111111-1111-4111-8111-111111111111',
  state: 'matching_queued',
  support_code: 'A1B2C3D4',
  terminal: false,
  updated_at: '2026-09-05T01:00:01.000Z',
}

describe('Customer confirmation relaunch recovery', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await AsyncStorage.clear()
  })

  it('prepares one stable identity for 100 simultaneous confirmations', async () => {
    const records = await Promise.all(Array.from({ length: 100 }, () => getOrCreatePendingConfirmation(
      'customer-a', receipt.session_id, { confirmation_kind: 'rfq_request', matching_mode: 'prompt_if_saved' },
    )))
    expect(new Set(records.map((entry) => entry.idempotencyKey)).size).toBe(1)
    expect((await listPendingConfirmations('customer-a'))[0].idempotencyKey).toBe(records[0].idempotencyKey)
  })

  it('refuses broader or changed intent while the first confirmation outcome is unknown', async () => {
    const pending = await getOrCreatePendingConfirmation('customer-a', receipt.session_id, {
      confirmation_kind: 'rfq_request', matching_mode: 'prompt_if_saved',
    })
    await expect(getOrCreatePendingConfirmation('customer-a', receipt.session_id, {
      confirmation_kind: 'inspection_request', matching_mode: 'prompt_if_saved',
    })).rejects.toThrow('CONFIRMATION_RECOVERY_INTENT_CONFLICT')
    expect(await readPendingConfirmation('customer-a', receipt.session_id)).toEqual(pending)
  })

  it('does not treat unreadable storage as an absent command', async () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'))
    await expect(getOrCreatePendingConfirmation('customer-a', receipt.session_id, { confirmation_kind: 'rfq_request' })).rejects.toThrow()
    expect(AsyncStorage.setItem).not.toHaveBeenCalled()
  })

  it('preserves a corrupt envelope instead of deleting it and sending a fresh command', async () => {
    const key = 'nestscout.customer.confirmation-recovery.v2.customer-a'
    await AsyncStorage.setItem(key, '{broken')
    await expect(getOrCreatePendingConfirmation('customer-a', receipt.session_id, { confirmation_kind: 'rfq_request' })).rejects.toThrow()
    expect(await AsyncStorage.getItem(key)).toBe('{broken')
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled()
  })

  it('refuses a new command when 20 unresolved confirmations already occupy storage', async () => {
    for (let index = 0; index < 20; index += 1) await getOrCreatePendingConfirmation('customer-a', `session-${index}`, { confirmation_kind: 'rfq_request' })
    const before = await listPendingConfirmations('customer-a')
    await expect(getOrCreatePendingConfirmation('customer-a', 'session-overflow', { confirmation_kind: 'rfq_request' })).rejects.toThrow('CONFIRMATION_RECOVERY_STORAGE_FULL')
    expect(await listPendingConfirmations('customer-a')).toEqual(before)
  })

  it('does not replace the stored request identity through a receipt update', async () => {
    const pending = await getOrCreatePendingConfirmation('customer-a', receipt.session_id, { confirmation_kind: 'rfq_request' })
    await expect(writePendingConfirmation({ ...pending, idempotencyKey: 'different-confirmation-key' })).rejects.toThrow('CONFIRMATION_RECOVERY_IDENTITY_CONFLICT')
    expect(await readPendingConfirmation('customer-a', receipt.session_id)).toEqual(pending)
  })

  it('preserves legacy consent whose owner cannot be authenticated locally', async () => {
    const key = `nestscout.customer.confirmation-recovery.v1.${receipt.session_id}`
    const raw = JSON.stringify({ sessionId: receipt.session_id, idempotencyKey: 'legacy-confirmation-key', updatedAt: receipt.updated_at })
    await AsyncStorage.setItem(key, raw)
    await expect(readPendingConfirmation('customer-b', receipt.session_id)).rejects.toThrow('CONFIRMATION_RECOVERY_LEGACY_OWNER_UNVERIFIED')
    expect(await AsyncStorage.getItem(key)).toBe(raw)
    expect(await listPendingConfirmations('customer-b')).toEqual([])
  })

  it('rejects an operation bound to a different session without overwriting the pending intent', async () => {
    const pending = await getOrCreatePendingConfirmation('customer-a', 'another-session', { confirmation_kind: 'rfq_request' })
    await expect(writePendingConfirmation({ ...pending, operation: receipt })).rejects.toThrow('CONFIRMATION_RECOVERY_RECORD_INVALID')
    expect(await readPendingConfirmation('customer-a', 'another-session')).toEqual(pending)
  })

  it('does not replay a persisted confirm after the initiating account becomes inactive', async () => {
    const pending = await getOrCreatePendingConfirmation('customer-a', receipt.session_id, { confirmation_kind: 'rfq_request' })
    let current = true
    const transport = {
      getOperation: jest.fn(async () => {
        current = false
        return { success: false as const, status: 404, code: 'NOT_FOUND', error: '' }
      }),
      getSession: jest.fn(async () => ({ success: true as const, status: 200, data: { session: { id: receipt.session_id, confirmation_operation: null } } })),
      confirm: jest.fn(async () => ({ success: false as const, status: 503, code: 'UNAVAILABLE', error: '' })),
    }
    expect((await reconcilePendingConfirmationRequest(pending, 'old-token', transport as never, () => current)).kind).toBe('pending')
    expect(transport.getSession).not.toHaveBeenCalled()
    expect(transport.confirm).not.toHaveBeenCalled()
  })

  it('isolates a persisted confirmation intent by authenticated Customer', async () => {
    const pending = await getOrCreatePendingConfirmation(
      'customer-a',
      receipt.session_id,
      { confirmation_kind: 'rfq_request', matching_mode: 'prompt_if_saved' },
    )

    withPillarContext(PILLAR, () => {
      expect(pending.ownerId).toBe('customer-a')
      expect(pending.confirmInput).toEqual({
        confirmation_kind: 'rfq_request',
        matching_mode: 'prompt_if_saved',
      })
    })
    expect(await listPendingConfirmations('customer-b')).toEqual([])
    expect(await readPendingConfirmation('customer-b', receipt.session_id)).toBeNull()
    expect(await listPendingConfirmations('customer-a')).toHaveLength(1)
  })

  it('replays the exact persisted mutation after both read paths prove no receipt exists', async () => {
    const pending = await getOrCreatePendingConfirmation(
      'customer-a',
      receipt.session_id,
      { confirmation_kind: 'rfq_request', matching_mode: 'prompt_if_saved' },
    )
    const confirm = jest.fn(async () => ({
      data: { broadcast_sent: false, job_id: receipt.job_id, operation: receipt, session_id: receipt.session_id },
      status: 202,
      success: true as const,
    }))
    const transport = {
      confirm,
      getOperation: jest.fn(async () => ({
        code: 'NOT_FOUND', error: 'missing', status: 404, success: false as const,
      })),
      getSession: jest.fn(async () => ({
        data: { session: { id: receipt.session_id, confirmation_operation: null } },
        status: 200,
        success: true as const,
      })),
    }

    const outcome = await reconcilePendingConfirmationRequest(pending, 'customer-token', transport as never)

    withPillarContext(PILLAR, () => {
      expect(outcome).toEqual({ kind: 'receipt', receipt })
      expect(confirm).toHaveBeenCalledWith(
        receipt.session_id,
        pending.confirmInput,
        'customer-token',
        pending.idempotencyKey,
      )
    })
  })

  it('never replays when the durable operation already exists', async () => {
    const pending = await getOrCreatePendingConfirmation(
      'customer-a',
      receipt.session_id,
      { confirmation_kind: 'rfq_request', matching_mode: 'prompt_if_saved' },
    )
    const confirm = jest.fn()
    const outcome = await reconcilePendingConfirmationRequest(pending, undefined, {
      confirm,
      getOperation: jest.fn(async () => ({ data: { operation: receipt }, status: 200, success: true as const })),
      getSession: jest.fn(),
    } as never)

    withPillarContext(PILLAR, () => {
      expect(outcome).toEqual({ kind: 'receipt', receipt })
      expect(confirm).not.toHaveBeenCalled()
    })
  })

  it('recovers the owned legacy session job without replaying confirmation when no operation receipt exists', async () => {
    const pending = await getOrCreatePendingConfirmation('customer-a', receipt.session_id, { confirmation_kind: 'rfq_request' })
    const transport = {
      confirm: jest.fn(async () => ({ success: false as const, status: 409, code: 'ALREADY_CONFIRMED', error: '' })),
      getOperation: jest.fn(async () => ({ success: false as const, status: 404, code: 'NOT_FOUND', error: '' })),
      getSession: jest.fn(async () => ({
        success: true as const, status: 200,
        data: { session: { id: receipt.session_id, confirmation_operation: null, job_id: receipt.job_id, status: 'confirmed' } },
      })),
    }
    const outcome = await reconcilePendingConfirmationRequest(pending, 'customer-token', transport as never)
    expect(outcome).toEqual({ kind: 'job', jobId: receipt.job_id })
    expect(transport.confirm).not.toHaveBeenCalled()
  })

  it('does not treat a job linked to an unconfirmed session as Customer confirmation', async () => {
    const pending = await getOrCreatePendingConfirmation('customer-a', receipt.session_id, { confirmation_kind: 'rfq_request' })
    const transport = {
      confirm: jest.fn(async () => ({ success: false as const, status: 409, code: 'ALREADY_CONFIRMED', error: '' })),
      getOperation: jest.fn(async () => ({ success: false as const, status: 404, code: 'NOT_FOUND', error: '' })),
      getSession: jest.fn(async () => ({
        success: true as const, status: 200,
        data: { session: { id: receipt.session_id, confirmation_operation: null, job_id: receipt.job_id, status: 'estimate_ready' } },
      })),
    }
    const outcome = await reconcilePendingConfirmationRequest(pending, 'customer-token', transport as never)
    expect(outcome.kind).toBe('pending')
    expect(transport.confirm).toHaveBeenCalledWith(receipt.session_id, pending.confirmInput, 'customer-token', pending.idempotencyKey)
  })

  it.each(['invalid-job-id', '66666666-6666-4666-8666-666666666666'])('refuses an invalid or contradictory legacy job identity (%s)', async (jobId) => {
    const pending = await getOrCreatePendingConfirmation('customer-a', receipt.session_id, { confirmation_kind: 'rfq_request' })
    const transport = {
      confirm: jest.fn(),
      getOperation: jest.fn(async () => ({ success: false as const, status: 404, code: 'NOT_FOUND', error: '' })),
      getSession: jest.fn(async () => ({
        success: true as const, status: 200,
        data: { session: { id: receipt.session_id, confirmation_operation: null, job_id: jobId, status: 'confirmed' } },
      })),
    }
    const outcome = await reconcilePendingConfirmationRequest({ ...pending, operation: receipt }, 'customer-token', transport as never)
    expect(outcome.kind).toBe('pending')
    expect(transport.confirm).not.toHaveBeenCalled()
  })

  it.each([401, 403])('retains the unknown confirmation when session recovery is refused by auth (%s)', async (status) => {
    const pending = await getOrCreatePendingConfirmation('customer-a', receipt.session_id, { confirmation_kind: 'rfq_request' })
    const transport = {
      confirm: jest.fn(),
      getOperation: jest.fn(async () => ({ success: false as const, status: 404, code: 'NOT_FOUND', error: '' })),
      getSession: jest.fn(async () => ({ success: false as const, status, code: 'AUTH_REQUIRED', error: '' })),
    }
    const outcome = await reconcilePendingConfirmationRequest(pending, 'expired-token', transport)
    expect(outcome.kind).toBe('pending')
    expect(transport.confirm).not.toHaveBeenCalled()
    expect(await readPendingConfirmation('customer-a', receipt.session_id)).toEqual(pending)
  })

  it.each([
    { session_id: '44444444-4444-4444-8444-444444444444' },
    { operation_id: '55555555-5555-4555-8555-555555555555' },
    { job_id: '66666666-6666-4666-8666-666666666666' },
    { state: 'invented-state' },
  ])('rejects a contradictory operation receipt without replaying or overwriting consent (%j)', async (change) => {
    const pending = await getOrCreatePendingConfirmation('customer-a', receipt.session_id, { confirmation_kind: 'rfq_request' })
    const known = { ...pending, operation: receipt }
    await writePendingConfirmation(known)
    const transport = {
      confirm: jest.fn(), getSession: jest.fn(),
      getOperation: jest.fn(async () => ({ success: true as const, status: 200, data: { operation: { ...receipt, ...change } } })),
    }
    const outcome = await reconcilePendingConfirmationRequest(known, 'customer-token', transport as never)
    expect(outcome.kind).toBe('pending')
    expect(transport.confirm).not.toHaveBeenCalled()
    expect(transport.getSession).not.toHaveBeenCalled()
    expect(await readPendingConfirmation('customer-a', receipt.session_id)).toEqual(known)
  })

  it('keeps an unknown timeout pending and clears only the targeted owner record explicitly', async () => {
    const pending = await getOrCreatePendingConfirmation(
      'customer-a',
      receipt.session_id,
      { confirmation_kind: 'rfq_request', matching_mode: 'prompt_if_saved' },
    )
    const outcome = await reconcilePendingConfirmationRequest(pending, undefined, {
      confirm: jest.fn(),
      getOperation: jest.fn(async () => ({
        code: 'TIMEOUT', error: 'timeout', status: 0, success: false as const,
      })),
      getSession: jest.fn(),
    } as never)

    withPillarContext(PILLAR, () => {
      expect(outcome.kind).toBe('pending')
    })
    expect(await readPendingConfirmation('customer-a', receipt.session_id)).not.toBeNull()
    await clearPendingConfirmation('customer-a', receipt.session_id)
    expect(await readPendingConfirmation('customer-a', receipt.session_id)).toBeNull()
  })
})
