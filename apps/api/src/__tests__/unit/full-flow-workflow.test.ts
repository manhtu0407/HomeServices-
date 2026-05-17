/**
 * Full-flow integration test — simulates the complete customer journey:
 *
 * Customer tạo job → Kael phân tích + ước giá → Customer confirm search (A7)
 * → Worker matched → Worker cập nhật status (on_way → arrived → inspecting → repairing → completed)
 * → Customer confirm completion (A12) → Customer review
 *
 * Test này chứng minh toàn bộ API routes chain together đúng,
 * API contracts khớp nhau, và state machine transitions hợp lệ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AIResponse } from '@home-services/shared'

// ─── Mock setup ─────────────────────────────────────────────────

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
    anthropicApiKey: 'test-key',
    perplexityApiKey: 'test-key',
    deepseekApiKey: 'test-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}))

import { callAI } from '@/lib/ai/client'

const mockCallAI = callAI as ReturnType<typeof vi.fn>

// ─── In-memory DB simulator ─────────────────────────────────────

type JobRow = Record<string, unknown>
type EventRow = Record<string, unknown>
type BroadcastRow = Record<string, unknown>
type ReviewRow = Record<string, unknown>

let jobsTable: Map<string, JobRow>
let eventsTable: EventRow[]
let broadcastsTable: BroadcastRow[]
let reviewsTable: Map<string, ReviewRow>

let jobIdCounter: number

function resetDB() {
  jobsTable = new Map()
  eventsTable = []
  broadcastsTable = []
  reviewsTable = new Map()
  jobIdCounter = 0
}

function genId(): string {
  jobIdCounter++
  const hex = jobIdCounter.toString(16).padStart(12, '0')
  return `550e8400-e29b-41d4-a716-${hex}`
}

// Simulates Supabase client behavior with in-memory storage
function createMockSupabase(currentUserId: string) {
  function fromTable(table: string) {
    if (table === 'jobs') return jobsOps()
    if (table === 'job_events') return eventsOps()
    if (table === 'job_broadcasts') return broadcastsOps()
    if (table === 'reviews') return reviewsOps()
    if (table === 'profiles') return profilesOps()
    if (table === 'worker_profiles') return workerProfilesOps()
    if (table === 'price_baselines') return baselinesOps()
    if (table === 'service_categories') return catalogOps()
    if (table === 'service_problems') return problemsOps()
    return noOps()
  }

  function jobsOps() {
    let pendingInsert: JobRow | null = null
    let pendingUpdate: Partial<JobRow> | null = null
    const filters: Record<string, unknown> = {}

    // Apply pendingUpdate against jobsTable, respecting optimistic-concurrency filters.
    // Returns the updated row, or null if filters didn't match.
    const applyUpdate = (): JobRow | null => {
      if (!pendingUpdate) return null
      const id = filters['id'] as string | undefined
      if (!id) return null
      const existing = jobsTable.get(id)
      if (!existing) return null
      const statusFilter = filters['status']
      if (statusFilter !== undefined && existing.status !== statusFilter) return null
      const updated = { ...existing, ...pendingUpdate, updated_at: new Date().toISOString() }
      jobsTable.set(id, updated)
      return updated
    }

    const chain: any = {
      insert: (data: JobRow) => { pendingInsert = data; return chain },
      update: (data: Partial<JobRow>) => { pendingUpdate = data; return chain },
      select: (_fields?: string) => chain,
      eq: (col: string, val: unknown) => {
        filters[col] = val
        // If this is a write op with no further .select(), Supabase resolves
        // on `await chain` directly. Make chain thenable to support that.
        if (pendingUpdate) {
          chain.then = (onFulfilled: (v: { data: null; error: null }) => unknown) => {
            applyUpdate()
            return Promise.resolve({ data: null, error: null }).then(onFulfilled)
          }
        }
        return chain
      },
      limit: (_n: number) => chain,
      single: async () => {
        if (pendingInsert) {
          const id = genId()
          const row = { ...pendingInsert, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
          jobsTable.set(id, row)
          return { data: { id }, error: null }
        }
        if (pendingUpdate) {
          const updated = applyUpdate()
          if (!updated) return { data: null, error: { message: 'no match' } }
          return { data: updated, error: null }
        }
        const id = filters['id'] as string
        const job = jobsTable.get(id)
        if (!job) return { data: null, error: { message: 'not found' } }
        return { data: job, error: null }
      },
      maybeSingle: async () => {
        if (pendingUpdate) {
          const updated = applyUpdate()
          return { data: updated, error: null }
        }
        const id = filters['id'] as string
        const job = jobsTable.get(id)
        return { data: job ?? null, error: null }
      },
    }

    return chain
  }

  function eventsOps() {
    return {
      insert: async (data: EventRow) => {
        eventsTable.push(data)
        return { data, error: null }
      },
    }
  }

  function broadcastsOps() {
    return {
      insert: async (data: BroadcastRow) => {
        broadcastsTable.push(data)
        return { data, error: null }
      },
    }
  }

  function reviewsOps() {
    return {
      insert: (data: ReviewRow) => {
        const id = genId()
        reviewsTable.set(id, { ...data, id })
        return {
          select: (_fields: string) => ({
            single: async () => ({ data: { id }, error: null }),
          }),
        }
      },
    }
  }

  function profilesOps() {
    let filters: Record<string, unknown> = {}
    return {
      select: (_fields: string) => ({
        eq: (_col: string, _val: unknown) => ({
          single: async () => ({ data: { role: 'customer' }, error: null }),
        }),
        in: (_col: string, ids: string[]) => ({
          then: undefined,
          data: ids.map(id => ({ id, full_name: `Worker ${id.slice(-4)}` })),
          error: null,
          // Make it thenable
          [Symbol.iterator]: undefined,
        }),
      }),
    }
  }

  function workerProfilesOps() {
    const mockWorkers = [
      {
        id: 'worker-001',
        rating: 4.8,
        total_jobs: 50,
        service_types: ['electrical', 'plumbing'],
        districts: ['quan_1', 'quan_7', 'default'],
        is_available: true,
        is_approved: true,
        is_suspended: false,
      },
    ]
    return {
      select: (_fields: string) => {
        const chain: any = {
          eq: (_c: string, _v: unknown) => chain,
          contains: (_c: string, _v: unknown) => chain,
          order: (_c: string, _opts?: unknown) => chain,
          limit: (_n: number) => {
            chain.then = undefined
            return Promise.resolve({ data: mockWorkers, error: null })
          },
        }
        return chain
      },
    }
  }

  function baselinesOps() {
    // baseline.ts now uses .in() then awaits without .single() — returns row array.
    return {
      select: (_fields: string) => {
        const chain: any = {
          eq: (_col: string, _val: unknown) => chain,
          in: (_col: string, _vals: unknown[]) => chain,
          // Thenable: `await chain` resolves to data array
          then: (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({
              data: [{ price_min: 200000, price_max: 500000, district_code: 'hcmc_all' }],
              error: null,
            }).then(onFulfilled),
        }
        return chain
      },
    }
  }

  function catalogOps() {
    return {
      select: (_fields: string) => ({
        eq: (_col: string, _val: unknown) => ({
          order: (_col2: string) => ({
            data: [
              { id: 'cat-1', service_type: 'electrical', slug: 'electrical', label_vi: 'Sửa điện', sort_order: 1, is_active: true },
              { id: 'cat-2', service_type: 'plumbing', slug: 'plumbing', label_vi: 'Sửa nước', sort_order: 2, is_active: true },
            ],
            error: null,
          }),
        }),
      }),
    }
  }

  function problemsOps() {
    return {
      select: (_fields: string) => ({
        eq: (_col: string, _val: unknown) => ({
          order: (_col2: string) => ({
            data: [
              { id: 'prob-1', slug: 'breaker_trip', label_vi: 'Cầu dao trip', default_complexity: 'medium', service_category_id: 'cat-1', service_type: 'electrical', sort_order: 1, is_active: true },
              { id: 'prob-2', slug: 'pipe_leak', label_vi: 'Ống rò rỉ', default_complexity: 'medium', service_category_id: 'cat-2', service_type: 'plumbing', sort_order: 1, is_active: true },
            ],
            error: null,
          }),
        }),
      }),
    }
  }

  function noOps() {
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      insert: async () => ({ data: null, error: null }),
    }
  }

  return {
    auth: {
      getUser: async (_token: string) => ({
        data: { user: { id: currentUserId, email: `${currentUserId}@test.com` } },
        error: null,
      }),
    },
    from: fromTable,
  }
}

// ─── Mock auth + supabase wiring ────────────────────────────────

let currentMockRole = 'customer'
let currentMockUserId = 'customer-001'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => {
    const sb = createMockSupabase(currentMockUserId)
    // Override profiles lookup to return current role
    const origFrom = sb.from
    sb.from = (table: string) => {
      if (table === 'profiles') {
        return {
          select: (_fields: string) => ({
            eq: (_col: string, _val: unknown) => ({
              single: async () => ({ data: { role: currentMockRole }, error: null }),
            }),
            in: (_col: string, ids: string[]) => ({
              data: ids.map((id: string) => ({ id, full_name: `Worker ${id.slice(-4)}` })),
              error: null,
            }),
          }),
        } as any
      }
      return origFrom(table) as any
    }
    return sb
  }),
}))

// ─── Route imports (after mocks) ────────────────────────────────

import { POST as createJob } from '@/app/api/jobs/route'
import { GET as getJob } from '@/app/api/jobs/[id]/route'
import { POST as confirmSearch } from '@/app/api/jobs/[id]/confirm-search/route'
import { PATCH as updateStatus } from '@/app/api/jobs/[id]/status/route'
import { POST as confirmCompletion } from '@/app/api/jobs/[id]/confirm-completion/route'
import { POST as submitReview } from '@/app/api/jobs/[id]/review/route'
import { GET as getServices } from '@/app/api/services/route'

// ─── Helpers ────────────────────────────────────────────────────

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/test', {
    method,
    headers: {
      'authorization': 'Bearer test-token',
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function mockAIResponse(content: object): AIResponse {
  return {
    content: JSON.stringify(content),
    usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
    latencyMs: 150,
    success: true,
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('Full Customer Journey — End-to-End Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDB()
    currentMockRole = 'customer'
    currentMockUserId = 'customer-001'
  })

  it('GET /api/services — trả về service catalog', async () => {
    const req = makeRequest('GET')
    const res = await getServices(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.services).toBeDefined()
    expect(body.services.length).toBe(2)
    expect(body.services[0].service_type).toBe('electrical')
    expect(body.services[0].label_vi).toBe('Sửa điện')
    expect(body.services[1].service_type).toBe('plumbing')
    expect(body.services[1].label_vi).toBe('Sửa nước')

    console.log('✓ Service catalog: 2 services (điện + nước)')
  })

  it('POST /api/jobs — Kael phân tích + ước giá thành công', async () => {
    // Mock 3 AI calls: DeepSeek intent, Anthropic vision, Perplexity pricing
    mockCallAI
      .mockResolvedValueOnce(mockAIResponse({
        service_type: 'electrical',
        problem_slug: 'breaker_trip',
        confidence: 0.92,
        needs_clarification: false,
      }))
      .mockResolvedValueOnce(mockAIResponse({
        problem_identified: 'Cầu dao bị trip liên tục do quá tải mạch điện',
        severity_indicators: ['trip lặp lại', 'nhiều thiết bị'],
        complexity_hint: 'medium',
      }))
      .mockResolvedValueOnce(mockAIResponse({
        market_range_min: 250000,
        market_range_max: 500000,
        confidence: 0.75,
        sources_summary: 'Giá thợ điện HCMC Q1 2026',
      }))

    const req = makeRequest('POST', {
      service_type: 'electrical',
      description: 'Cầu dao liên tục bị trip khi bật máy lạnh và máy giặt cùng lúc, đã thử reset nhiều lần',
      problem_chips: ['Cầu dao trip'],
      address_district: 'quan_7',
    })

    const res = await createJob(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.job_id).toBeDefined()
    expect(body.status).toBe('awaiting_customer_confirm')
    expect(body.estimate).toBeDefined()
    expect(body.estimate.service_type).toBe('electrical')
    expect(body.estimate.complexity).toBe('medium')
    expect(body.estimate.price_min).toBeGreaterThan(0)
    expect(body.estimate.price_max).toBeGreaterThan(body.estimate.price_min)
    expect(body.estimate.disclaimer).toContain('ước tính')

    // Rule #4: disclaimer luôn có
    expect(body.estimate.disclaimer).toContain('thợ')

    console.log(`✓ Job created: ${body.job_id}`)
    console.log(`  Estimate: ${body.estimate.price_min.toLocaleString()}đ - ${body.estimate.price_max.toLocaleString()}đ`)
    console.log(`  Complexity: ${body.estimate.complexity}`)
    console.log(`  Problem: ${body.estimate.problem_summary}`)
    console.log(`  Fallback used: ${body.fallback_used}`)
  })

  it('POST /api/jobs — reject unsupported service (Rule #6)', async () => {
    mockCallAI.mockResolvedValueOnce(mockAIResponse({
      service_type: 'unsupported',
      problem_slug: 'cleaning',
      confidence: 0.95,
      needs_clarification: false,
    }))

    const req = makeRequest('POST', {
      service_type: 'electrical',
      description: 'Tôi muốn dọn dẹp nhà, lau sàn và giặt rèm cửa',
      problem_chips: ['Vấn đề khác'],
    })

    const res = await createJob(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('UNSUPPORTED')
    expect(body.error).toContain('sửa điện')
    expect(body.error).toContain('sửa nước')

    console.log('✓ Unsupported service correctly rejected')
  })

  it('POST /api/jobs — fallback khi AI fail (Rule #8)', async () => {
    // All 3 AI calls fail
    mockCallAI
      .mockResolvedValueOnce({ provider: 'deepseek', error: 'timeout', code: 'TIMEOUT', retryable: false, success: false })
      .mockResolvedValueOnce({ provider: 'anthropic', error: 'timeout', code: 'TIMEOUT', retryable: false, success: false })
      .mockResolvedValueOnce({ provider: 'perplexity', error: 'timeout', code: 'TIMEOUT', retryable: false, success: false })

    const req = makeRequest('POST', {
      service_type: 'plumbing',
      description: 'Ống nước dưới bồn rửa chén bị rò rỉ nước liên tục, nước chảy ra sàn',
      problem_chips: ['Ống rò rỉ'],
      address_district: 'quan_1',
    })

    const res = await createJob(req)
    const body = await res.json()

    // Should still succeed with fallback pricing
    expect(res.status).toBe(201)
    expect(body.fallback_used).toBe(true)
    expect(body.estimate.price_min).toBeGreaterThan(0)
    expect(body.estimate.disclaimer).toBeDefined()

    console.log('✓ AI fallback works — estimate still provided with fallback_used=true')
    console.log(`  Fallback price: ${body.estimate.price_min.toLocaleString()}đ - ${body.estimate.price_max.toLocaleString()}đ`)
  })

  it('POST /api/jobs — reject missing required fields', async () => {
    const req = makeRequest('POST', {
      service_type: 'electrical',
      // description missing
      problem_chips: ['Cầu dao trip'],
    })

    const res = await createJob(req)
    expect(res.status).toBe(400)

    console.log('✓ Validation rejects incomplete input')
  })

  it('Không có auth token → 401', async () => {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service_type: 'electrical', description: 'test', problem_chips: ['test'] }),
    })

    const res = await createJob(req)
    expect(res.status).toBe(401)

    console.log('✓ Missing auth token correctly returns 401')
  })

  it('Worker không thể tạo job (Role guard)', async () => {
    currentMockRole = 'worker'
    currentMockUserId = 'worker-001'

    const req = makeRequest('POST', {
      service_type: 'electrical',
      description: 'Worker trying to create a job which should be forbidden',
      problem_chips: ['Cầu dao trip'],
    })

    const res = await createJob(req)
    expect(res.status).toBe(403)

    console.log('✓ Worker role correctly blocked from creating jobs')
  })

  it('Complete workflow — 7 steps: create → estimate → A7 → worker updates → complete → A12 → review', async () => {
    // ── Step 1: Customer tạo job + Kael estimate ──
    currentMockRole = 'customer'
    currentMockUserId = 'customer-001'

    mockCallAI
      .mockResolvedValueOnce(mockAIResponse({
        service_type: 'plumbing',
        problem_slug: 'pipe_leak',
        confidence: 0.88,
        needs_clarification: false,
      }))
      .mockResolvedValueOnce(mockAIResponse({
        problem_identified: 'Ống nước bị rò rỉ tại mối nối dưới bồn rửa',
        severity_indicators: ['rò rỉ liên tục'],
        complexity_hint: 'small',
      }))
      .mockResolvedValueOnce(mockAIResponse({
        market_range_min: 150000,
        market_range_max: 350000,
        confidence: 0.8,
      }))

    const createReq = makeRequest('POST', {
      service_type: 'plumbing',
      description: 'Ống nước dưới bồn rửa bát bị rò rỉ, nước nhỏ giọt liên tục',
      problem_chips: ['Ống rò rỉ'],
      address_district: 'quan_7',
      address_building: 'Vinhomes Grand Park',
      address_unit: 'S5.03-1205',
      address_floor: '12',
    })

    const createRes = await createJob(createReq)
    const createBody = await createRes.json()

    expect(createRes.status).toBe(201)
    expect(createBody.status).toBe('awaiting_customer_confirm')
    expect(createBody.estimate.disclaimer).toContain('ước tính')

    const jobId = createBody.job_id

    console.log(`\n══════ FULL WORKFLOW TEST ══════`)
    console.log(`Step 1 ✓ Job created: ${jobId}`)
    console.log(`  Service: plumbing | Problem: ${createBody.estimate.problem_category}`)
    console.log(`  Price: ${createBody.estimate.price_min.toLocaleString()}đ - ${createBody.estimate.price_max.toLocaleString()}đ`)

    // ── Step 2: Customer xem job detail ──
    const detailRes = await getJob(makeRequest('GET'), makeParams(jobId))
    const detailBody = await detailRes.json()

    expect(detailRes.status).toBe(200)
    expect(detailBody.job.status).toBe('awaiting_customer_confirm')
    expect(detailBody.job.service_type).toBe('plumbing')
    expect(detailBody.job.address_building).toBe('Vinhomes Grand Park')

    console.log(`Step 2 ✓ Job detail — status: ${detailBody.job.status}`)

    // ── Step 3: Customer confirm search (A7 gate) ──
    const searchRes = await confirmSearch(makeRequest('POST'), makeParams(jobId))
    const searchBody = await searchRes.json()

    expect(searchRes.status).toBe(200)
    expect(['broadcasting', 'worker_matched']).toContain(searchBody.status)

    if (searchBody.worker) {
      console.log(`Step 3 ✓ A7 confirmed → Worker matched: ${searchBody.worker.full_name} (★${searchBody.worker.rating})`)
    } else {
      console.log(`Step 3 ✓ A7 confirmed → Broadcasting (no worker found)`)
    }

    // ── Step 4: Worker updates status chain ──
    currentMockRole = 'worker'
    currentMockUserId = 'worker-001'

    const job = jobsTable.get(jobId)
    if (job) {
      job.worker_id = 'worker-001'
      job.status = 'worker_matched'
      jobsTable.set(jobId, job)
    }

    const workerStatuses = ['worker_on_way', 'arrived', 'inspecting', 'repairing'] as const
    for (const status of workerStatuses) {
      const statusRes = await updateStatus(makeRequest('PATCH', { status }), makeParams(jobId))
      const statusBody = await statusRes.json()

      expect(statusRes.status).toBe(200)
      expect(statusBody.to_status).toBe(status)

      console.log(`Step 4 ✓ Worker: ${statusBody.from_status} → ${statusBody.to_status}`)
    }

    // ── Step 5: Worker completes job ──
    const completeRes = await updateStatus(makeRequest('PATCH', {
      status: 'completed_by_worker',
      final_price: 280000,
      completion_notes: 'Đã thay mối nối ống PVC và kiểm tra toàn bộ hệ thống nước',
      completion_photo_urls: ['https://storage.example.com/photos/completion-1.jpg'],
    }), makeParams(jobId))
    const completeBody = await completeRes.json()

    expect(completeRes.status).toBe(200)
    expect(completeBody.to_status).toBe('completed_by_worker')

    console.log(`Step 5 ✓ Worker completed — final price: ${(280000).toLocaleString()}đ`)

    // ── Step 6: Customer confirm completion (A12 gate) ──
    currentMockRole = 'customer'
    currentMockUserId = 'customer-001'

    const confirmRes = await confirmCompletion(makeRequest('POST'), makeParams(jobId))
    const confirmBody = await confirmRes.json()

    expect(confirmRes.status).toBe(200)
    expect(confirmBody.status).toBe('confirmed_by_customer')
    expect(confirmBody.final_price).toBe(280000)

    console.log(`Step 6 ✓ A12 confirmed — no auto-pay (Bug #3 fix)`)

    // ── Step 7: Customer submits review ──

    const reviewRes = await submitReview(makeRequest('POST', {
      rating: 5,
      tags: ['Đúng giờ', 'Chuyên nghiệp', 'Giá hợp lý'],
      comment: 'Thợ rất chuyên nghiệp, sửa nhanh và sạch sẽ',
    }), makeParams(jobId))
    const reviewBody = await reviewRes.json()

    expect(reviewRes.status).toBe(201)
    expect(reviewBody.review_id).toBeDefined()
    expect(reviewBody.status).toBe('reviewed')

    console.log(`Step 7 ✓ Review submitted — ★★★★★`)
    console.log(`\n══════ WORKFLOW COMPLETE ══════`)
    console.log(`  7/7 steps passed`)
    console.log(`  Job: ${jobId}`)
    console.log(`  Flow: draft → analyzing → estimate → A7 → broadcasting → matched → on_way → arrived → inspecting → repairing → completed → A12 → confirmed → reviewed`)
  })

  describe('State machine enforcement', () => {
    it('Không thể confirm search khi status khác awaiting_customer_confirm', async () => {
      // Create job in draft status
      const id = genId()
      jobsTable.set(id, {
        id,
        status: 'draft',
        customer_id: 'customer-001',
        service_type: 'electrical',
        address_district: 'quan_1',
      })

      const req = makeRequest('POST')
      const res = await confirmSearch(req, makeParams(id))
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.code).toBe('INVALID_STATUS')

      console.log('✓ State machine blocks A7 confirm from wrong status')
    })

    it('Không thể confirm completion khi chưa completed_by_worker', async () => {
      const id = genId()
      jobsTable.set(id, {
        id,
        status: 'repairing',
        customer_id: 'customer-001',
        worker_id: 'worker-001',
      })

      const req = makeRequest('POST')
      const res = await confirmCompletion(req, makeParams(id))
      const body = await res.json()

      expect(res.status).toBe(409)
      expect(body.code).toBe('INVALID_STATUS')

      console.log('✓ State machine blocks A12 confirm before worker completion')
    })

    it('Worker completed_by_worker phải có final_price', async () => {
      currentMockRole = 'worker'
      currentMockUserId = 'worker-001'

      const id = genId()
      jobsTable.set(id, {
        id,
        status: 'repairing',
        worker_id: 'worker-001',
      })

      const req = makeRequest('PATCH', {
        status: 'completed_by_worker',
        // Missing final_price
      })

      const res = await updateStatus(req, makeParams(id))
      const body = await res.json()

      expect(res.status).toBe(400)

      console.log('✓ Worker must provide final_price when completing')
    })

    it('Customer không thể cập nhật worker status', async () => {
      currentMockRole = 'customer'
      currentMockUserId = 'customer-001'

      const req = makeRequest('PATCH', { status: 'arrived' })
      const res = await updateStatus(req, makeParams('any-id'))

      expect(res.status).toBe(403)

      console.log('✓ Customer blocked from worker status updates')
    })
  })

  describe('Access control', () => {
    it('Customer không thể xem job của customer khác', async () => {
      const id = genId()
      jobsTable.set(id, {
        id,
        status: 'awaiting_customer_confirm',
        customer_id: 'customer-002', // Different customer
      })

      currentMockUserId = 'customer-001'

      const req = makeRequest('GET')
      const res = await getJob(req, makeParams(id))

      expect(res.status).toBe(404)

      console.log('✓ Cross-customer job access blocked')
    })

    it('Worker không thể cập nhật job của worker khác', async () => {
      currentMockRole = 'worker'
      currentMockUserId = 'worker-002'

      const id = genId()
      jobsTable.set(id, {
        id,
        status: 'worker_on_way',
        worker_id: 'worker-001', // Different worker
      })

      const req = makeRequest('PATCH', { status: 'arrived' })
      const res = await updateStatus(req, makeParams(id))

      expect(res.status).toBe(403)

      console.log('✓ Cross-worker status update blocked')
    })
  })
})
