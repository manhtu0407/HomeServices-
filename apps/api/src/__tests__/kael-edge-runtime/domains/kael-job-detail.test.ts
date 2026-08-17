import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('job-detail', () => {
  installEdgeRuntimeTestHooks()

  it('returns broadcast_state without mutating stale broadcasts on a read', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          service_type: 'plumbing',
          description: 'Leak under sink',
          problem_chips: ['Leak'],
          photo_urls: [],
          address_district: 'q7',
          customer_id: 'customer-1',
          created_at: '2026-05-17T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [{ id: 'broadcast-1', expires_at: '2026-01-01T00:00:00.000Z' }],
        error: null,
      },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-1')).resolves.toMatchObject({
      job: { id: 'job-1', status: 'broadcasting' },
      broadcast_state: { active_count: 0, seconds_remaining: 0 },
    })

    expect(client.calls.some((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it('returns the matched worker real private avatar as a signed Customer-safe URL', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-avatar-1',
          status: 'worker_matched',
          service_type: 'electrical',
          description: 'Outlet replacement',
          problem_chips: ['Outlet'],
          photo_urls: [],
          address_district: 'q1',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          created_at: '2026-07-13T10:00:00.000Z',
        },
        error: null,
      },
      {
        data: {
          avatar_url: 'supabase://worker-avatars/worker-1/avatar.webp',
          full_name: 'Anh Minh',
        },
        error: null,
      },
      {
        data: { legal_name: 'Nguyễn Văn Minh', rating: 4.9, total_jobs: 12 },
        error: null,
      },
    ])
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://storage.example.test/signed/avatar.webp' },
      error: null,
    }))
    Object.assign(client, {
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-avatar-1')).resolves.toMatchObject({
      worker: {
        avatar_url: 'https://storage.example.test/signed/avatar.webp',
        full_name: 'Anh Minh',
        id: 'worker-1',
        rating: 4.9,
        total_jobs: 12,
      },
    })
    expect(createSignedUrl).toHaveBeenCalledWith('worker-1/avatar.webp', 3600)
  })

  it('returns assigned-worker identity and persisted payment details on job refresh', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          display_code: 'NS-2026-000123',
          status: 'worker_matched',
          service_type: 'plumbing',
          description: 'Leak under sink',
          problem_chips: ['Leak'],
          photo_urls: [],
          address_district: 'q7',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          final_price: 540000,
          payment_status: 'vietqr_ready',
          payment_provider: 'sepay_vietqr',
          payment_code: 'PAY-123',
          payment_transfer_content: 'NESTSCOUT PAY-123',
          payment_qr_image_url: 'https://qr.example.test/PAY-123.png',
          payment_expires_at: '2026-07-15T01:10:00.000Z',
          payment_received_at: null,
          payment_amount_received: null,
          gross_amount: 540000,
          platform_fee: 54000,
          worker_net: 486000,
          created_at: '2026-07-15T00:00:00.000Z',
        },
        error: null,
      },
      { data: { full_name: 'Thợ Minh', avatar_url: 'https://cdn.example.test/minh.jpg' }, error: null },
      { data: { legal_name: 'Nguyễn Văn Minh', rating: 4.8, total_jobs: 37 }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({
      sepayVietQr: { enabled: true },
    }).getJob(ctx, 'job-1')).resolves.toMatchObject({
      job: {
        id: 'job-1',
        display_code: 'NS-2026-000123',
        payment_status: 'vietqr_ready',
        payment_provider: 'sepay_vietqr',
        payment_code: 'PAY-123',
        payment_transfer_content: 'NESTSCOUT PAY-123',
        payment_qr_image_url: 'https://qr.example.test/PAY-123.png',
        payment_expires_at: '2026-07-15T01:10:00.000Z',
        payment_received_at: null,
        payment_rail_available: true,
        payment_amount_received: null,
        gross_amount: 540000,
        platform_fee: 54000,
        worker_net: 486000,
      },
      worker: {
        id: 'worker-1',
        full_name: 'Thợ Minh',
        avatar_url: 'https://cdn.example.test/minh.jpg',
        rating: 4.8,
        total_jobs: 37,
      },
    })

    expect(client.calls[0].operations[0]).toEqual([
      'select',
      expect.stringContaining('display_code'),
    ])
    expect(client.calls[0].operations[0]).toEqual([
      'select',
      expect.stringContaining('payment_qr_image_url'),
    ])
    expect(client.calls[1]).toMatchObject({
      table: 'profiles',
      operations: expect.arrayContaining([
        ['select', 'full_name, avatar_url'],
        ['eq', 'id', 'worker-1'],
        ['maybeSingle'],
      ]),
    })
    expect(client.calls[2]).toMatchObject({
      table: 'worker_profiles',
      operations: expect.arrayContaining([
        ['select', 'legal_name, rating, total_jobs'],
        ['eq', 'id', 'worker-1'],
        ['maybeSingle'],
      ]),
    })
  })

  it('reads the assigned worker projection through the privileged client after job ownership passes', async () => {
    const userClient = makeSequenceClient([{
      data: {
        address_district: 'q7',
        created_at: '2026-08-15T13:30:00.000Z',
        customer_id: 'customer-1',
        description: 'Replace a damaged outlet',
        id: 'job-private-worker-1',
        photo_urls: [],
        problem_chips: ['Outlet'],
        service_type: 'electrical',
        status: 'worker_matched',
        worker_id: 'worker-1',
      },
      error: null,
    }])
    const privilegedClient = makeSequenceClient([
      { data: { avatar_url: null, full_name: 'Thợ Minh' }, error: null },
      { data: { legal_name: 'Nguyễn Văn Minh', rating: 4.8, total_jobs: 37 }, error: null },
    ])
    const ctx: MobileApiContext = {
      privilegedSupabase: privilegedClient,
      role: 'customer',
      success: true,
      supabase: userClient,
      user: { id: 'customer-1' },
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-private-worker-1')).resolves.toMatchObject({
      worker: {
        full_name: 'Thợ Minh',
        id: 'worker-1',
        rating: 4.8,
        total_jobs: 37,
      },
    })
    expect(userClient.calls.some((call) => (
      call.table === 'profiles' || call.table === 'worker_profiles'
    ))).toBe(false)
    expect(privilegedClient.calls.map((call) => call.table)).toEqual([
      'profiles',
      'worker_profiles',
    ])
  })

  it('projects the bilateral worker earning before payment without using a current tier', async () => {
    const client = makeSequenceClient([
      {
        data: {
          address_district: 'q7',
          apartment_access_profile: {},
          apartment_access_state: {},
          created_at: '2026-08-15T00:00:00.000Z',
          description: 'Replace a damaged outlet',
          final_price: 400_000,
          id: 'job-worker-price-1',
          matched_at: '2026-08-15T00:05:00.000Z',
          photo_urls: [],
          problem_chips: ['Outlet'],
          service_type: 'electrical',
          status: 'completed_by_worker',
          worker_commission_level: 2,
          worker_commission_rate_bps: 1000,
          worker_id: 'worker-1',
          worker_net: null,
        },
        error: null,
      },
      { data: { full_name: 'Thợ Minh', avatar_url: null }, error: null },
      { data: { legal_name: 'Nguyễn Văn Minh', rating: 4.8, total_jobs: 37 }, error: null },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-worker-price-1')).resolves.toMatchObject({
      job: {
        estimated_worker_net: 360_000,
        final_price: 400_000,
        worker_net: null,
      },
    })
    expect(client.calls[0]?.operations).toContainEqual([
      'select',
      expect.stringContaining('worker_commission_rate_bps'),
    ])
  })

  it('returns signed Case Work images to the owning Customer without exposing raw media refs', async () => {
    const customerId = '11111111-1111-4111-8111-111111111111'
    const imagePath = `${customerId}/kael-chat/model_vision/evidence.png`
    const imageRef = `supabase://kael-chat-media/${imagePath}`
    const privateVideoRef = `supabase://kael-chat-media/${customerId}/kael-chat/private_video_original/original.mp4`
    const client = makeSequenceClient([{
      data: {
        id: 'job-case-work-image-1',
        status: 'completed_by_worker',
        service_type: 'plumbing',
        description: 'Leak under sink',
        problem_chips: ['Leak'],
        photo_urls: [imageRef, privateVideoRef],
        address_district: 'q7',
        customer_id: customerId,
        created_at: '2026-07-27T00:00:00.000Z',
      },
      error: null,
    }])
    const createSignedUrl = vi.fn(async (path: string) => ({
      data: {
        signedUrl: `https://storage.example.test/storage/v1/object/sign/kael-chat-media/${path}?token=signed`,
      },
      error: null,
    }))
    Object.assign(client, {
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: customerId },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-case-work-image-1')).resolves.toMatchObject({
      job: {
        photo_urls: [
          `https://storage.example.test/storage/v1/object/sign/kael-chat-media/${imagePath}?token=signed`,
        ],
        customer_evidence_photo_urls: [
          `https://storage.example.test/storage/v1/object/sign/kael-chat-media/${imagePath}?token=signed`,
        ],
      },
    })
    expect(createSignedUrl).toHaveBeenCalledWith(
      imagePath,
      15 * 60,
      expect.objectContaining({ transform: expect.any(Object) }),
    )
  })

  it('signs owner-authorized Case Work evidence through the privileged storage client', async () => {
    const customerId = '11111111-1111-4111-8111-111111111111'
    const imagePath = `${customerId}/kael-chat/model_vision/evidence.png`
    const imageRef = `supabase://kael-chat-media/${imagePath}`
    const userClient = makeSequenceClient([{
      data: {
        address_district: 'q7',
        created_at: '2026-07-27T00:00:00.000Z',
        customer_id: customerId,
        description: 'Leak under sink',
        id: 'job-privileged-image-1',
        photo_urls: [imageRef],
        problem_chips: ['Leak'],
        service_type: 'plumbing',
        status: 'inspecting',
      },
      error: null,
    }])
    const privilegedClient = makeSequenceClient([{ data: null, error: null }])
    const userCreateSignedUrl = vi.fn(async () => ({ data: null, error: { code: '403' } }))
    const privilegedCreateSignedUrl = vi.fn(async () => ({
      data: { signedUrl: `https://storage.example.test/signed/${imagePath}` },
      error: null,
    }))
    Object.assign(userClient, {
      storage: { from: vi.fn(() => ({ createSignedUrl: userCreateSignedUrl })) },
    })
    Object.assign(privilegedClient, {
      storage: { from: vi.fn(() => ({ createSignedUrl: privilegedCreateSignedUrl })) },
    })
    const ctx: MobileApiContext = {
      privilegedSupabase: privilegedClient,
      role: 'customer',
      success: true,
      supabase: userClient,
      user: { id: customerId },
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-privileged-image-1')).resolves.toMatchObject({
      job: {
        photo_urls: [`https://storage.example.test/signed/${imagePath}`],
      },
    })
    expect(userCreateSignedUrl).not.toHaveBeenCalled()
    expect(privilegedCreateSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('fails closed when a persisted payment status violates the response contract', async () => {
    const client = makeSequenceClient([{
      data: {
        id: 'job-1',
        status: 'worker_matched',
        service_type: 'plumbing',
        description: 'Leak under sink',
        problem_chips: ['Leak'],
        photo_urls: [],
        address_district: 'q7',
        customer_id: 'customer-1',
        worker_id: null,
        payment_status: 'provider_unknown_state',
        created_at: '2026-07-15T00:00:00.000Z',
      },
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-1')).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('returns the active scope-change request on pending job detail', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'scope_change_pending',
          service_type: 'electrical',
          description: 'Breaker issue',
          problem_chips: ['Breaker'],
          photo_urls: [],
          address_district: 'q1',
          customer_id: 'customer-1',
          created_at: '2026-05-17T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [{
          id: 'scope-1',
          status: 'waiting_customer_decision',
          requested_description: 'Replace damaged breaker',
          reason: 'Breaker is burnt',
          price_min: 250000,
          price_max: 250000,
          kael_computed_min: 250000,
          kael_computed_max: 350000,
          kael_review: {
            problem_summary: 'Replace damaged breaker',
            advisory: 'Confirm before continuing',
            complexity_assessment: 'medium',
            confidence: 0.8,
            fallback_used: false,
          },
          kael_progress: {
            current_stage: 'scope_estimating',
            status: 'completed',
            progress: 1,
            failure_reason: null,
            updated_at: '2026-06-04T13:58:30.716Z',
          },
          evidence_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
          request_timing: 'pre_arrival',
          resume_job_status: 'worker_matched',
          created_at: '2026-05-17T00:01:00.000Z',
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-1')).resolves.toMatchObject({
      job: { id: 'job-1', status: 'scope_change_pending' },
      current_scope_change: {
        id: 'scope-1',
        requested_description: 'Replace damaged breaker',
        price_min: 250000,
        kael_computed_max: 350000,
        kael_progress: expect.objectContaining({
          current_stage: 'scope_estimating',
          status: 'completed',
        }),
        evidence_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
        request_timing: 'pre_arrival',
        resume_job_status: 'worker_matched',
      },
    })

    const scopeCall = client.calls.find((call) => call.table === 'scope_change_requests')
    expect(scopeCall?.operations).toContainEqual(['eq', 'job_id', 'job-1'])
    expect(scopeCall?.operations).toContainEqual(['eq', 'status', 'waiting_customer_decision'])
  })

  it('projects the active Kael incident while the worker and Kael are validating a scope change', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-incident-1',
          status: 'inspecting',
          service_type: 'handyman',
          description: 'Căn chỉnh hai bản lề tủ bếp',
          problem_chips: ['Bản lề tủ bị xệ'],
          photo_urls: [],
          address_district: 'q1',
          customer_id: 'customer-1',
          created_at: '2026-08-13T02:00:00.000Z',
        },
        error: null,
      },
      {
        data: {
          id: 'incident-1',
          status: 'awaiting_worker',
          evidence_status: 'needs_more',
          reported_description: 'Thay đúng hai bản lề kim loại bị nứt',
          reported_reason: 'Hai bản lề đã nứt, gỗ và cánh tủ không hư hỏng.',
          evidence_photo_urls: ['supabase://job-media/job-incident-1/scope_change_evidence/hinge.jpg'],
          last_summary: 'Kael đã nhận mô tả và đang đối chiếu ảnh hiện trường.',
          last_question: 'Ảnh đã cho thấy đủ cả hai bản lề chưa?',
          last_next_actor: 'worker',
          created_at: '2026-08-13T02:10:00.000Z',
          updated_at: '2026-08-13T02:11:00.000Z',
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-incident-1')).resolves.toMatchObject({
      job: { id: 'job-incident-1', status: 'inspecting' },
      current_job_incident: {
        id: 'incident-1',
        status: 'awaiting_worker',
        evidence_status: 'needs_more',
        reported_description: 'Thay đúng hai bản lề kim loại bị nứt',
        reported_reason: 'Hai bản lề đã nứt, gỗ và cánh tủ không hư hỏng.',
        evidence_count: 1,
        last_next_actor: 'worker',
      },
    })

    const incidentCall = client.calls.find((call) => call.table === 'kael_job_incidents')
    expect(incidentCall?.operations).toContainEqual(['eq', 'job_id', 'job-incident-1'])
    expect(incidentCall?.operations).toContainEqual([
      'in',
      'status',
      ['open', 'awaiting_worker', 'awaiting_customer', 'ready_for_scope_proposal'],
    ])
  })
})
