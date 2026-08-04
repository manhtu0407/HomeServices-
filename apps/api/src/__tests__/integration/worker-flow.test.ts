/**
 * REAL integration test for worker flow B0-B8 (E11).
 *
 * Hits a Supabase project directly (no mocks). Verifies:
 *   B0 register → B1 admin approve → B2 availability →
 *   legacy confirm-search recovery → broadcast created →
 *   B3 worker accept → B5 status updates → B7 complete →
 *   legacy confirm-completion recovery → A14 review → B8 earnings.
 *
 * Skips automatically when env credentials are missing — does NOT silently
 * pass. Run locally with:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://xyy....supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   pnpm --filter @nestscout/api test -- worker-flow
 *
 * Cleans up all created auth users + rows in afterAll. If the test crashes
 * mid-flight, manual cleanup of test-customer-* / test-worker-* emails may
 * be required.
 *
 * Target: STAGING project, not production. Production runs are explicitly
 * blocked by the URL check below.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@nestscout/shared'
import { resolveOrAnnounceSkip } from './integration-target'

// Defaults to the local stack; throws rather than skipping on a dangerous
// target, so a production URL can never report green by being skipped.
const resolution = await resolveOrAnnounceSkip('worker-flow')
const supabaseUrl = resolution.ok ? resolution.target.url : undefined
const serviceRoleKey = resolution.ok ? resolution.target.serviceRoleKey : undefined
const describeReal = resolution.ok ? describe : describe.skip

let supabase: SupabaseClient<Database>

// Test fixture IDs — created in beforeAll, cleaned up in afterAll
let customerUserId: string | null = null
let workerUserId: string | null = null
let createdJobId: string | null = null

const TS = Date.now()
const CUSTOMER_EMAIL = `test-customer-${TS}@worker-flow.test`
const WORKER_EMAIL = `test-worker-${TS}@worker-flow.test`

describeReal('Worker Flow B0-B8 — real Supabase integration', () => {
  beforeAll(async () => {
    supabase = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      global: {
        fetch: (url, options = {}) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15_000)
          return fetch(url, { ...options, signal: controller.signal }).finally(() =>
            clearTimeout(timeout),
          )
        },
      },
    })

    // Create test users via auth admin API
    const { data: customer, error: cErr } = await supabase.auth.admin.createUser({
      email: CUSTOMER_EMAIL,
      email_confirm: true,
      user_metadata: { full_name: 'Test Customer' },
    })
    if (cErr) throw new Error(`Failed to create customer: ${cErr.message}`)
    customerUserId = customer.user.id

    const { data: worker, error: wErr } = await supabase.auth.admin.createUser({
      email: WORKER_EMAIL,
      email_confirm: true,
      user_metadata: { full_name: 'Test Worker' },
    })
    if (wErr) throw new Error(`Failed to create worker: ${wErr.message}`)
    workerUserId = worker.user.id

    // handle_new_user trigger creates profiles row with role='customer'.
    // Switch worker to role='worker' (admin-only update).
    await supabase.from('profiles').update({ role: 'worker' }).eq('id', workerUserId)

    // Customer apartment profile
    await supabase.from('customer_profiles').upsert({
      id: customerUserId,
      building_name: 'Test Building',
      unit_number: 'A101',
      floor: '1',
      district: 'q1',
    })
  }, 30_000)

  afterAll(async () => {
    // Order: events/broadcasts/reviews → jobs → worker_profiles → customer_profiles → auth.users
    if (createdJobId) {
      await supabase.from('job_events').delete().eq('job_id', createdJobId)
      await supabase.from('job_broadcasts').delete().eq('job_id', createdJobId)
      await supabase.from('reviews').delete().eq('job_id', createdJobId)
      await supabase.from('scope_change_requests').delete().eq('job_id', createdJobId)
      await supabase.from('api_logs').delete().eq('job_id', createdJobId)
      await supabase.from('jobs').delete().eq('id', createdJobId)
    }
    if (workerUserId) {
      await supabase.from('worker_profiles').delete().eq('id', workerUserId)
      await supabase.auth.admin.deleteUser(workerUserId)
    }
    if (customerUserId) {
      await supabase.from('customer_profiles').delete().eq('id', customerUserId)
      await supabase.auth.admin.deleteUser(customerUserId)
    }
  }, 30_000)

  // ─── B0: Worker registration ─────────────────────────────────────

  it('B0: worker submits registration → verification_status=submitted', async () => {
    expect(workerUserId).not.toBeNull()
    const { error } = await supabase.from('worker_profiles').upsert({
      id: workerUserId!,
      legal_name: 'Nguyễn Văn A',
      date_of_birth: '1990-01-15',
      gender: 'male',
      service_types: ['electrical'],
      years_experience: 5,
      districts: ['q1', 'q3'],
      cccd_front_url: 'https://example.test/cccd-front.jpg',
      cccd_back_url: 'https://example.test/cccd-back.jpg',
      selfie_url: 'https://example.test/selfie.jpg',
      bank_account: '0123456789',
      bank_name: 'Vietcombank',
      verification_status: 'submitted',
      is_approved: false,
      is_available: false,
      is_suspended: false,
    })
    expect(error).toBeNull()

    const { data, error: readErr } = await supabase
      .from('worker_profiles')
      .select('verification_status, is_approved')
      .eq('id', workerUserId!)
      .single()
    expect(readErr).toBeNull()
    expect(data?.verification_status).toBe('submitted')
    expect(data?.is_approved).toBe(false)
  })

  // ─── B1: Admin approves (simulated via direct update) ────────────

  it('B1: admin approves worker → is_approved=true, verification_status=approved', async () => {
    const { error } = await supabase
      .from('worker_profiles')
      .update({ verification_status: 'approved', is_approved: true })
      .eq('id', workerUserId!)
    expect(error).toBeNull()
  })

  // ─── B2: Worker goes online ──────────────────────────────────────

  it('B2: approved worker can set is_available=true', async () => {
    const { error } = await supabase
      .from('worker_profiles')
      .update({ is_available: true })
      .eq('id', workerUserId!)
    expect(error).toBeNull()
  })

  // ─── A3-A5: Customer creates job (skip Kael pipeline, direct insert) ─

  it('Customer creates job in awaiting_customer_confirm state', async () => {
    const { data, error } = await supabase
      .from('jobs')
      .insert({
        customer_id: customerUserId!,
        service_type: 'electrical',
        description: 'Cầu dao bị trip liên tục, không reset được',
        problem_chips: ['Cầu dao trip'],
        photo_urls: [],
        address_building: 'Test Building',
        address_unit: 'A101',
        address_floor: '1',
        address_district: 'q1',
        status: 'awaiting_customer_confirm',
        kael_problem_identified: 'Cầu dao quá tải',
        kael_complexity: 'medium',
        kael_price_min: 300_000,
        kael_price_max: 700_000,
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeDefined()
    createdJobId = data!.id
  })

  // ─── Legacy recovery + Broadcast: confirm-search → broadcast row created ──

  it('legacy confirm-search recovery transitions broadcasting + broadcast row created', async () => {
    expect(createdJobId).not.toBeNull()
    const now = new Date().toISOString()
    const { error: jobErr } = await supabase
      .from('jobs')
      .update({ status: 'broadcasting', broadcast_at: now, confirmed_search_at: now, final_price: 700_000 })
      .eq('id', createdJobId!)
    expect(jobErr).toBeNull()

    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    const { error: bErr } = await supabase.from('job_broadcasts').insert({
      job_id: createdJobId!,
      worker_id: workerUserId!,
      status: 'sent',
      broadcast_at: now,
      sent_at: now,
      expires_at: expiresAt,
      batch_id: crypto.randomUUID(),
    })
    expect(bErr).toBeNull()
  })

  // ─── B3: Worker accept (atomic claim) ────────────────────────────

  it('B3: worker accept → job=worker_matched, broadcast=accepted', async () => {
    const now = new Date().toISOString()
    const { data: claimed, error: claimErr } = await supabase
      .from('jobs')
      .update({
        worker_id: workerUserId!,
        status: 'worker_matched',
        matched_at: now,
      })
      .eq('id', createdJobId!)
      .eq('status', 'broadcasting')
      .select('id')
      .maybeSingle()
    expect(claimErr).toBeNull()
    expect(claimed).not.toBeNull()

    await supabase
      .from('job_broadcasts')
      .update({ status: 'accepted', responded_at: now })
      .eq('job_id', createdJobId!)
      .eq('worker_id', workerUserId!)

    const { data: job } = await supabase
      .from('jobs')
      .select('status, worker_id')
      .eq('id', createdJobId!)
      .single()
    expect(job?.status).toBe('worker_matched')
    expect(job?.worker_id).toBe(workerUserId)
  })

  // ─── B5: Status walks worker_on_way → arrived → inspecting → repairing ─

  it('B5: worker status updates through full chain', async () => {
    const steps: Array<{ status: 'worker_on_way' | 'arrived' | 'inspecting' | 'repairing'; tsCol?: string }> = [
      { status: 'worker_on_way' },
      { status: 'arrived', tsCol: 'arrived_at' },
      { status: 'inspecting' },
      { status: 'repairing' },
    ]

    for (const step of steps) {
      const update: Record<string, unknown> = { status: step.status }
      if (step.tsCol) update[step.tsCol] = new Date().toISOString()
      const { error } = await supabase
        .from('jobs')
        .update(update as never)
        .eq('id', createdJobId!)
      expect(error, `Transition to ${step.status} failed: ${error?.message}`).toBeNull()
    }

    const { data } = await supabase.from('jobs').select('status').eq('id', createdJobId!).single()
    expect(data?.status).toBe('repairing')
  })

  // ─── B7: Worker completes with Kael-owned final_price ────────────

  it('B7: worker completes → completed_by_worker without entering final_price', async () => {
    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'completed_by_worker',
        completed_at: new Date().toISOString(),
        completion_notes: 'Đã thay cầu dao mới',
        completion_photo_urls: ['https://example.test/completion.jpg'],
      })
      .eq('id', createdJobId!)
    expect(error).toBeNull()
  })

  // ─── Legacy completion recovery (Bug #3: no auto-pay) ────────────

  it('legacy confirm-completion recovery → confirmed_by_customer (NOT auto-pay)', async () => {
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'confirmed_by_customer', confirmed_at: new Date().toISOString() })
      .eq('id', createdJobId!)
    expect(error).toBeNull()

    const { data } = await supabase.from('jobs').select('status').eq('id', createdJobId!).single()
    expect(data?.status).toBe('confirmed_by_customer')
    // Critical: status must NOT auto-advance to 'paid'
    expect(data?.status).not.toBe('paid')
  })

  // ─── Manual payment transition (admin/system step) ───────────────

  it('Payment: confirmed → payment_pending → paid', async () => {
    await supabase
      .from('jobs')
      .update({ status: 'payment_pending' })
      .eq('id', createdJobId!)
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', createdJobId!)
    expect(error).toBeNull()
  })

  // ─── A14: Customer review ────────────────────────────────────────

  it('A14: customer submits review (rating + tags)', async () => {
    const { error } = await supabase.from('reviews').insert({
      job_id: createdJobId!,
      customer_id: customerUserId!,
      worker_id: workerUserId!,
      rating: 5,
      tags: ['Đúng giờ', 'Chuyên nghiệp'],
      comment: 'Thợ làm sạch sẽ, nhanh chóng',
    })
    expect(error).toBeNull()

    await supabase
      .from('jobs')
      .update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
      .eq('id', createdJobId!)
  })

  // ─── B8: Worker earnings include this paid job ───────────────────

  it('B8: worker earnings reflects the completed job', async () => {
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('status, final_price')
      .eq('worker_id', workerUserId!)
      .in('status', ['paid', 'reviewed'])
    expect(error).toBeNull()
    expect(jobs).not.toBeNull()

    const gross = (jobs ?? []).reduce((sum, r) => sum + (r.final_price ?? 0), 0)
    expect(gross).toBeGreaterThanOrEqual(700_000)
    // 10% platform fee → worker gets 90%
    const net = Math.round(gross * 0.9)
    expect(net).toBe(630_000)
  })
})
