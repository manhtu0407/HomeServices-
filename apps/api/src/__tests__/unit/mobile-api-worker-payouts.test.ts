import { describe, expect, it, vi } from 'vitest'
import {
  ADMIN_CAPABILITIES,
  workerWithdrawalRequestCreateSchema,
} from '@nestscout/shared'
import { ADMIN_CONTROL_CAPABILITIES } from '../../../../../supabase/functions/mobile-api/_shared/router/admin-control-dtos'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/router'
import { matchRoute } from '../../../../../supabase/functions/mobile-api/_shared/router/routes'

const workerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '11111111-1111-4111-8111-111111111111' },
  role: 'worker',
  supabase: {},
}

describe('mobile-api worker manual payouts', () => {
  it('keeps the withdrawal capability vocabulary aligned across shared and Edge boundaries', () => {
    expect(ADMIN_CAPABILITIES).toContain('payouts.read')
    expect(ADMIN_CAPABILITIES).toContain('payouts.process')
    expect(ADMIN_CONTROL_CAPABILITIES).toEqual(ADMIN_CAPABILITIES)
  })

  it('validates an idempotent worker withdrawal request before it reaches the Edge service', () => {
    expect(workerWithdrawalRequestCreateSchema.safeParse({
      amount_vnd: 120_000,
      client_request_id: '11111111-1111-4111-8111-111111111111',
    }).success).toBe(true)
    expect(workerWithdrawalRequestCreateSchema.safeParse({
      amount_vnd: 0,
      client_request_id: 'not-a-uuid',
    }).success).toBe(false)
  })

  it('routes worker requests and admin processing only through their server-owned endpoints', () => {
    expect(matchRoute(new Request('https://edge.test/workers/me/payout-method'))).toMatchObject({
      kind: 'workers.payoutMethod.get',
      roles: ['worker'],
    })
    expect(matchRoute(new Request('https://edge.test/workers/me/withdrawal-requests', {
      method: 'POST',
    }))).toMatchObject({
      kind: 'workers.withdrawalRequests.create',
      roles: ['worker'],
      successStatus: 201,
    })
    expect(matchRoute(new Request('https://edge.test/admin/withdrawal-requests'))).toMatchObject({
      kind: 'admin.withdrawalRequests.list',
      roles: ['admin', 'admin_operator'],
    })
    expect(matchRoute(new Request('https://edge.test/admin/withdrawal-requests/request-1/resolve', {
      method: 'POST',
    }))).toMatchObject({
      kind: 'admin.withdrawalRequests.resolve',
      roles: ['admin', 'admin_operator'],
    })
  })

  it('validates and dispatches a worker withdrawal request only after worker authentication', async () => {
    const createWorkerWithdrawalRequest = vi.fn(async () => ({
      request: {
        amount_vnd: 120_000,
        available_balance_before_vnd: 420_000,
        bank_account_masked: '**** 6789',
        bank_key: 'vietcombank',
        bank_name: 'Vietcombank',
        id: 'request-1',
        processing_at: null,
        processed_at: null,
        requested_at: '2026-08-08T00:00:00.000Z',
        resolution_reason: null,
        status: 'pending',
        transfer_reference: null,
        updated_at: '2026-08-08T00:00:00.000Z',
      },
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: { createWorkerWithdrawalRequest } as unknown as MobileApiServices,
    })
    const request = new Request('https://edge.test/workers/me/withdrawal-requests', {
      body: JSON.stringify({
        amount_vnd: 120_000,
        client_request_id: '11111111-1111-4111-8111-111111111111',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })

    const response = await handler(request)

    expect(response.status).toBe(201)
    expect(createWorkerWithdrawalRequest).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'worker', user: workerAuth.user }),
      { amount_vnd: 120_000, client_request_id: '11111111-1111-4111-8111-111111111111' },
    )
  })

  it('rejects malformed withdrawal bodies before the payout service is invoked', async () => {
    const createWorkerWithdrawalRequest = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: { createWorkerWithdrawalRequest } as unknown as MobileApiServices,
    })

    const response = await handler(new Request('https://edge.test/workers/me/withdrawal-requests', {
      body: JSON.stringify({ amount_vnd: 0, client_request_id: 'invalid' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(createWorkerWithdrawalRequest).not.toHaveBeenCalled()
  })
})
