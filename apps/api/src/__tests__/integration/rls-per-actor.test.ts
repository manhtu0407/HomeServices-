/**
 * RLS per-actor integration tests — real Supabase staging, AUTHENTICATED clients.
 * Proves ownership + PII isolation enforced by RLS itself (service-role bypasses RLS,
 * so the lifecycle tests do not cover this). Env-gated: skips without staging creds;
 * refuses production. Creates and cleans up its own users/job.
 *
 * Requires .env.local at repo root with:
 *   NEXT_PUBLIC_SUPABASE_URL (staging), SUPABASE_SERVICE_ROLE_KEY,
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *
 * Expected outcomes were validated against staging xyylanuyflrjzbjzhqfl via role-switch
 * simulation (set role authenticated + request.jwt.claims) before this file was written.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@nestscout/shared'
import { resolveOrAnnounceSkip } from './integration-target'

// Defaults to the local stack; throws rather than skipping on a dangerous
// target, so a production URL can never report green by being skipped.
const resolution = await resolveOrAnnounceSkip('rls-per-actor')
const supabaseUrl = resolution.ok ? resolution.target.url : undefined
const serviceRoleKey = resolution.ok ? resolution.target.serviceRoleKey : undefined
const anonKey = resolution.ok ? resolution.target.anonKey : undefined
const describeReal = resolution.ok ? describe : describe.skip

const PASSWORD = 'test-password-rls-integration-12345'
const stamp = Date.now()
const emails = {
  customerA: `rls-customer-a-${stamp}@integration.test`,
  customerB: `rls-customer-b-${stamp}@integration.test`,
  workerA: `rls-worker-a-${stamp}@integration.test`,
  workerB: `rls-worker-b-${stamp}@integration.test`,
}

let admin: SupabaseClient<Database>
const ids: Record<keyof typeof emails, string> = {} as Record<keyof typeof emails, string>
const authed: Record<keyof typeof emails, SupabaseClient<Database>> = {} as Record<
  keyof typeof emails,
  SupabaseClient<Database>
>
let jobId: string | null = null
let refundAccountId: string | null = null

async function createUser(email: string, role: 'customer' | 'worker'): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role },
  })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  return data.user!.id
}

async function signIn(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(supabaseUrl!, anonKey!)
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`signIn ${email}: ${error.message}`)
  return client
}

async function visibleCount(
  client: SupabaseClient<Database>,
  table: 'jobs' | 'worker_profiles' | 'customer_profiles' | 'customer_payment_methods',
  id: string,
): Promise<number> {
  const { data } = await client.from(table).select('id').eq('id', id)
  return data?.length ?? 0
}

describeReal('RLS per-actor — fixture setup', () => {
  beforeAll(async () => {
    admin = createClient<Database>(supabaseUrl!, serviceRoleKey!)

    ids.customerA = await createUser(emails.customerA, 'customer')
    ids.customerB = await createUser(emails.customerB, 'customer')
    ids.workerA = await createUser(emails.workerA, 'worker')
    ids.workerB = await createUser(emails.workerB, 'worker')

    // Trigger defaults new profiles to role=customer (security hardening C2); upgrade workers.
    await new Promise((r) => setTimeout(r, 700))
    for (const customer of ['customerA', 'customerB'] as const) {
      const { error } = await admin.from('customer_profiles').upsert({
        id: ids[customer],
        building_name: 'RLS Test Tower',
        unit_number: customer === 'customerA' ? 'A1' : 'B1',
        floor: '1',
        district: 'quan_1',
      })
      if (error) throw new Error(`customer_profile ${customer}: ${error.message}`)
    }
    const refundAccount = await admin
      .from('customer_payment_methods')
      .insert({
        account_holder_name: 'RLS CUSTOMER A',
        bank_account: '123456789',
        bank_account_masked: '**** 6789',
        bank_key: 'techcombank',
        bank_name: 'Techcombank',
        customer_id: ids.customerA,
        is_default: true,
        status: 'pending_verification',
      })
      .select('id')
      .single()
    if (refundAccount.error) throw new Error(`customer_payment_method ${refundAccount.error.message}`)
    refundAccountId = refundAccount.data!.id
    for (const w of ['workerA', 'workerB'] as const) {
      await admin.from('profiles').update({ role: 'worker' as const }).eq('id', ids[w])
      const { error } = await admin.from('worker_profiles').upsert({
        id: ids[w],
        service_types: ['electrical'],
        districts: ['quan_1'],
        is_approved: true,
        is_available: true,
        is_suspended: false,
        rating: 4.5,
        total_jobs: 3,
      })
      if (error) throw new Error(`worker_profile ${w}: ${error.message}`)
    }

    // Job owned by customerA, assigned to workerA — created via the proven lifecycle path.
    const inserted = await admin
      .from('jobs')
      .insert({
        customer_id: ids.customerA,
        service_type: 'electrical',
        description: 'RLS per-actor integration fixture',
        problem_chips: [],
        photo_urls: [],
        status: 'draft',
        address_building: 'Test Tower',
        address_unit: '1205',
        address_floor: '12',
        address_district: 'quan_1',
      })
      .select('id')
      .single()
    if (inserted.error) throw new Error(`job insert: ${inserted.error.message}`)
    jobId = inserted.data!.id

    await admin.from('jobs').update({ status: 'analyzing' }).eq('id', jobId)
    await admin
      .from('jobs')
      .update({
        status: 'estimate_ready',
        kael_problem_identified: 'fixture',
        kael_complexity: 'medium',
        kael_price_min: 200000,
        kael_price_max: 500000,
        estimate_ready_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    await admin.from('jobs').update({ status: 'awaiting_customer_confirm' }).eq('id', jobId)
    await admin
      .from('jobs')
      .update({ status: 'broadcasting', broadcast_at: new Date().toISOString(), final_price: 500000 })
      .eq('id', jobId)
    const matched = await admin
      .from('jobs')
      .update({ status: 'worker_matched', worker_id: ids.workerA })
      .eq('id', jobId)
    if (matched.error) throw new Error(`assign worker: ${matched.error.message}`)

    const workerStats = await admin.from('worker_stats').upsert({ worker_id: ids.workerA })
    if (workerStats.error) throw new Error(`worker_stats: ${workerStats.error.message}`)
    const customerStats = await admin.from('customer_stats').upsert({ customer_id: ids.customerA })
    if (customerStats.error) throw new Error(`customer_stats: ${customerStats.error.message}`)

    authed.customerA = await signIn(emails.customerA)
    authed.customerB = await signIn(emails.customerB)
    authed.workerA = await signIn(emails.workerA)
    authed.workerB = await signIn(emails.workerB)
  }, 30_000)

  it('created 4 users, 2 worker_profiles, 1 assigned job', () => {
    expect(ids.customerA && ids.customerB && ids.workerA && ids.workerB).toBeTruthy()
    expect(jobId).not.toBeNull()
  })
})

describeReal('RLS — jobs visibility (is_job_participant)', () => {
  it('owner customer sees own job', async () => {
    expect(await visibleCount(authed.customerA, 'jobs', jobId!)).toBe(1)
  })
  it('assigned worker sees the job', async () => {
    expect(await visibleCount(authed.workerA, 'jobs', jobId!)).toBe(1)
  })
  it('other customer CANNOT see the job', async () => {
    expect(await visibleCount(authed.customerB, 'jobs', jobId!)).toBe(0)
  })
  it('non-assigned worker CANNOT see the job', async () => {
    expect(await visibleCount(authed.workerB, 'jobs', jobId!)).toBe(0)
  })
})

describeReal('RLS — worker_profiles PII isolation', () => {
  it('worker sees own worker_profile', async () => {
    expect(await visibleCount(authed.workerA, 'worker_profiles', ids.workerA)).toBe(1)
  })
  it('worker CANNOT see another worker_profile (cccd/bank PII)', async () => {
    expect(await visibleCount(authed.workerB, 'worker_profiles', ids.workerA)).toBe(0)
  })
  it('customer CANNOT read worker_profiles directly', async () => {
    expect(await visibleCount(authed.customerA, 'worker_profiles', ids.workerA)).toBe(0)
  })
})

describeReal('RLS — customer_profiles ownership', () => {
  it('customer sees own customer_profile', async () => {
    expect(await visibleCount(authed.customerA, 'customer_profiles', ids.customerA)).toBe(1)
  })
  it('other customer CANNOT see it', async () => {
    expect(await visibleCount(authed.customerB, 'customer_profiles', ids.customerA)).toBe(0)
  })
})

describeReal('RLS — customer refund-account isolation', () => {
  it('customer sees only the own masked record', async () => {
    const own = await authed.customerA
      .from('customer_payment_methods')
      .select('id, bank_account_masked')
      .eq('id', refundAccountId!)
    const other = await authed.customerB
      .from('customer_payment_methods')
      .select('id')
      .eq('id', refundAccountId!)

    expect(own.data).toEqual([{ id: refundAccountId, bank_account_masked: '**** 6789' }])
    expect(other.data?.length ?? 0).toBe(0)
  })

  it('customer cannot select the raw bank-account column or write the table directly', async () => {
    const rawRead = await authed.customerA
      .from('customer_payment_methods')
      .select('bank_account')
      .eq('id', refundAccountId!)
    const directWrite = await authed.customerA
      .from('customer_payment_methods')
      .update({ bank_name: 'Forged bank' })
      .eq('id', refundAccountId!)

    expect(rawRead.error).not.toBeNull()
    expect(directWrite.error).not.toBeNull()
  })
})

describeReal('RLS — anon denied (defense in depth)', () => {
  it('anon cannot read jobs or worker_profiles', async () => {
    const anon = createClient<Database>(supabaseUrl!, anonKey!)
    const jobs = await anon.from('jobs').select('id').limit(1)
    const workers = await anon.from('worker_profiles').select('id').limit(1)
    expect(jobs.error !== null || (jobs.data?.length ?? 0) === 0).toBe(true)
    expect(workers.error !== null || (workers.data?.length ?? 0) === 0).toBe(true)
  })
})

describeReal('RLS — worker_stats / customer_stats / overview views (P3a)', () => {
  it('worker sees own worker_stats; another worker and a customer cannot', async () => {
    const own = await authed.workerA.from('worker_stats').select('worker_id').eq('worker_id', ids.workerA)
    const otherWorker = await authed.workerB.from('worker_stats').select('worker_id').eq('worker_id', ids.workerA)
    const customer = await authed.customerA.from('worker_stats').select('worker_id').eq('worker_id', ids.workerA)
    expect(own.data?.length ?? 0).toBe(1)
    expect(otherWorker.data?.length ?? 0).toBe(0)
    expect(customer.data?.length ?? 0).toBe(0)
  })

  it('customer sees own customer_stats; another customer cannot', async () => {
    const own = await authed.customerA.from('customer_stats').select('customer_id').eq('customer_id', ids.customerA)
    const other = await authed.customerB.from('customer_stats').select('customer_id').eq('customer_id', ids.customerA)
    expect(own.data?.length ?? 0).toBe(1)
    expect(other.data?.length ?? 0).toBe(0)
  })

  it('worker_overview is RLS-gated per worker (security_invoker)', async () => {
    const own = await authed.workerA.from('worker_overview').select('worker_id').eq('worker_id', ids.workerA)
    const other = await authed.workerB.from('worker_overview').select('worker_id').eq('worker_id', ids.workerA)
    expect(own.data?.length ?? 0).toBe(1)
    expect(other.data?.length ?? 0).toBe(0)
  })

  it('customer_overview is RLS-gated per customer (security_invoker)', async () => {
    const own = await authed.customerA.from('customer_overview').select('customer_id').eq('customer_id', ids.customerA)
    const other = await authed.customerB.from('customer_overview').select('customer_id').eq('customer_id', ids.customerA)
    expect(own.data?.length ?? 0).toBe(1)
    expect(other.data?.length ?? 0).toBe(0)
  })
})

describeReal('RLS per-actor — cleanup', () => {
  afterAll(async () => {
    if (refundAccountId) await admin.from('customer_payment_methods').delete().eq('id', refundAccountId)
    if (jobId) await admin.from('jobs').delete().eq('id', jobId)
    for (const w of ['workerA', 'workerB'] as const) {
      if (ids[w]) await admin.from('worker_profiles').delete().eq('id', ids[w])
    }
    for (const key of ['customerA', 'customerB', 'workerA', 'workerB'] as const) {
      if (ids[key]) {
        await admin.from('customer_profiles').delete().eq('id', ids[key])
        await admin.auth.admin.deleteUser(ids[key])
      }
    }
  })

})
