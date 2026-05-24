/**
 * REAL integration tests — hits actual Supabase staging.
 * No mocks. No fakes. No silent skips. If it passes here, it works.
 *
 * Creates real auth users, real jobs, real events, real reviews.
 * Cleans up everything after.
 *
 * Requires .env.local with real credentials.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@home-services/shared'
import { readFileSync } from 'fs'
import { resolve } from 'path'

type JobStatus = Database['public']['Enums']['job_status']
type JobUpdate = Database['public']['Tables']['jobs']['Update']

function loadEnvFile(): Record<string, string> {
  const envPath = resolve(__dirname, '../../../../../.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [key, ...valueParts] = trimmed.split('=')
      if (!key || valueParts.length === 0) continue
      vars[key.trim()] = valueParts.join('=').trim()
    }
    return vars
  } catch {
    return {}
  }
}

const envVars = loadEnvFile()
const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'] || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = envVars['SUPABASE_SERVICE_ROLE_KEY'] || process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = envVars['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'
const isProduction = supabaseUrl?.includes(PRODUCTION_REF) ?? false

const skip = !supabaseUrl || !serviceRoleKey || isProduction
const describeReal = skip ? describe.skip : describe

if (isProduction) {
  console.warn(
    '[real-supabase] Refusing to run against production. Set NEXT_PUBLIC_SUPABASE_URL to staging.',
  )
}

let supabase: SupabaseClient<Database>

// ─── Test user IDs — created in beforeAll, cleaned up in afterAll ───
let customerUserId: string | null = null
let workerUserId: string | null = null
let testJobId: string | null = null
let testReviewId: string | null = null

const TEST_CUSTOMER_EMAIL = `test-customer-${Date.now()}@integration.test`
const TEST_WORKER_EMAIL = `test-worker-${Date.now()}@integration.test`

// ═══════════════════════════════════════════════════════════════════
// 1. CONNECTION + SCHEMA VERIFICATION
// ═══════════════════════════════════════════════════════════════════

describeReal('Real Supabase — connection + schema', () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      global: {
        fetch: (url, options = {}) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10_000)
          return fetch(url, { ...options, signal: controller.signal }).finally(() =>
            clearTimeout(timeout),
          )
        },
      },
    })
  })

  it('connects to Supabase', async () => {
    const { data, error } = await supabase.from('profiles').select('id').limit(1)
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })

  it('service_categories has electrical, plumbing, and cleaning', async () => {
    const { data, error } = await supabase
      .from('service_categories')
      .select('id, service_type, slug, label_vi, is_active')
      .eq('is_active', true)
      .order('sort_order')

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.map((c) => c.service_type)).toContain('electrical')
    expect(data!.map((c) => c.service_type)).toContain('plumbing')
    expect(data!.map((c) => c.service_type)).toContain('cleaning')
  })

  it('service_problems has active problems', async () => {
    const { data, error } = await supabase
      .from('service_problems')
      .select('id, slug, label_vi, service_type, service_category_id, is_active')
      .eq('is_active', true)
      .limit(20)

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
  })

  it('all job-related tables exist', async () => {
    const tables = ['jobs', 'job_events', 'job_broadcasts', 'reviews', 'worker_profiles', 'price_baselines'] as const
    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(0)
      expect(error, `Table ${table} should exist`).toBeNull()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// 2. .contains() OPERATOR VERIFICATION
// ═══════════════════════════════════════════════════════════════════

describeReal('Real Supabase — .contains() on array columns', () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!)
  })

  it('.contains() on service_types', async () => {
    const { error } = await supabase
      .from('worker_profiles')
      .select('id, service_types')
      .contains('service_types', ['electrical'])
      .limit(5)
    expect(error).toBeNull()
  })

  it('.contains() on districts', async () => {
    const { error } = await supabase
      .from('worker_profiles')
      .select('id, districts')
      .contains('districts', ['quan_1'])
      .limit(5)
    expect(error).toBeNull()
  })

  it('full matching query chain works', async () => {
    const { data, error } = await supabase
      .from('worker_profiles')
      .select('id, rating, total_jobs, service_types, districts')
      .eq('is_approved', true)
      .eq('is_available', true)
      .eq('is_suspended', false)
      .contains('service_types', ['plumbing'])
      .contains('districts', ['quan_1'])
      .order('rating', { ascending: false })
      .limit(20)

    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════════
// 3. AUTH — REAL USER CREATION + PROFILE TRIGGER
// ═══════════════════════════════════════════════════════════════════

describeReal('Real Supabase — auth user creation + profile trigger', () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!)
  })

  it('creates test customer via admin API', async () => {
    const { data, error } = await supabase.auth.admin.createUser({
      email: TEST_CUSTOMER_EMAIL,
      password: 'test-password-integration-12345',
      email_confirm: true,
      user_metadata: { role: 'customer' },
    })

    expect(error, `Failed to create customer: ${error?.message}`).toBeNull()
    expect(data.user).toBeDefined()
    customerUserId = data.user!.id
  })

  it('profile trigger created customer profile automatically', async () => {
    expect(customerUserId).not.toBeNull()

    // Small delay for trigger to execute
    await new Promise((r) => setTimeout(r, 500))

    const { data, error } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', customerUserId!)
      .single()

    expect(error, 'Profile should exist after trigger').toBeNull()
    expect(data!.role).toBe('customer')
  })

  it('creates test worker via admin API', async () => {
    const { data, error } = await supabase.auth.admin.createUser({
      email: TEST_WORKER_EMAIL,
      password: 'test-password-integration-12345',
      email_confirm: true,
      user_metadata: { role: 'worker' },
    })

    expect(error, `Failed to create worker: ${error?.message}`).toBeNull()
    expect(data.user).toBeDefined()
    workerUserId = data.user!.id
  })

  it('worker profile trigger defaults to customer (security hardening C2)', async () => {
    expect(workerUserId).not.toBeNull()

    await new Promise((r) => setTimeout(r, 500))

    const { data, error } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', workerUserId!)
      .single()

    expect(error).toBeNull()
    expect(data!.role).toBe('customer')
  })

  it('admin upgrades worker role (simulates admin approval)', async () => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'worker' as const })
      .eq('id', workerUserId!)

    expect(error).toBeNull()

    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', workerUserId!)
      .single()

    expect(data!.role).toBe('worker')
  })

  it('sets up worker_profile for matching tests', async () => {
    expect(workerUserId).not.toBeNull()

    const { error } = await supabase
      .from('worker_profiles')
      .upsert({
        id: workerUserId!,
        service_types: ['electrical', 'plumbing', 'cleaning'],
        districts: ['quan_7', 'quan_1'],
        is_approved: true,
        is_available: true,
        is_suspended: false,
        rating: 4.5,
        total_jobs: 10,
      })

    expect(error, `Worker profile setup failed: ${error?.message}`).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════
// 4. FULL JOB LIFECYCLE — REAL DATA
// ═══════════════════════════════════════════════════════════════════

describeReal('Real Supabase — full job lifecycle', () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!)
  })

  it('Step 1: insert draft job with real customer_id', async () => {
    expect(customerUserId).not.toBeNull()

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        customer_id: customerUserId!,
        service_type: 'electrical',
        description: 'Integration test — mất điện phòng khách, cầu dao trip liên tục',
        problem_chips: ['Cầu dao trip'],
        photo_urls: [],
        status: 'draft',
        address_building: 'Vinhomes Central Park',
        address_unit: '1205',
        address_floor: '12',
        address_district: 'quan_binh_thanh',
      })
      .select('id, status, customer_id, service_type')
      .single()

    expect(error, `Job insert failed: ${error?.message}`).toBeNull()
    expect(data).toBeDefined()
    expect(data!.status).toBe('draft')
    expect(data!.customer_id).toBe(customerUserId)
    expect(data!.service_type).toBe('electrical')
    testJobId = data!.id
  })

  it('Step 2: draft → analyzing', async () => {
    expect(testJobId).not.toBeNull()

    const { error } = await supabase
      .from('jobs')
      .update({ status: 'analyzing' })
      .eq('id', testJobId!)

    expect(error).toBeNull()

    const { data } = await supabase.from('jobs').select('status').eq('id', testJobId!).single()
    expect(data!.status).toBe('analyzing')
  })

  it('Step 3: analyzing → estimate_ready (with Kael fields)', async () => {
    expect(testJobId).not.toBeNull()

    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'estimate_ready',
        kael_problem_identified: 'Cầu dao trip liên tục — có thể do quá tải hoặc chập điện',
        kael_complexity: 'medium',
        kael_price_min: 250000,
        kael_price_max: 600000,
        kael_advisory: null,
        estimate_ready_at: new Date().toISOString(),
      })
      .eq('id', testJobId!)

    expect(error).toBeNull()
  })

  it('Step 4: estimate_ready → awaiting_customer_confirm', async () => {
    expect(testJobId).not.toBeNull()

    const { error } = await supabase
      .from('jobs')
      .update({ status: 'awaiting_customer_confirm' })
      .eq('id', testJobId!)

    expect(error).toBeNull()
  })

  it('Step 5: awaiting_customer_confirm → broadcasting', async () => {
    expect(testJobId).not.toBeNull()

    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'broadcasting',
        broadcast_at: new Date().toISOString(),
        final_price: 600000,
      })
      .eq('id', testJobId!)

    expect(error).toBeNull()
  })

  it('Step 6: broadcasting → worker_matched (assign worker)', async () => {
    expect(testJobId).not.toBeNull()
    expect(workerUserId).not.toBeNull()

    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'worker_matched',
        worker_id: workerUserId!,
        matched_at: new Date().toISOString(),
      })
      .eq('id', testJobId!)
      .eq('status', 'broadcasting')

    expect(error).toBeNull()

    // Verify worker assignment
    const { data } = await supabase
      .from('jobs')
      .select('status, worker_id')
      .eq('id', testJobId!)
      .single()

    expect(data!.status).toBe('worker_matched')
    expect(data!.worker_id).toBe(workerUserId)
  })

  it('Step 7: worker status updates — on_way → arrived → inspecting → repairing', async () => {
    expect(testJobId).not.toBeNull()

    const transitions: Array<{ status: JobStatus; tsCol?: 'arrived_at' }> = [
      { status: 'worker_on_way' },
      { status: 'arrived', tsCol: 'arrived_at' },
      { status: 'inspecting' },
      { status: 'repairing' },
    ]

    for (const t of transitions) {
      const update: JobUpdate = { status: t.status }
      if (t.tsCol) update[t.tsCol] = new Date().toISOString()

      const { error } = await supabase
        .from('jobs')
        .update(update as never)
        .eq('id', testJobId!)

      expect(error, `Transition to ${t.status} failed: ${error?.message}`).toBeNull()
    }

    const { data } = await supabase.from('jobs').select('status').eq('id', testJobId!).single()
    expect(data!.status).toBe('repairing')
  })

  it('Step 8: repairing → completed_by_worker without worker final_price', async () => {
    expect(testJobId).not.toBeNull()

    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'completed_by_worker',
        completion_notes: 'Đã thay cầu dao mới và kiểm tra toàn bộ hệ thống điện',
        completion_photo_urls: [],
        completed_at: new Date().toISOString(),
      })
      .eq('id', testJobId!)

    expect(error).toBeNull()
  })

  it('Step 9: completed_by_worker → confirmed_by_customer', async () => {
    expect(testJobId).not.toBeNull()

    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'confirmed_by_customer',
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', testJobId!)

    expect(error).toBeNull()
  })

  it('Step 10: confirmed_by_customer → payment_pending → paid', async () => {
    expect(testJobId).not.toBeNull()

    const { error: ppErr } = await supabase
      .from('jobs')
      .update({ status: 'payment_pending' })
      .eq('id', testJobId!)

    expect(ppErr).toBeNull()

    const { error: paidErr } = await supabase
      .from('jobs')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', testJobId!)

    expect(paidErr).toBeNull()
  })

  it('Step 11: verify full job state after payment', async () => {
    expect(testJobId).not.toBeNull()

    const { data, error } = await supabase
      .from('jobs')
      .select('id, status, service_type, customer_id, worker_id, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, final_price, completion_notes, address_building, address_district, broadcast_at, matched_at, arrived_at, completed_at, confirmed_at, paid_at')
      .eq('id', testJobId!)
      .single()

    expect(error).toBeNull()
    expect(data!.status).toBe('paid')
    expect(data!.customer_id).toBe(customerUserId)
    expect(data!.worker_id).toBe(workerUserId)
    expect(data!.final_price).toBe(600000)
    expect(data!.kael_price_min).toBe(250000)
    expect(data!.kael_price_max).toBe(600000)
    expect(data!.kael_complexity).toBe('medium')
    expect(data!.address_building).toBe('Vinhomes Central Park')
    expect(data!.broadcast_at).not.toBeNull()
    expect(data!.matched_at).not.toBeNull()
    expect(data!.arrived_at).not.toBeNull()
    expect(data!.completed_at).not.toBeNull()
    expect(data!.confirmed_at).not.toBeNull()
    expect(data!.paid_at).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════
// 5. JOB EVENTS — REAL INSERT + QUERY
// ═══════════════════════════════════════════════════════════════════

describeReal('Real Supabase — job events', () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!)
  })

  it('can insert multiple job events', async () => {
    expect(testJobId).not.toBeNull()
    expect(customerUserId).not.toBeNull()

    const events = [
      { event_type: 'status_change', actor_role: 'customer' as const, from_status: 'draft' as const, to_status: 'analyzing' as const },
      { event_type: 'status_change', actor_role: 'customer' as const, from_status: 'analyzing' as const, to_status: 'estimate_ready' as const },
      { event_type: 'customer_confirmed_search', actor_role: 'customer' as const, from_status: 'awaiting_customer_confirm' as const, to_status: 'broadcasting' as const },
      { event_type: 'worker_matched', actor_role: 'worker' as const, from_status: 'broadcasting' as const, to_status: 'worker_matched' as const },
    ]

    for (const evt of events) {
      const { error } = await supabase.from('job_events').insert({
        job_id: testJobId!,
        event_type: evt.event_type,
        actor_id: evt.actor_role === 'customer' ? customerUserId! : workerUserId!,
        actor_role: evt.actor_role,
        from_status: evt.from_status,
        to_status: evt.to_status,
        safe_metadata: { integration_test: true },
      })

      expect(error, `Event ${evt.event_type} insert failed: ${error?.message}`).toBeNull()
    }
  })

  it('can query events for a job', async () => {
    expect(testJobId).not.toBeNull()

    const { data, error } = await supabase
      .from('job_events')
      .select('id, event_type, actor_role, from_status, to_status, safe_metadata')
      .eq('job_id', testJobId!)
      .order('created_at')

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(4)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 6. REVIEWS — REAL INSERT + QUERY
// ═══════════════════════════════════════════════════════════════════

describeReal('Real Supabase — reviews', () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!)
  })

  it('can insert review with rating + tags + comment', async () => {
    expect(testJobId).not.toBeNull()
    expect(customerUserId).not.toBeNull()
    expect(workerUserId).not.toBeNull()

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        job_id: testJobId!,
        customer_id: customerUserId!,
        worker_id: workerUserId!,
        rating: 5,
        tags: ['Đúng giờ', 'Chuyên nghiệp', 'Giá hợp lý'],
        comment: 'Thợ sửa nhanh và chuyên nghiệp, giải thích rõ ràng',
      })
      .select('id, rating, tags, comment')
      .single()

    expect(error, `Review insert failed: ${error?.message}`).toBeNull()
    expect(data).toBeDefined()
    expect(data!.rating).toBe(5)
    expect(data!.tags).toContain('Đúng giờ')
    testReviewId = data!.id
  })

  it('transition job to reviewed', async () => {
    expect(testJobId).not.toBeNull()

    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'reviewed',
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', testJobId!)

    expect(error).toBeNull()

    const { data } = await supabase.from('jobs').select('status').eq('id', testJobId!).single()
    expect(data!.status).toBe('reviewed')
  })
})

// ═══════════════════════════════════════════════════════════════════
// 7. JOB BROADCASTS — REAL INSERT
// ═══════════════════════════════════════════════════════════════════

describeReal('Real Supabase — job broadcasts', () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!)
  })

  it('can insert broadcast record', async () => {
    expect(testJobId).not.toBeNull()
    expect(workerUserId).not.toBeNull()

    const { error } = await supabase
      .from('job_broadcasts')
      .insert({
        job_id: testJobId!,
        worker_id: workerUserId!,
        status: 'accepted',
        broadcast_at: new Date().toISOString(),
        responded_at: new Date().toISOString(),
      })

    expect(error, `Broadcast insert failed: ${error?.message}`).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════
// 8. AUTH FLOW — getUser BEHAVIOR
// ═══════════════════════════════════════════════════════════════════

describeReal('Real Supabase — auth.getUser behavior', () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!)
  })

  it('getUser with invalid token returns error, not crash', async () => {
    const { data, error } = await supabase.auth.getUser('invalid-token-12345')
    expect(error).toBeDefined()
    expect(data.user).toBeNull()
  })

  it('getUser with empty token returns error', async () => {
    const { data, error } = await supabase.auth.getUser('')
    expect(error).toBeDefined()
    expect(data.user).toBeNull()
  })

  it('can sign in test customer and get valid token', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: TEST_CUSTOMER_EMAIL,
      password: 'test-password-integration-12345',
    })

    expect(error).toBeNull()
    expect(data.session).toBeDefined()
    expect(data.session!.access_token).toBeDefined()

    // Verify getUser works with real token
    const { data: userData, error: userErr } = await supabase.auth.getUser(data.session!.access_token)
    expect(userErr).toBeNull()
    expect(userData.user!.id).toBe(customerUserId)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 9. RLS ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════

describeReal('Real Supabase — RLS enforcement', () => {
  let anonClient: SupabaseClient<Database>

  beforeAll(() => {
    anonClient = createClient<Database>(supabaseUrl!, anonKey!)
  })

  it('anon client cannot read jobs', async () => {
    const { data, error } = await anonClient.from('jobs').select('id').limit(1)
    const blocked = (error !== null) || (data !== null && data.length === 0)
    expect(blocked).toBe(true)
  })

  it('anon client cannot read worker_profiles', async () => {
    const { data, error } = await anonClient.from('worker_profiles').select('id').limit(1)
    const blocked = (error !== null) || (data !== null && data.length === 0)
    expect(blocked).toBe(true)
  })

  it('anon client cannot read job_events', async () => {
    const { data, error } = await anonClient.from('job_events').select('id').limit(1)
    const blocked = (error !== null) || (data !== null && data.length === 0)
    expect(blocked).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════
// CLEANUP — delete all test data
// ═══════════════════════════════════════════════════════════════════

describeReal('Cleanup — remove all test data', () => {
  beforeAll(() => {
    supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!)
  })

  it('deletes test review', async () => {
    if (testReviewId) {
      await supabase.from('reviews').delete().eq('id', testReviewId)
    }
  })

  it('deletes test job broadcasts', async () => {
    if (testJobId) {
      await supabase.from('job_broadcasts').delete().eq('job_id', testJobId)
    }
  })

  it('deletes test job events', async () => {
    if (testJobId) {
      await supabase.from('job_events').delete().eq('job_id', testJobId)
    }
  })

  it('deletes test job', async () => {
    if (testJobId) {
      await supabase.from('jobs').delete().eq('id', testJobId)
    }
  })

  it('deletes test worker profile', async () => {
    if (workerUserId) {
      await supabase.from('worker_profiles').delete().eq('id', workerUserId)
    }
  })

  it('deletes test customer profile', async () => {
    if (customerUserId) {
      await supabase.from('customer_profiles').delete().eq('id', customerUserId)
    }
  })

  it('deletes test auth users', async () => {
    if (customerUserId) {
      await supabase.auth.admin.deleteUser(customerUserId)
    }
    if (workerUserId) {
      await supabase.auth.admin.deleteUser(workerUserId)
    }
  })
})
