import { describe, expect, it, vi } from 'vitest'

import {
  activateAdminOperator,
  getAdminActivation,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/admin-activation'

describe('admin operator activation status', () => {
  it('reads the service-owned provisioning state through the bounded activation RPC', async () => {
    const privilegedRpc = vi.fn(async () => ({
      data: [{
        email: 'operator@example.com',
        full_name: 'QA Operator',
        status: 'pending_password_change',
        capabilities: ['finance.read'],
      }],
      error: null,
    }))
    const actorRpc = vi.fn(() => {
      throw new Error('activation receipt must stay behind the Edge service boundary')
    })

    const result = await getAdminActivation({
      role: 'customer',
      user: { id: '11111111-1111-4111-8111-111111111111' },
      supabase: { rpc: actorRpc },
      privilegedSupabase: { rpc: privilegedRpc },
      userSupabase: { rpc: actorRpc },
    } as never)

    expect(privilegedRpc).toHaveBeenCalledWith('get_admin_operator_activation_status', {
      p_actor_id: '11111111-1111-4111-8111-111111111111',
    })
    expect(actorRpc).not.toHaveBeenCalled()
    expect(result).toEqual({
      required: true,
      status: 'pending_password_change',
      email_masked: 'op***@example.com',
      full_name: 'QA Operator',
      capability_count: 1,
    })
  })

  it('verifies the initial password before atomically activating the exact account', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111'
    const privilegedRpc = vi.fn()
      .mockResolvedValueOnce({
        data: [{
          email: 'operator@example.com',
          status: 'pending_password_change',
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          ok: true,
          capabilities_out: ['finance.read'],
          activated_at: '2026-08-14T04:15:00.000Z',
        }],
        error: null,
      })
    const actorRpc = vi.fn(() => {
      throw new Error('activation RPC must stay behind the Edge service boundary')
    })
    const signInWithPassword = vi.fn(async () => ({
      data: { user: { id: actorId } },
      error: null,
    }))
    const updateUser = vi.fn(async () => ({ error: null }))

    const result = await activateAdminOperator({
      role: 'customer',
      user: { id: actorId },
      supabase: { rpc: actorRpc, auth: { signInWithPassword, updateUser } },
      privilegedSupabase: { rpc: privilegedRpc },
      userSupabase: { rpc: actorRpc, auth: { signInWithPassword, updateUser } },
    } as never, {
      current_password: 'initial-password',
      new_password: 'replacement-password',
    })

    expect(privilegedRpc).toHaveBeenNthCalledWith(1, 'get_admin_operator_activation_status', {
      p_actor_id: actorId,
    })
    expect(privilegedRpc).toHaveBeenNthCalledWith(2, 'activate_admin_operator_atomic', {
      p_actor_id: actorId,
    })
    expect(actorRpc).not.toHaveBeenCalled()
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'operator@example.com',
      password: 'initial-password',
    })
    expect(updateUser).toHaveBeenCalledWith({
      password: 'replacement-password',
      user_metadata: { must_change_password: false },
    })
    expect(result).toMatchObject({ ok: true, role: 'admin_operator' })
  })
})
