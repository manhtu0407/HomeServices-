import { describe, expect, it, vi } from 'vitest'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/router'

const customerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '11111111-1111-4111-8111-111111111111' },
  role: 'customer',
  supabase: {},
}

const workerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '33333333-3333-4333-8333-333333333333' },
  role: 'worker',
  supabase: {},
}

function makeServices(overrides: Partial<MobileApiServices> = {}): MobileApiServices {
  return {
    listServices: vi.fn(async () => ({ services: [] })),
    createJob: vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      status: 'awaiting_customer_confirm' as const,
      estimate: {
        service_type: 'electrical' as const,
        problem_category: 'outlet_or_switch_broken',
        problem_summary: 'Ổ cắm cần kiểm tra',
        complexity: 'medium' as const,
        price_min: 100000,
        price_max: 250000,
        confidence: 0.5,
        advisory: null,
        disclaimer:
          'Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu.',
      },
      fallback_used: false,
    })),
    getJob: vi.fn(),
    confirmSearch: vi.fn(),
    cancelJob: vi.fn(),
    acceptBroadcast: vi.fn(),
    declineBroadcast: vi.fn(),
    updateJobStatus: vi.fn(),
    requestScopeChange: vi.fn(),
    decideScopeChange: vi.fn(),
    confirmCompletion: vi.fn(),
    submitReview: vi.fn(),
    registerWorker: vi.fn(),
    getWorkerProfile: vi.fn(),
    updateWorkerAvailability: vi.fn(),
    listWorkerBroadcasts: vi.fn(),
    listWorkerJobs: vi.fn(),
    getWorkerEarnings: vi.fn(),
    ...overrides,
  }
}

describe('mobile-api Edge router contract', () => {
  it('answers OPTIONS preflight without auth', async () => {
    const authenticate = vi.fn()
    const handler = createMobileApiHandler({ authenticate, services: makeServices() })

    const response = await handler(new Request('https://example.test/functions/v1/mobile-api/services', {
      method: 'OPTIONS',
    }))

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('normalizes Supabase function prefixes before route matching', async () => {
    const listServices = vi.fn(async () => ({ services: [] }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ listServices }),
    })

    const response = await handler(new Request('https://example.test/functions/v1/mobile-api/services'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ services: [] })
    expect(listServices).toHaveBeenCalledOnce()
  })

  it('does not turn malformed encoded path segments into 500s', async () => {
    const getJob = vi.fn()
    const authenticate = vi.fn(async () => customerAuth)
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ getJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/%E0%A4%A'))

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
    expect(authenticate).not.toHaveBeenCalled()
    expect(getJob).not.toHaveBeenCalled()
  })

  it('returns AUTH_MISSING before protected route handlers run', async () => {
    const listServices = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async (): Promise<MobileApiAuthResult> => ({
        success: false,
        status: 401,
        error: 'Vui lòng đăng nhập',
      })),
      services: makeServices({ listServices }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/services'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      code: 'AUTH_MISSING',
      error: 'Vui lòng đăng nhập',
    })
    expect(listServices).not.toHaveBeenCalled()
  })

  it('does not dispatch worker routes when the authenticator rejects the role', async () => {
    const updateJobStatus = vi.fn()
    const authenticate = vi.fn(async (): Promise<MobileApiAuthResult> => ({
      success: false,
      status: 403,
      error: 'forbidden',
    }))
    const handler = createMobileApiHandler({
      authenticate,
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'arrived' }),
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      code: 'AUTH_FORBIDDEN',
      error: 'forbidden',
    })
    expect(authenticate).toHaveBeenCalledWith(expect.any(Request), ['worker'])
    expect(updateJobStatus).not.toHaveBeenCalled()
  })

  it('validates POST /jobs before creating a job', async () => {
    const createJob = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_type: 'painting', description: 'short' }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      code: 'VALIDATION',
      error: 'Dữ liệu không hợp lệ',
    })
    expect(createJob).not.toHaveBeenCalled()
  })

  it('passes validated POST /jobs payload to the backend service', async () => {
    const createJob = vi.fn(async () => ({
      job_id: '22222222-2222-4222-8222-222222222222',
      status: 'awaiting_customer_confirm' as const,
      estimate: {
        service_type: 'plumbing' as const,
        problem_category: 'pipe_leak',
        problem_summary: 'Ống rò rỉ cần kiểm tra',
        complexity: 'medium' as const,
        price_min: 150000,
        price_max: 350000,
        confidence: 0.5,
        advisory: null,
        disclaimer:
          'Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu.',
      },
      fallback_used: true,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type: 'plumbing',
        problem_chips: ['Ống rò rỉ'],
        description: 'Ống nước dưới lavabo bị rò và nhỏ nước liên tục',
        photo_urls: [],
        address_district: 'q7',
      }),
    }))

    expect(response.status).toBe(201)
    expect(createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'customer',
        user: customerAuth.user,
      }),
      expect.objectContaining({
        service_type: 'plumbing',
        address_district: 'q7',
      }),
    )
  })

  it('rejects invalid worker completion price before service mutation', async () => {
    const updateJobStatus = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed_by_worker',
        final_price: -1,
      }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'VALIDATION',
    })
    expect(updateJobStatus).not.toHaveBeenCalled()
  })

  it('rejects invalid worker completion photo URLs before service mutation', async () => {
    const updateJobStatus = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => workerAuth),
      services: makeServices({ updateJobStatus }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs/job-1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed_by_worker',
        final_price: 250000,
        completion_photo_urls: ['not-a-url'],
      }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'VALIDATION',
    })
    expect(updateJobStatus).not.toHaveBeenCalled()
  })

  it('rejects oversized JSON bodies before service mutation', async () => {
    const createJob = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({ createJob }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type: 'plumbing',
        problem_chips: ['leak'],
        description: 'x'.repeat(70_000),
      }),
    }))

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      error: 'Dữ liệu gửi lên quá lớn',
    })
    expect(createJob).not.toHaveBeenCalled()
  })

  it('does not log raw unhandled error messages from Edge services', async () => {
    const sensitive = 'sb_secret_sensitive_value'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: makeServices({
        listServices: vi.fn(async () => {
          throw new Error(`database failed with ${sensitive}`)
        }),
      }),
    })

    const response = await handler(new Request('https://example.test/mobile-api/services'))
    const body = await response.json()
    const logged = JSON.stringify(errorSpy.mock.calls)
    errorSpy.mockRestore()

    expect(response.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain(sensitive)
    expect(logged).not.toContain(sensitive)
  })
})
