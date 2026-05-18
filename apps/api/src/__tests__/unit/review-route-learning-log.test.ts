import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  runLearningHook: vi.fn(),
}))

vi.mock('@/lib/auth/api-auth', () => ({
  authenticateRequest: mocks.authenticateRequest,
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: vi.fn(<T>(promise: PromiseLike<T>) => promise),
}))

vi.mock('@/lib/jobs/event-log', () => ({
  logJobEvent: vi.fn(),
}))

vi.mock('@/lib/learning/hook', () => ({
  runLearningHook: mocks.runLearningHook,
}))

describe('review route learning hook logging', () => {
  beforeEach(() => {
    mocks.authenticateRequest.mockReset()
    mocks.runLearningHook.mockReset()
  })

  it('does not log raw learning hook error messages', async () => {
    const sensitive = 'sb_secret_sensitive_value'
    mocks.authenticateRequest.mockResolvedValue({
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: {
        rpc: vi.fn(async () => ({
          data: [{
            ok: true,
            review_id: 'review-1',
            job_status: 'reviewed',
          }],
          error: null,
        })),
      },
    })
    mocks.runLearningHook.mockRejectedValue(new Error(`learning failed with ${sensitive}`))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { POST } = await import('@/app/api/jobs/[id]/review/route')
    const jobId = '22222222-2222-4222-8222-222222222222'
    const response = await POST(
      new Request(`https://example.test/api/jobs/${jobId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: 5, tags: [] }),
      }),
      { params: Promise.resolve({ id: jobId }) },
    )
    const logged = JSON.stringify(warnSpy.mock.calls)
    warnSpy.mockRestore()

    expect(response.status).toBe(201)
    expect(logged).not.toContain(sensitive)
  })
})
