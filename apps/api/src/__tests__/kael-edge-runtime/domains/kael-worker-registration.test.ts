import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('worker-registration', () => {
  installEdgeRuntimeTestHooks()

  it('finalizes worker registration through one atomic RPC', async () => {
    const client = makeSequenceClient([{
      data: [{
        ok: true,
        error_code: null,
        worker_id_out: 'worker-1',
        verification_status_out: 'submitted',
        submitted_at_ts: '2026-07-14T10:50:00.000Z',
        idempotent_out: false,
      }],
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).registerWorker(ctx, {
      legal_name: 'Nguyen Van A',
      date_of_birth: '1990-01-15',
      gender: 'male',
      service_types: ['electrical'],
      years_experience: 5,
      districts: ['q1'],
      cccd_front_url: 'supabase://worker-verification/worker-1/cccd-front/front.jpg',
      cccd_back_url: 'supabase://worker-verification/worker-1/cccd-back/back.jpg',
      selfie_url: 'supabase://worker-verification/worker-1/selfie/selfie.jpg',
      bank_account: '0123456789',
      bank_name: 'Vietcombank',
    })).resolves.toEqual({
      worker_id: 'worker-1',
      verification_status: 'submitted',
      submitted_at: '2026-07-14T10:50:00.000Z',
    })

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]).toMatchObject({
      table: 'rpc:submit_worker_registration_atomic',
      operations: [[
        'rpc',
        'submit_worker_registration_atomic',
        expect.objectContaining({
          p_actor_id: 'worker-1',
          p_worker_id: 'worker-1',
          p_districts: ['q1'],
          p_home_lat: null,
          p_home_lng: null,
          p_service_radius_km: 8,
          p_problem_specializations: [],
        }),
      ]],
    })
  })

  it('rejects worker verification references owned by another account before the registration RPC', async () => {
    const client = makeSequenceClient([])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).registerWorker(ctx, {
      legal_name: 'Nguyen Van A',
      date_of_birth: '1990-01-15',
      gender: 'male',
      service_types: ['electrical'],
      years_experience: 5,
      districts: ['q1'],
      cccd_front_url: 'supabase://worker-verification/worker-2/cccd-front/front.jpg',
      cccd_back_url: 'supabase://worker-verification/worker-1/cccd-back/back.jpg',
      selfie_url: 'supabase://worker-verification/worker-1/selfie/selfie.jpg',
      bank_account: '0123456789',
      bank_name: 'Vietcombank',
    })).rejects.toMatchObject({ code: 'INVALID_MEDIA_REF', status: 400 })

    expect(client.calls).toHaveLength(0)
  })

  it('rejects unknown worker districts before the registration RPC', async () => {
    const client = makeSequenceClient([])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).registerWorker(ctx, {
      legal_name: 'Nguyen Van A',
      date_of_birth: '1990-01-15',
      gender: 'male',
      service_types: ['electrical'],
      years_experience: 5,
      districts: ['Ha Noi'],
      cccd_front_url: 'supabase://worker-verification/worker-1/cccd-front/front.jpg',
      cccd_back_url: 'supabase://worker-verification/worker-1/cccd-back/back.jpg',
      selfie_url: 'supabase://worker-verification/worker-1/selfie/selfie.jpg',
      bank_account: '0123456789',
      bank_name: 'Vietcombank',
    })).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })

    expect(client.calls).toHaveLength(0)
  })

  it('maps an atomic suspended/finalized rejection without a direct worker-profile write', async () => {
    const client = makeSequenceClient([{
      data: [{
        ok: false,
        error_code: 'ALREADY_FINALIZED',
        worker_id_out: 'worker-1',
        verification_status_out: 'under_review',
        submitted_at_ts: '2026-07-14T10:50:00.000Z',
        idempotent_out: false,
      }],
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).registerWorker(ctx, {
      legal_name: 'Nguyen Van A',
      date_of_birth: '1990-01-15',
      gender: 'male',
      service_types: ['electrical'],
      years_experience: 5,
      districts: ['q1'],
      cccd_front_url: 'supabase://worker-verification/worker-1/cccd-front/front.jpg',
      cccd_back_url: 'supabase://worker-verification/worker-1/cccd-back/back.jpg',
      selfie_url: 'supabase://worker-verification/worker-1/selfie/selfie.jpg',
      bank_account: '0123456789',
      bank_name: 'Vietcombank',
    })).rejects.toMatchObject({
      code: 'ALREADY_FINALIZED',
      status: 409,
    })

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]?.table).toBe('rpc:submit_worker_registration_atomic')
  })
})
