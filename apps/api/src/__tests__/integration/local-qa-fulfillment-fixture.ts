import { randomUUID } from 'node:crypto'
import { expect, type TestContext } from 'vitest'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { createLocalQaHttpHarness, LOCAL_QA_REQUEST_TIMEOUT_MS, localQaRecord as record, type LocalQaActor } from './local-qa-http-harness'

export function createLocalFulfillmentFixture(pillar: PillarManifest) {
  const { target, request, customer, seedRows, dispatchMatching } = createLocalQaHttpHarness(pillar)
  const why = (detail?: string) => pillarWhy(pillar, detail)
  async function prepareAssigned(context: TestContext, options: { apiRoot?: string; paymentRail?: 'platform_bank_manual' } = {}) {
    const base = options.apiRoot ?? '/functions/v1/mobile-api'
    const observe = (result: Awaited<ReturnType<typeof request>>) => {
      if (options.apiRoot) {
        const diagnostic = JSON.stringify({ status: result.status, run_id: result.runId, elapsed_ms: result.elapsedMs })
        expect(result.fixtureProviderCalls, why(`fixture must attest zero inference: ${diagnostic}`)).toBe(0)
        expect(result.fixtureDeniedCalls, why(`fixture must attest zero remote integration attempts: ${diagnostic}`)).toBe(0)
      }
      return result
    }
    const command = async (path: string, actor: LocalQaActor, body: unknown = {}, method = 'POST') => observe(await request(base + path, { method, token: actor.token, key: target?.anonKey, body }))
    const read = async (path: string, actor: LocalQaActor) => observe(await request(base + path, { token: actor.token, key: target?.anonKey }))
    async function attachPhoto(jobId: string, actor: LocalQaActor, stage: 'access_check_in' | 'after') {
      if (!target) throw new Error(why('target absent'))
      const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7b8AAAAASUVORK5CYII=', 'base64')
      const reserved = await command(`/jobs/${jobId}/media-upload`, actor, {
        file_name: 'qa-private-pixel.png', file_size_bytes: bytes.length, mime_type: 'image/png', stage,
      })
      expect(reserved.status, why(`reserve ${stage}`)).toBe(201)
      const intent = record(reserved.payload)
      const signed = new URL(String(intent.signed_upload_url))
      if (![target.url, `http://host.docker.internal:${target.portBase + 1}`].includes(signed.origin) ||
        !signed.pathname.startsWith(`/storage/v1/object/upload/sign/job-media/${jobId}/${stage}/`) || signed.username || signed.password) {
        throw new Error(why('signed upload destination refused'))
      }
      const local = new URL(signed.pathname + signed.search, target.url)
      const uploaded = await fetch(local, { method: 'PUT', body: bytes, redirect: 'error',
        signal: AbortSignal.timeout(LOCAL_QA_REQUEST_TIMEOUT_MS), headers: { 'content-type': 'image/png', 'x-upsert': 'false' } })
      expect(uploaded.status, why('upload real PNG bytes to the named local Storage')).toBe(200)
      await uploaded.arrayBuffer()
      const attached = await command(`/jobs/${jobId}/media`, actor, { assets: [{
        object_path: intent.object_path, stage, mime_type: 'image/png', file_size_bytes: bytes.length,
      }] })
      expect(attached.status, why(`attach verified ${stage}`)).toBe(201)
      return String(intent.storage_ref)
    }

    const owner = await customer()
    const foreign = await customer()
    const workers = await Promise.all([customer('worker'), customer('worker'), customer('worker')])
    let ownedJobId: string | null = null
    // Retirement can read and cancel before the parallel availability writes settle.
    context.onTestFinished(async () => {
      const retired = await Promise.allSettled([(async () => {
        if (!ownedJobId) return
        const saved = await request(`/rest/v1/jobs?id=eq.${ownedJobId}&select=status,worker_id`)
        expect(saved.status, why('cleanup reads only its owned persisted job')).toBe(200)
        if (!Array.isArray(saved.payload) || saved.payload.length !== 1) throw new Error(why('owned cleanup job missing'))
        const job = record(saved.payload[0])
        if (job.worker_id === null && ['broadcasting', 'worker_candidate_pending', 'awaiting_customer_confirm'].includes(String(job.status))) {
          const closed = await command(`/jobs/${ownedJobId}/cancel`, owner)
          expect(closed.status, why('unfinished fixture matching is retired through the owning Customer command')).toBe(200)
        }
      })()])
      const cleanup = await Promise.allSettled(workers.map(async actor => {
        const unavailable = await command('/workers/me/availability', actor, { is_available: false }, 'PATCH')
        expect(unavailable.status, why('only this test actor is taken offline; history is retained')).toBe(200)
      }))
      const failed = [...retired, ...cleanup].filter(item => item.status === 'rejected')
      expect(failed, why('all owned actors are attempted even if one cleanup request fails')).toEqual([])
    }, LOCAL_QA_REQUEST_TIMEOUT_MS * 3)
    const worker = workers[0]
    const sessionId = randomUUID()
    const journey = { sessionId, ownerId: owner.id, workerIds: workers.map(item => item.id), source: 'saved_rfq_intake_fixture', inference: 'disabled' }
    Object.assign(context.task.meta, { qaJourney: journey })
    const seedWorkers = (actors: LocalQaActor[]) => seedRows(actors.map(actor => ['worker_profiles', { id: actor.id, legal_name: 'QA Fulfillment Worker', date_of_birth: '1990-01-01',
      service_types: ['plumbing'], selected_service_types: ['plumbing'], active_service_types: ['plumbing'],
      problem_specializations: ['leak_and_flow_diagnosis', 'pipe_and_fixture_repair'],
      districts: ['thu_duc'], years_experience: 5, is_approved: true, is_available: true, verification_status: 'approved' }] as const))
    seedWorkers(workers)
    const addMatchingWorker = async () => {
      const actor = await customer('worker')
      workers.push(actor)
      Object.assign(journey, { workerIds: workers.map(item => item.id), replacementWorkerId: actor.id })
      seedWorkers([actor])
      expect((await command('/workers/me/matching-heartbeat', actor)).status, why()).toBe(200)
      return actor
    }
    for (const actor of workers) expect((await command('/workers/me/matching-heartbeat', actor)).status, why()).toBe(200)
    const problem = await request('/rest/v1/service_problems?service_type=eq.plumbing&slug=eq.plumbing-general&select=id')
    expect(problem.payload, why()).toHaveLength(1)
    if (!Array.isArray(problem.payload)) throw new Error(why('catalog unavailable'))
    seedRows([
      ['kael_chat_sessions', { id: sessionId, customer_id: owner.id, service_type: 'plumbing', status: 'active', case_phase: 'offer_review',
        scheduled_at: new Date(Date.now() + 86400_000).toISOString(),
        diagnosis_scope: { version: 1, service_type: 'plumbing', profile_id: 'plumbing-diagnose', case_phase: 'offer_review',
          facts: {}, missing_facts: [], evidence: [], scope_summary: 'Khảo sát và báo giá sửa đường ống rò nước.', quote_ready: false,
          quote_blockers: ['worker_quote_required'], worker_requirements: ['leak_and_flow_diagnosis', 'pipe_and_fixture_repair'],
          next_action: { kind: 'request_worker_quote' } },
        safe_metadata: { address_district: 'thu_duc', address_label: 'QA fulfillment building', problem_chips: ['pipe_leak'] } }],
      ['kael_chat_turns', { session_id: sessionId, turn_index: 1, role: 'kael', content_type: 'analysis', safe_metadata: { service_problem_id: record(problem.payload[0]).id } }],
    ])
    const accepted = await command(`/kael/chat/${sessionId}/confirm`, owner, { confirmation_kind: 'rfq_request' })
    Object.assign(journey, { confirmationStatus: accepted.status, confirmationCode: record(accepted.payload).code ?? null })
    expect(accepted.status, why('three actual reachable local Workers satisfy public capacity without a synthetic exemption')).toBe(202)
    const jobId = String(record(accepted.payload).job_id)
    ownedJobId = jobId
    Object.assign(journey, { jobId })
    const dispatched = await dispatchMatching()
    Object.assign(journey, { maintainerHttpStatus: dispatched.status })
    const deliveries = await request(`/rest/v1/job_broadcasts?job_id=eq.${jobId}&select=id,worker_id`)
    expect(deliveries.payload, why('all recipients must be controlled local actors')).toHaveLength(3)
    if (!Array.isArray(deliveries.payload)) throw new Error(why('delivery missing'))
    expect(deliveries.payload.map(item => record(item).worker_id).sort(), why()).toEqual(workers.map(item => item.id).sort())
    const broadcast = deliveries.payload.find(item => record(item).worker_id === worker.id)
    const proposed = await command(`/workers/me/broadcasts/${record(broadcast).id}/proposal`, worker, {
      scope_summary: 'Khảo sát đường ống trước khi chốt giá sửa chữa.', price_min: 300000, price_max: 500000,
    })
    expect(proposed.status, why()).toBe(201)
    const candidateId = record(proposed.payload).candidate_id
    expect((await command(`/jobs/${jobId}/candidates/${candidateId}/confirm`, owner)).status, why()).toBe(200)
    return { owner, worker, workers, foreign, jobId, request, command, read, journey, customer, attachPhoto, dispatchMatching, addMatchingWorker }
  }
  async function prepare(context: TestContext, options: { apiRoot?: string; paymentRail?: 'platform_bank_manual' } = {}) {
    const { owner, worker, foreign, jobId, request, command, read, journey, customer, attachPhoto } = await prepareAssigned(context, options)
    const status = (body: unknown, actor = worker) => command(`/jobs/${jobId}/status`, actor, body, 'PATCH')
    expect((await status({ status: 'worker_on_way' }, owner)).status, why('Customer cannot act as Worker')).toBe(403)
    expect((await status({ status: 'worker_on_way' })).status, why()).toBe(200)
    const checkInRef = await attachPhoto(jobId, worker, 'access_check_in')
    expect((await status({ status: 'arrived', access_check_in: { mode: 'manual_photo', photo_urls: [checkInRef] } })).status, why()).toBe(200)
    const customerView = await read(`/jobs/${jobId}`, owner)
    expect(customerView.status, why()).toBe(200)
    const access = record(record(record(customerView.payload).job).address_access)
    const authorization = record(access.authorization_context)
    expect((await command(`/jobs/${jobId}/access/authorize`, foreign, authorization)).status, why('foreign Customer cannot release a unit')).toBe(404)
    expect((await command(`/jobs/${jobId}/access/authorize`, owner, authorization)).status, why()).toBe(200)
    expect((await status({ status: 'inspecting' })).status, why()).toBe(200)
    expect((await status({ status: 'repairing' })).status, why('Worker cannot start billable work before price consent')).toBe(409)
    const priceInput = { request_id: randomUUID(), customer_total: 350000, scope_summary: 'Thay đoạn nối ống bị rò và kiểm tra kín nước sau sửa.' }
    const price = await command(`/jobs/${jobId}/rfq-price`, worker, priceInput)
    expect(price.status, why()).toBe(200)
    expect(record(price.payload), why()).toMatchObject({ id: priceInput.request_id, status: 'pending', customer_total: 350000 })
    expect((await command(`/jobs/${jobId}/rfq-price/decide`, foreign, { proposal_id: priceInput.request_id, approve: true })).status, why()).toBe(404)
    const approved = await command(`/jobs/${jobId}/rfq-price/decide`, owner, { proposal_id: priceInput.request_id, approve: true })
    expect(approved.status, why()).toBe(200)
    expect((await status({ status: 'repairing' })).status, why()).toBe(200)
    const forged = await status({ status: 'completed_by_worker', completion_notes: 'Đã sửa và kiểm tra kín nước.',
      completion_photo_urls: [`supabase://job-media/${jobId}/after/unattached.png`] })
    expect(forged.status, why('a private-looking string is not attached evidence')).toBe(400)
    const completionRef = await attachPhoto(jobId, worker, 'after')
    expect((await status({ status: 'completed_by_worker', completion_notes: 'Đã sửa và kiểm tra kín nước.', completion_photo_urls: [completionRef] })).status, why()).toBe(200)
    const reopened = await read(`/jobs/${jobId}`, owner)
    expect(record(record(reopened.payload).job), why('fresh read must rehydrate persisted evidence and agreed amount')).toMatchObject({ status: 'completed_by_worker', final_price: 350000,
      payment_rail_available: options.paymentRail !== undefined, payment_rail_provider: options.paymentRail ?? null })
    const stored = await request(`/rest/v1/jobs?id=eq.${jobId}&select=status,final_price,synthetic_cohort_id,completion_photo_urls,payment_status`)
    expect(stored.payload, why('no synthetic financial exemption or forced lifecycle writes')).toEqual([{
      status: 'completed_by_worker', final_price: 350000, synthetic_cohort_id: null, completion_photo_urls: [completionRef], payment_status: 'not_started',
    }])
    return { owner, worker, foreign, jobId, request, command, read, stored, journey, customer }
  }
  return { target, prepare, prepareAssigned }
}
