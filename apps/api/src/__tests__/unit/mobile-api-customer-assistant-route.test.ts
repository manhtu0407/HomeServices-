import { describe, expect, it, vi } from 'vitest'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/router'
import { matchRoute } from '../../../../../supabase/functions/mobile-api/_shared/router/routes'

const customerAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '11111111-1111-4111-8111-111111111111' },
  role: 'customer',
  supabase: {},
}

describe('mobile-api customer Kael assistant route', () => {
  it('routes a job-scoped Case Work question through the authenticated Edge service', async () => {
    const answerKaelAssistant = vi.fn(async () => ({
      answer: 'Kael đang đọc đúng hồ sơ công việc.',
      safety_notes: [],
      citations: ['NestScout platform scope'],
      suggested_actions: ['check_job'] as const,
      boundary: 'answered' as const,
      fallback_used: false,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: { answerKaelAssistant } as unknown as MobileApiServices,
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: '22222222-2222-4222-8222-222222222222',
        language: 'vi',
        message: 'Báo giá này chưa tính phần vật tư đúng không?',
        surface: 'customer_case',
      }),
    }))

    expect(response.status).toBe(200)
    expect(answerKaelAssistant).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'customer' }),
      expect.objectContaining({
        job_id: '22222222-2222-4222-8222-222222222222',
        surface: 'customer_case',
      }),
    )
  })

  it('declares the assistant route customer-only', () => {
    expect(matchRoute(new Request('https://example.test/mobile-api/kael/assistant', {
      method: 'POST',
    }))).toMatchObject({
      kind: 'kael.assistant',
      roles: ['customer'],
    })
  })

  it('rejects an unscoped customer_case request before the service runs', async () => {
    const answerKaelAssistant = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => customerAuth),
      services: { answerKaelAssistant } as unknown as MobileApiServices,
    })

    const response = await handler(new Request('https://example.test/mobile-api/kael/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'vi',
        message: 'Xem lại báo giá giúp tôi.',
        surface: 'customer_case',
      }),
    }))

    expect(response.status).toBe(400)
    expect(answerKaelAssistant).not.toHaveBeenCalled()
  })
})
