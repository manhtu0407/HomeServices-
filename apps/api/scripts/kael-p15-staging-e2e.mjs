#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { spawnSync } from 'child_process'
import { performance } from 'perf_hooks'

export const P15_CASE_MATRIX = [
  { id: 'normal_transaction', plannedRuns: 10 },
  { id: 'demanding_customer', plannedRuns: 5 },
  { id: 'worker_cancellation', plannedRuns: 10 },
  { id: 'customer_cancellation', plannedRuns: 5 },
  { id: 'dispute', plannedRuns: 3 },
]

export const P15_ACCEPTANCE_LIMITS = {
  intakeP95Ms: 12_000,
  worstTransactionCostUsd: 0.30,
}

const STAGING_REF = 'xyylanuyflrjzbjzhqfl'
const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'
const PASSWORD = 'P15-staging-e2e-Temp-12345!'
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const DEFAULT_REPORT_PATH = resolve(
  REPO_ROOT,
  'docs/test-logs/2026-05-26_p15-staging-e2e.md',
)

const SERVICE_SCENARIOS = [
  {
    service_type: 'electrical',
    description: 'P15 staging: CB tong bi nhay lien tuc trong can ho, can tho kiem tra an toan.',
    problem_chips: ['CB nhay lien tuc'],
  },
  {
    service_type: 'plumbing',
    description: 'P15 staging: Bon rua chen bi ro nuoc duoi lavabo, can thay gioang va kiem tra ong.',
    problem_chips: ['Ro nuoc lavabo'],
  },
  {
    service_type: 'cleaning',
    description: 'P15 staging: Can ve sinh can ho sau chuyen nha, uu tien bep va nha tam.',
    problem_chips: ['Ve sinh can ho'],
  },
]

const WORKER_CANCEL_REASONS = [
  {
    reason: 'Toi bi cap cuu y te dot xuat va co anh giay hen benh vien kem theo.',
    evidence_photo_urls: ['https://example.com/p15-worker-medical.jpg'],
  },
  {
    reason: 'Xe cua toi bi hong giua duong, toi co anh hien trang xe bi hong.',
    evidence_photo_urls: ['https://example.com/p15-worker-vehicle.jpg'],
  },
  {
    reason: 'Cong viec phuc tap hon mo ta ban dau rat nhieu va can admin xem xet.',
    evidence_photo_urls: [],
  },
  {
    reason: 'Dieu kien tai nha khong an toan, khu vuc thi cong co mui chay va day dien lo.',
    evidence_photo_urls: [],
  },
  {
    reason: 'Toi doi y va khong muon tiep tuc nhan viec nay nua.',
    evidence_photo_urls: [],
  },
]

const CUSTOMER_CANCEL_PRESETS = [
  { expectedSubCase: 'before_a7', status: 'awaiting_customer_confirm', reason_code: 'changed_mind' },
  { expectedSubCase: 'after_a7_before_worker_accept', status: 'broadcasting', reason_code: 'found_alternative' },
  { expectedSubCase: 'after_worker_accept', status: 'worker_matched', reason_code: 'worker_not_trustworthy_claim' },
  { expectedSubCase: 'after_worker_completed_trigger_dispute', status: 'completed_by_worker', reason_code: 'pricing_disagreement_late' },
  { expectedSubCase: 'scheduled_job', status: 'worker_matched', reason_code: 'personal_emergency_with_note', scheduled: true },
]

const DISPUTE_PRESETS = [
  {
    dispute_type: 'completion_rejected',
    initiatedBy: 'customer',
    outcome: 'no_fault_both',
  },
  {
    dispute_type: 'damage_claim',
    initiatedBy: 'customer',
    outcome: 'customer_favor_partial',
  },
  {
    dispute_type: 'abusive_behavior_customer',
    initiatedBy: 'worker',
    outcome: 'mutual_warning',
  },
]

function readEnv(name, fallbackNames = []) {
  const names = [name, ...fallbackNames]
  for (const key of names) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function requireEnv(name, fallbackNames = []) {
  const value = readEnv(name, fallbackNames)
  if (!value) throw new Error(`Missing required env: ${[name, ...fallbackNames].join(' or ')}`)
  return value
}

function assertStagingUrl(value, label) {
  if (!value.includes(STAGING_REF)) {
    throw new Error(`${label} must target staging ref ${STAGING_REF}`)
  }
  if (value.includes(PRODUCTION_REF)) {
    throw new Error(`${label} points at production ref ${PRODUCTION_REF}`)
  }
}

function timeoutFetch(timeoutMs) {
  return async (url, options = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}

function createSupabase(url, key, timeoutMs = 60_000) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timeoutFetch(timeoutMs) },
  })
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

function roundMs(value) {
  return Math.round(value)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

class P15Harness {
  constructor(config) {
    this.config = config
    this.runId = `p15-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    this.admin = createSupabase(config.supabaseUrl, config.serviceRoleKey)
    this.anon = createSupabase(config.supabaseUrl, config.anonKey)
    this.fixtures = {
      users: [],
      jobIds: [],
      intakeJobIds: [],
      disputeIds: [],
    }
    this.results = {
      serviceSmoke: null,
      realtime: null,
      cases: Object.fromEntries(P15_CASE_MATRIX.map((item) => [item.id, []])),
      timings: {
        intakeMs: [],
        apiMs: [],
      },
      costs: {
        totalUsd: 0,
        worstTransactionUsd: 0,
        jobsWithApiLogs: 0,
        providerRows: 0,
        byJobId: {},
      },
      cleanup: null,
      limitations: [],
    }
  }

  async setupActors() {
    this.customers = []
    this.workers = []

    for (let i = 0; i < 5; i += 1) {
      this.customers.push(await this.createActor('customer', i + 1))
    }
    for (let i = 0; i < 5; i += 1) {
      this.workers.push(await this.createActor('worker', i + 1))
    }
    this.adminActor = await this.createActor('admin', 1)
  }

  async createActor(role, index) {
    const email = `${this.runId}-${role}-${index}@p15.staging.test`
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role, full_name: `P15 ${role} ${index}` },
    })
    if (error || !data.user) throw new Error(`createUser ${role}-${index}: ${error?.message}`)
    const id = data.user.id
    this.fixtures.users.push(id)

    await this.must(
      this.admin.from('profiles').upsert({
        id,
        role,
        full_name: `P15 ${role} ${index}`,
      }),
      `profile upsert ${role}-${index}`,
    )

    if (role === 'customer') {
      await this.must(
        this.admin.from('customer_profiles').upsert({
          id,
          building_name: 'P15 Staging Tower',
          unit_number: `A-${index}01`,
          floor: `${index}`,
          district: 'q1',
        }),
        `customer profile ${index}`,
      )
    }

    if (role === 'worker') {
      await this.must(
        this.admin.from('worker_profiles').upsert({
          id,
          legal_name: `P15 Worker ${index}`,
          date_of_birth: '1990-01-01',
          gender: 'other',
          service_types: ['electrical', 'plumbing', 'cleaning'],
          years_experience: 5 + index,
          districts: ['q1', 'q3', 'q7', 'binh_thanh', 'thu_duc'],
          home_lat: 10.776 + index / 1000,
          home_lng: 106.700 + index / 1000,
          service_radius_km: 20,
          problem_specializations: ['p15_staging'],
          cccd_front_url: 'https://example.com/p15-cccd-front.jpg',
          cccd_back_url: 'https://example.com/p15-cccd-back.jpg',
          selfie_url: 'https://example.com/p15-selfie.jpg',
          bank_account: `000000000${index}`,
          bank_name: 'P15 Test Bank',
          verification_status: 'approved',
          is_approved: true,
          is_available: true,
          is_suspended: false,
          rating: 4.8,
          total_jobs: 20 + index,
        }),
        `worker profile ${index}`,
      )
    }

    const client = createSupabase(this.config.supabaseUrl, this.config.anonKey)
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD })
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(`signIn ${role}-${index}: ${signedIn.error?.message}`)
    }
    return {
      id,
      role,
      email,
      client,
      accessToken: signedIn.data.session.access_token,
    }
  }

  async must(query, label) {
    const { error, data } = await query
    if (error) throw new Error(`${label}: ${error.message}`)
    return data
  }

  async api(actor, method, path, body = undefined, timeoutMs = 75_000) {
    const url = `${this.config.apiBaseUrl}${path}`
    const started = performance.now()
    const response = await timeoutFetch(timeoutMs)(url, {
      method,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${actor.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const durationMs = performance.now() - started
    this.results.timings.apiMs.push(durationMs)
    const text = await response.text()
    let json = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = { raw: text }
      }
    }
    if (!response.ok) {
      throw new Error(`${method} ${path} failed ${response.status}: ${JSON.stringify(json)}`)
    }
    return { status: response.status, json, durationMs }
  }

  async run() {
    await this.setupActors()
    await this.verifyServicesRoute()
    await this.verifyRealtimeProgress()
    await this.runCase1NormalTransactions()
    await this.runCase2DemandingCustomers()
    await this.runCase3ExplicitWorkerCancels()
    await this.runCase4CustomerCancels()
    await this.runCase5Disputes()
    await this.runCase3NoShows()
    await this.collectCosts()
    this.assertAcceptanceBeforeCleanup()
  }

  async verifyServicesRoute() {
    const res = await this.api(this.customers[0], 'GET', '/services')
    const services = res.json?.services ?? []
    const serviceTypes = services.map((item) => item.service_type)
    assert(serviceTypes.includes('electrical'), 'services missing electrical')
    assert(serviceTypes.includes('plumbing'), 'services missing plumbing')
    assert(serviceTypes.includes('cleaning'), 'services missing cleaning')
    this.results.serviceSmoke = { serviceTypes, count: services.length }
  }

  async verifyRealtimeProgress() {
    const customer = this.customers[0]
    const jobId = await this.insertFixtureJob({
      customer,
      status: 'analyzing',
      service_type: 'electrical',
    })

    if (customer.client.realtime?.setAuth) {
      customer.client.realtime.setAuth(customer.accessToken)
    }
    const channelName = `p15-progress-${this.runId}`
    const channel = customer.client.channel(channelName)

    let subscribed = false
    let received = null
    const statuses = []
    let updateTimer = null
    let progressSeq = 0
    const eventPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Realtime kael_progress event timeout; statuses=${statuses.join(',')}`)),
        30_000,
      )
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          const progress = payload.new?.kael_progress
          if (progress?.stage === 'p15_realtime') {
            clearTimeout(timer)
            if (updateTimer) clearInterval(updateTimer)
            received = progress
            resolve(progress)
          }
        },
      )
      channel.subscribe((status) => {
        statuses.push(status)
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !received) {
          clearTimeout(timer)
          reject(new Error(`Realtime channel failed before event: ${status}`))
          return
        }
        if (status === 'SUBSCRIBED' && !subscribed) {
          subscribed = true
          const sendProgress = () => {
            progressSeq += 1
            this.admin
              .from('jobs')
              .update({
                kael_progress: {
                  stage: 'p15_realtime',
                  run_id: this.runId,
                  seq: progressSeq,
                  updated_at: new Date().toISOString(),
                },
              })
              .eq('id', jobId)
              .then(({ error }) => {
                if (error) {
                  clearTimeout(timer)
                  if (updateTimer) clearInterval(updateTimer)
                  reject(new Error(`Realtime progress update failed: ${error.message}`))
                }
              })
          }
          sendProgress()
          updateTimer = setInterval(sendProgress, 2_000)
        }
      })
    })

    try {
      await eventPromise
    } finally {
      if (updateTimer) clearInterval(updateTimer)
      await customer.client.removeChannel(channel)
    }
    this.results.realtime = { ok: true, jobId, progress: received }
  }

  async runCase1NormalTransactions() {
    for (let i = 0; i < 10; i += 1) {
      const customer = this.customers[i % this.customers.length]
      const outcome = await this.runEdgeTransaction({
        caseId: 'normal_transaction',
        customer,
        scenarioIndex: i,
        review: true,
      })
      this.results.cases.normal_transaction.push(outcome)
    }
  }

  async runCase2DemandingCustomers() {
    for (let i = 0; i < 5; i += 1) {
      const customer = this.customers[i % this.customers.length]
      const outcome = await this.runEdgeTransaction({
        caseId: 'demanding_customer',
        customer,
        scenarioIndex: i,
        review: false,
        stopAfterAccept: true,
      })
      const jobId = outcome.jobId
      const pressureMessage =
        'Toi yeu cau giam gia ngay, neu khong toi se khieu nai va doi hoan tien. Hay chuyen admin xu ly.'
      const sent = await this.api(customer, 'POST', `/jobs/${jobId}/messages`, {
        content: pressureMessage,
      })
      assert(sent.json?.message?.sender_role === 'customer', 'demanding message not stored')
      const { data: queueRows, error: queueError } = await this.admin
        .from('kael_admin_queue')
        .select('id, priority, escalation_level, reason_code')
        .eq('job_id', jobId)
        .eq('queue_type', 'demanding_customer')
      if (queueError) throw new Error(`demanding queue query: ${queueError.message}`)
      assert((queueRows ?? []).length >= 1, 'demanding customer did not create admin queue row')
      const { data: messages, error: messageError } = await this.admin
        .from('chat_messages')
        .select('sender_role, content')
        .eq('job_id', jobId)
        .eq('sender_role', 'kael')
      if (messageError) throw new Error(`demanding Kael message query: ${messageError.message}`)
      assert((messages ?? []).length >= 1, 'demanding customer did not get Kael response')
      await this.completeMatchedJob(customer, outcome.worker, jobId, false)
      this.results.cases.demanding_customer.push({
        ...outcome,
        adminQueueRows: queueRows.length,
        kaelMessages: messages.length,
      })
    }
  }

  async runCase3ExplicitWorkerCancels() {
    for (let i = 0; i < WORKER_CANCEL_REASONS.length; i += 1) {
      const customer = this.customers[i % this.customers.length]
      const outcome = await this.runEdgeTransaction({
        caseId: 'worker_cancellation',
        customer,
        scenarioIndex: i,
        stopAfterAccept: true,
      })
      const reason = WORKER_CANCEL_REASONS[i]
      const res = await this.api(outcome.worker, 'POST', `/jobs/${outcome.jobId}/worker-cancellation`, reason)
      assert(res.json?.cancellation_id, 'worker cancellation missing cancellation_id')
      assert(Array.isArray(res.json?.fallback_options), 'worker cancellation missing fallback options')
      assert(res.json?.job_status, 'worker cancellation missing job_status')
      this.results.cases.worker_cancellation.push({
        subCase: 'explicit_cancel',
        jobId: outcome.jobId,
        cancellationId: res.json.cancellation_id,
        reasonCode: res.json.reason_code,
        reasonCategory: res.json.reason_category,
        adminReviewRequired: Boolean(res.json.admin_review_required),
        broadcastSent: Boolean(res.json.broadcast_sent),
      })
    }
  }

  async runCase3NoShows() {
    const pNow = '2026-01-01T00:20:00.000Z'
    for (let i = 0; i < 5; i += 1) {
      await this.insertFixtureJob({
        customer: this.customers[i % this.customers.length],
        worker: this.workers[i % this.workers.length],
        status: 'worker_matched',
        service_type: 'plumbing',
        matched_at: '2026-01-01T00:00:00.000Z',
        final_price: 550_000,
      })
    }
    const { data, error } = await this.admin.rpc('enqueue_worker_no_show_reviews', {
      p_now: pNow,
    })
    if (error) throw new Error(`enqueue_worker_no_show_reviews: ${error.message}`)
    const p15Rows = (data ?? []).filter((row) => this.fixtures.jobIds.includes(row.job_id_out))
    assert(p15Rows.length === 5, `expected 5 no-show rows, got ${p15Rows.length}`)
    for (const row of p15Rows) {
      this.results.cases.worker_cancellation.push({
        subCase: 'no_show',
        jobId: row.job_id_out,
        workerId: row.worker_id_out,
        reasonCode: row.reason_code,
        fallbackOptionsCount: Array.isArray(row.fallback_options) ? row.fallback_options.length : 0,
      })
    }
  }

  async runCase4CustomerCancels() {
    for (let i = 0; i < CUSTOMER_CANCEL_PRESETS.length; i += 1) {
      const preset = CUSTOMER_CANCEL_PRESETS[i]
      const customer = this.customers[i % this.customers.length]
      const worker = this.workers[i % this.workers.length]
      const jobId = await this.insertFixtureJob({
        customer,
        worker: preset.status === 'awaiting_customer_confirm' || preset.status === 'broadcasting' ? null : worker,
        status: preset.status,
        service_type: 'cleaning',
        scheduled_at: preset.scheduled ? new Date(Date.now() + 86_400_000).toISOString() : null,
        final_price: preset.status === 'awaiting_customer_confirm' ? null : 480_000,
        completed_at: preset.status === 'completed_by_worker' ? new Date().toISOString() : null,
      })
      const res = await this.api(customer, 'POST', `/jobs/${jobId}/customer-cancellation`, {
        reason_code: preset.reason_code,
        reason_note: 'P15 staging verifies customer cancellation timing sub-case.',
      })
      assert(res.json?.sub_case === preset.expectedSubCase, `expected ${preset.expectedSubCase}, got ${res.json?.sub_case}`)
      assert(res.json?.phase0_no_monetary_penalty === true, 'customer cancellation must be phase0 no-penalty')
      this.results.cases.customer_cancellation.push({
        jobId,
        subCase: res.json.sub_case,
        jobStatus: res.json.job_status,
        reasonCategory: res.json.reason_category,
        adminReviewRequired: Boolean(res.json.admin_review_required),
      })
    }
  }

  async runCase5Disputes() {
    for (let i = 0; i < DISPUTE_PRESETS.length; i += 1) {
      const preset = DISPUTE_PRESETS[i]
      const customer = this.customers[i % this.customers.length]
      const worker = this.workers[i % this.workers.length]
      const jobId = await this.insertFixtureJob({
        customer,
        worker,
        status: 'confirmed_by_customer',
        service_type: i === 1 ? 'plumbing' : 'electrical',
        final_price: 650_000,
        completed_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      })
      const opener = preset.initiatedBy === 'worker' ? worker : customer
      const counterParty = preset.initiatedBy === 'worker' ? customer : worker
      const opened = await this.api(opener, 'POST', `/jobs/${jobId}/disputes`, {
        dispute_type: preset.dispute_type,
        initiator_statement:
          'P15 staging dispute statement with enough detail for neutral evidence locking and admin review.',
        evidence_photo_urls: ['https://example.com/p15-dispute-evidence.jpg'],
      })
      const disputeId = opened.json?.dispute_id
      assert(disputeId, 'dispute missing dispute_id')
      this.fixtures.disputeIds.push(disputeId)
      assert(opened.json?.evidence_snapshot_id, 'dispute missing evidence snapshot')

      const counter = await this.api(counterParty, 'POST', `/disputes/${disputeId}/counter-statement`, {
        statement: 'P15 staging counter statement records the other party view neutrally for admin review.',
      })
      assert(counter.json?.counter_party_statement_submitted === true, 'counter statement not accepted')

      const decided = await this.api(this.adminActor, 'POST', `/disputes/${disputeId}/admin-decision`, {
        outcome: preset.outcome,
        customer_trust_impact: 'none',
        worker_action: 'none',
        reasoning:
          'P15 staging admin decision records a neutral operational resolution with no Kael-authored money suggestion.',
      })
      assert(decided.json?.status === 'admin_decided', `dispute not admin_decided: ${decided.json?.status}`)
      const { data: queueRows, error: queueError } = await this.admin
        .from('kael_admin_queue')
        .select('id, queue_type, priority')
        .eq('job_id', jobId)
        .eq('queue_type', 'dispute_review')
      if (queueError) throw new Error(`dispute queue query: ${queueError.message}`)
      assert((queueRows ?? []).length >= 1, 'dispute did not create admin queue row')
      this.results.cases.dispute.push({
        jobId,
        disputeId,
        disputeType: preset.dispute_type,
        queueRows: queueRows.length,
        status: decided.json.status,
      })
    }
  }

  async runEdgeTransaction({
    caseId,
    customer,
    scenarioIndex,
    review = false,
    stopAfterAccept = false,
  }) {
    const scenario = SERVICE_SCENARIOS[scenarioIndex % SERVICE_SCENARIOS.length]
    const create = await this.api(customer, 'POST', '/jobs', {
      ...scenario,
      address_building: 'P15 Staging Tower',
      address_unit: `A-${scenarioIndex + 1}01`,
      address_floor: `${scenarioIndex + 1}`,
      address_district: 'q1',
    })
    const jobId = create.json?.job_id
    assert(jobId, `${caseId}: create job missing job_id`)
    this.fixtures.jobIds.push(jobId)
    this.fixtures.intakeJobIds.push(jobId)
    this.results.timings.intakeMs.push(create.durationMs)
    assert(create.json?.status === 'awaiting_customer_confirm', `${caseId}: job not awaiting customer confirm`)
    assert(create.json?.estimate?.price_max > 0, `${caseId}: missing Kael estimate`)

    const confirmed = await this.api(customer, 'POST', `/jobs/${jobId}/confirm-search`)
    assert(
      confirmed.json?.broadcast_sent === true,
      `${caseId}: broadcast was not sent; message=${confirmed.json?.message ?? 'none'}`,
    )
    const worker = await this.findBroadcastWorker(jobId)
    const accepted = await this.api(worker, 'POST', `/jobs/${jobId}/accept`)
    assert(accepted.json?.status === 'worker_matched', `${caseId}: worker accept did not match`)

    if (stopAfterAccept) {
      return { jobId, worker, intakeMs: create.durationMs, estimateMax: create.json.estimate.price_max }
    }

    await this.completeMatchedJob(customer, worker, jobId, review)
    if (review) {
      const { data: job, error } = await this.admin
        .from('jobs')
        .select('status, final_price, kael_price_max')
        .eq('id', jobId)
        .single()
      if (error) throw new Error(`${caseId}: final job query ${error.message}`)
      assert(job.status === 'reviewed', `${caseId}: final status ${job.status}`)
      assert(job.final_price === job.kael_price_max, `${caseId}: final price is not Kael price max`)
    }
    return { jobId, worker, intakeMs: create.durationMs, estimateMax: create.json.estimate.price_max }
  }

  async completeMatchedJob(customer, worker, jobId, review) {
    const steps = [
      { status: 'worker_on_way' },
      { status: 'arrived' },
      { status: 'inspecting' },
      { status: 'repairing' },
      {
        status: 'completed_by_worker',
        completion_notes: 'P15 staging completion notes: scope completed and customer can verify.',
        completion_photo_urls: ['https://example.com/p15-completion.jpg'],
      },
    ]
    for (const step of steps) {
      const res = await this.api(worker, 'PATCH', `/jobs/${jobId}/status`, step)
      assert(res.json?.to_status === step.status, `status update did not reach ${step.status}`)
    }
    const confirmed = await this.api(customer, 'POST', `/jobs/${jobId}/confirm-completion`)
    assert(confirmed.json?.status === 'confirmed_by_customer', 'customer confirm did not set confirmed_by_customer')
    if (review) {
      const reviewed = await this.api(customer, 'POST', `/jobs/${jobId}/review`, {
        rating: 5,
        tags: ['p15_staging', 'dung_gio'],
        comment: 'P15 staging normal transaction reviewed after completion.',
      })
      assert(reviewed.json?.status === 'reviewed', 'review did not transition job to reviewed')
    }
    const availability = await this.api(worker, 'PATCH', '/workers/me/availability', {
      is_available: true,
    })
    assert(availability.json?.is_available === true, 'worker did not return online after completed job')
  }

  async findBroadcastWorker(jobId) {
    const { data, error } = await this.admin
      .from('job_broadcasts')
      .select('worker_id, status')
      .eq('job_id', jobId)
      .eq('status', 'sent')
    if (error) throw new Error(`broadcast query ${jobId}: ${error.message}`)
    for (const row of data ?? []) {
      const worker = this.workers.find((item) => item.id === row.worker_id)
      if (worker) return worker
    }
    throw new Error(`no P15 worker received broadcast for ${jobId}`)
  }

  async insertFixtureJob({
    customer,
    worker = null,
    status,
    service_type,
    scheduled_at = null,
    matched_at = null,
    completed_at = null,
    confirmed_at = null,
    final_price = 600_000,
  }) {
    const now = new Date().toISOString()
    const row = {
      customer_id: customer.id,
      worker_id: worker?.id ?? null,
      service_type,
      description: `P15 staging fixture ${status} for ${service_type}`,
      problem_chips: ['p15_fixture'],
      photo_urls: [],
      address_building: 'P15 Staging Tower',
      address_unit: 'Fixture',
      address_floor: '1',
      address_district: 'q1',
      scheduled_at,
      status,
      kael_problem_identified: 'P15 staging fixture issue',
      kael_complexity: 'medium',
      kael_price_min: final_price === null ? null : Math.max(150_000, final_price - 200_000),
      kael_price_max: final_price,
      kael_advisory: null,
      estimate_ready_at: now,
      confirmed_search_at: status === 'broadcasting' ? now : null,
      broadcast_at: status === 'broadcasting' ? now : null,
      matched_at: matched_at ?? (worker ? now : null),
      arrived_at: null,
      completed_at,
      confirmed_at,
      final_price,
      completion_notes: completed_at ? 'P15 staging fixture completion.' : null,
      completion_photo_urls: completed_at ? ['https://example.com/p15-fixture-complete.jpg'] : [],
    }
    const { data, error } = await this.admin.from('jobs').insert(row).select('id').single()
    if (error || !data) throw new Error(`insert fixture job ${status}: ${error?.message}`)
    this.fixtures.jobIds.push(data.id)
    return data.id
  }

  async collectCosts() {
    const { data, error } = await this.admin
      .from('api_logs')
      .select('job_id, provider, purpose, cost_usd, latency_ms, success')
      .in('job_id', this.fixtures.jobIds)
    if (error) throw new Error(`api_logs cost query: ${error.message}`)
    const rows = data ?? []
    const byJobId = {}
    for (const row of rows) {
      const jobId = row.job_id
      if (!jobId) continue
      byJobId[jobId] ??= { totalUsd: 0, rows: 0, providers: new Set() }
      byJobId[jobId].totalUsd += Number(row.cost_usd ?? 0)
      byJobId[jobId].rows += 1
      if (row.provider) byJobId[jobId].providers.add(row.provider)
    }
    const missingIntakeLogs = this.fixtures.intakeJobIds.filter((jobId) => !byJobId[jobId])
    if (missingIntakeLogs.length > 0) {
      throw new Error(`missing api_logs for intake jobs: ${missingIntakeLogs.join(', ')}`)
    }
    const costs = Object.fromEntries(
      Object.entries(byJobId).map(([jobId, value]) => [
        jobId,
        {
          totalUsd: value.totalUsd,
          rows: value.rows,
          providers: Array.from(value.providers),
        },
      ]),
    )
    const totals = Object.values(costs).map((item) => item.totalUsd)
    this.results.costs = {
      totalUsd: totals.reduce((sum, value) => sum + value, 0),
      worstTransactionUsd: totals.length ? Math.max(...totals) : 0,
      jobsWithApiLogs: Object.keys(costs).length,
      providerRows: rows.length,
      byJobId: costs,
    }
  }

  assertAcceptanceBeforeCleanup() {
    assert(this.results.cases.normal_transaction.length === 10, 'Case 1 did not run 10 transactions')
    assert(this.results.cases.demanding_customer.length === 5, 'Case 2 did not run 5 demanding customers')
    assert(this.results.cases.worker_cancellation.filter((item) => item.subCase === 'explicit_cancel').length === 5, 'Case 3 explicit cancel count mismatch')
    assert(this.results.cases.worker_cancellation.filter((item) => item.subCase === 'no_show').length === 5, 'Case 3 no-show count mismatch')
    assert(this.results.cases.customer_cancellation.length === 5, 'Case 4 did not cover 5 sub-cases')
    assert(this.results.cases.dispute.length === 3, 'Case 5 did not run 3 disputes')
    assert(this.results.realtime?.ok === true, 'Realtime kael_progress was not verified')

    const intakeP95 = percentile(this.results.timings.intakeMs, 95)
    assert(
      intakeP95 < P15_ACCEPTANCE_LIMITS.intakeP95Ms,
      `intake p95 ${roundMs(intakeP95)}ms exceeds ${P15_ACCEPTANCE_LIMITS.intakeP95Ms}ms`,
    )
    assert(
      this.results.costs.worstTransactionUsd < P15_ACCEPTANCE_LIMITS.worstTransactionCostUsd,
      `worst cost ${this.results.costs.worstTransactionUsd} exceeds ${P15_ACCEPTANCE_LIMITS.worstTransactionCostUsd}`,
    )
  }

  async cleanup() {
    const cleanupSqlOk = await this.cleanupJobRowsWithSql()
    for (const userId of this.fixtures.users) {
      const { error } = await this.admin.auth.admin.deleteUser(userId)
      if (error) this.results.limitations.push(`delete auth user ${userId}: ${error.message}`)
    }
    const verified = await this.verifyCleanup()
    this.results.cleanup = { cleanupSqlOk, ...verified }
    if (!verified.ok) {
      throw new Error(`cleanup verification failed: ${JSON.stringify(verified)}`)
    }
  }

  async cleanupJobRowsWithSql() {
    const jobIds = Array.from(new Set(this.fixtures.jobIds))
    if (jobIds.length === 0) return true
    const cli = this.config.supabaseCli
    const token = this.config.supabaseAccessToken
    if (!cli || !existsSync(cli)) {
      this.results.limitations.push('Cleanup SQL skipped because P15_SUPABASE_CLI was unavailable.')
      return false
    }
    const uuidArray = `array[${jobIds.map((id) => `'${id}'`).join(',')}]::uuid[]`
    const sql = `
begin;
alter table public.evidence_snapshots disable trigger evidence_snapshots_immutable;
delete from public.disputes where job_id = any(${uuidArray});
delete from public.evidence_snapshots where job_id = any(${uuidArray});
alter table public.evidence_snapshots enable trigger evidence_snapshots_immutable;
delete from public.kael_admin_queue where job_id = any(${uuidArray});
delete from public.kael_interaction_log where job_id = any(${uuidArray});
delete from public.worker_cancellation_requests where job_id = any(${uuidArray});
delete from public.customer_cancellation_records where job_id = any(${uuidArray});
delete from public.scope_change_requests where job_id = any(${uuidArray});
delete from public.job_media_assets where job_id = any(${uuidArray});
delete from public.chat_messages where job_id = any(${uuidArray});
delete from public.job_events where job_id = any(${uuidArray});
delete from public.job_broadcasts where job_id = any(${uuidArray});
delete from public.api_logs where job_id = any(${uuidArray});
delete from public.notifications where job_id = any(${uuidArray});
delete from public.reviews where job_id = any(${uuidArray});
delete from public.jobs where id = any(${uuidArray});
commit;
`
    const tempDir = await mkdtemp(resolve(tmpdir(), 'p15-cleanup-'))
    const sqlPath = resolve(tempDir, 'cleanup.sql')
    await writeFile(sqlPath, sql, 'utf8')
    try {
      const result = spawnSync(
        process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : cli,
        process.platform === 'win32'
          ? ['/d', '/c', `""${cli}" db query --linked --file "${sqlPath}" --output json"`]
          : ['db', 'query', '--linked', '--file', sqlPath, '--output', 'json'],
        {
          cwd: REPO_ROOT,
          env: token ? { ...process.env, SUPABASE_ACCESS_TOKEN: token } : process.env,
          encoding: 'utf8',
          windowsVerbatimArguments: process.platform === 'win32',
          maxBuffer: 10 * 1024 * 1024,
        },
      )
      if (result.status !== 0) {
        throw new Error(result.error?.message || result.stderr || result.stdout || `supabase db query exited ${result.status}`)
      }
      return true
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  async verifyCleanup() {
    const jobIds = Array.from(new Set(this.fixtures.jobIds))
    const userIds = Array.from(new Set(this.fixtures.users))
    const tableCounts = {}
    if (jobIds.length > 0) {
      for (const table of [
        'jobs',
        'job_events',
        'job_broadcasts',
        'chat_messages',
        'reviews',
        'api_logs',
        'kael_admin_queue',
        'kael_interaction_log',
        'worker_cancellation_requests',
        'customer_cancellation_records',
        'disputes',
        'evidence_snapshots',
      ]) {
        const { count, error } = await this.admin
          .from(table)
          .select('id', { count: 'exact', head: true })
          .in(table === 'jobs' ? 'id' : 'job_id', jobIds)
        if (error) throw new Error(`cleanup count ${table}: ${error.message}`)
        tableCounts[table] = count ?? 0
      }
    }

    const { count: profileCount, error: profileError } = await this.admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('id', userIds)
    if (profileError) throw new Error(`cleanup profile count: ${profileError.message}`)
    tableCounts.profiles = profileCount ?? 0

    return {
      ok: Object.values(tableCounts).every((value) => value === 0),
      tableCounts,
    }
  }

  async writeReport(status) {
    const reportPath = this.config.reportPath
    await mkdir(dirname(reportPath), { recursive: true })
    await writeFile(reportPath, this.formatReport(status), 'utf8')
    return reportPath
  }

  formatReport(status) {
    const intake = this.results.timings.intakeMs
    const allApi = this.results.timings.apiMs
    const caseLines = Object.entries(this.results.cases).map(([caseId, rows]) => {
      const suffix = caseId === 'worker_cancellation'
        ? ` (${rows.filter((item) => item.subCase === 'explicit_cancel').length} explicit, ${rows.filter((item) => item.subCase === 'no_show').length} no-show)`
        : ''
      return `- ${caseId}: ${rows.length}${suffix}`
    })
    const customerSubCases = this.results.cases.customer_cancellation
      .map((item) => item.subCase)
      .join(', ')
    const disputeTypes = this.results.cases.dispute
      .map((item) => item.disputeType)
      .join(', ')
    const cleanupCounts = JSON.stringify(this.results.cleanup?.tableCounts ?? {})

    return `Document type:
P15 staging E2E test report
Audience:
Tu, future AI agent, reviewer.
Facts captured:
- Status: ${status}
- Staging ref: ${STAGING_REF}
- Run id: ${this.runId}
- Actors: 5 customers, 5 workers, 1 admin.
- Case matrix:
${caseLines.join('\n')}
- Case 4 sub-cases: ${customerSubCases}
- Case 5 dispute types: ${disputeTypes}
- Realtime kael_progress: ${this.results.realtime?.ok ? 'verified' : 'not verified'}
Decisions:
- Edge mobile-api handled workflow-sensitive actions.
- Direct DB was used only for staging fixtures, timer preconditions, realtime trigger stimulus, metrics, and cleanup.
- Evidence snapshot cleanup used a scoped staging SQL cleanup for tracked P15 job ids only.
Verification:
- Intake latency ms: p50=${roundMs(percentile(intake, 50))}, p95=${roundMs(percentile(intake, 95))}, p99=${roundMs(percentile(intake, 99))}, limit=${P15_ACCEPTANCE_LIMITS.intakeP95Ms}.
- API latency ms: p50=${roundMs(percentile(allApi, 50))}, p95=${roundMs(percentile(allApi, 95))}, p99=${roundMs(percentile(allApi, 99))}.
- Cost USD: total=${this.results.costs.totalUsd.toFixed(6)}, worst_transaction=${this.results.costs.worstTransactionUsd.toFixed(6)}, provider_rows=${this.results.costs.providerRows}, jobs_with_logs=${this.results.costs.jobsWithApiLogs}, limit=${P15_ACCEPTANCE_LIMITS.worstTransactionCostUsd}.
- Cleanup: ok=${this.results.cleanup?.ok === true}, counts=${cleanupCounts}.
Limitations:
${this.results.limitations.length ? this.results.limitations.map((item) => `- ${item}`).join('\n') : '- None observed in this run.'}
Next use:
- Treat this report as the P15 acceptance artifact only when Status is passed and cleanup ok=true.
`
  }
}

function loadConfig() {
  if (process.env.P15_RUN_LIVE !== '1') {
    throw new Error('Set P15_RUN_LIVE=1 to run the mutable staging E2E harness.')
  }
  const supabaseUrl = requireEnv('P15_SUPABASE_URL', [
    'NEXT_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_URL',
  ])
  const anonKey = requireEnv('P15_SUPABASE_ANON_KEY', [
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
  ])
  const serviceRoleKey = requireEnv('P15_SUPABASE_SERVICE_ROLE_KEY', [
    'SUPABASE_SERVICE_ROLE_KEY',
  ])
  const apiBaseUrl = (
    readEnv('P15_API_BASE_URL', ['EXPO_PUBLIC_API_BASE_URL']) ??
    `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mobile-api`
  ).replace(/\/$/, '')
  assertStagingUrl(supabaseUrl, 'P15_SUPABASE_URL')
  assertStagingUrl(apiBaseUrl, 'P15_API_BASE_URL')
  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    apiBaseUrl,
    reportPath: resolve(REPO_ROOT, readEnv('P15_REPORT_PATH') ?? DEFAULT_REPORT_PATH),
    supabaseCli: readEnv('P15_SUPABASE_CLI'),
    supabaseAccessToken: readEnv('SUPABASE_ACCESS_TOKEN'),
  }
}

async function main() {
  const harness = new P15Harness(loadConfig())
  let status = 'failed'
  try {
    await harness.run()
    await harness.cleanup()
    status = 'passed'
    const reportPath = await harness.writeReport(status)
    console.log(JSON.stringify({
      ok: true,
      run_id: harness.runId,
      report_path: reportPath,
      intake_p95_ms: roundMs(percentile(harness.results.timings.intakeMs, 95)),
      worst_transaction_cost_usd: harness.results.costs.worstTransactionUsd,
      cleanup: harness.results.cleanup,
    }, null, 2))
  } catch (error) {
    try {
      await harness.cleanup()
    } catch (cleanupError) {
      harness.results.limitations.push(
        `Cleanup after failure also failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      )
    }
    await harness.writeReport(status)
    throw error
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
