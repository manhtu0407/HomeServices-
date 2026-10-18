import { describe, expect, it } from 'vitest'
import { pillarPrerequisite, pillarWhy, type PillarManifest } from '../pillar-manifest'
import { localQaRecord as record } from './local-qa-http-harness'
import { createLocalFulfillmentFixture } from './local-qa-fulfillment-fixture'

export const PILLAR = {
  id: 'P399-kael-local-http-cancellation',
  invariant: 'actual Customer cancellation retires matching once, while approved Worker cancellation queues one replacement that still requires new Customer selection without replay reviving the old assignment',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8', 'approved Build 56 journey verification plan'],
  target: 'actual local cancellation handlers, durable outbox, replacement matching and Customer selection',
  layer: 'integration',
  siblings: ['P396-kael-local-http-fulfillment', 'P117-customer-cancellation-durability-sql', 'P84-worker-cancellation-matching-outbox'],
  mutation: 'replace the successful cancellation actor with the foreign Customer; the actual public ownership or role boundary must refuse it and the expected receipt assertion turns red',
} as const satisfies PillarManifest

const { target, prepareAssigned } = createLocalFulfillmentFixture(PILLAR)
const fixture = process.env.NESTSCOUT_QA_CANCELLATION_FIXTURE_NAME
if (fixture !== undefined && !/^qa-cancellation-fixture-[a-f0-9]{12}$/u.test(fixture)) throw new Error('QA cancellation fixture name refused')
const integration = pillarPrerequisite(PILLAR, { available: target !== null && fixture !== undefined,
  hint: 'Requires named local Auth, actual Edge/PostgreSQL and the guarded matching dispatcher; no live inference.' }) ? describe.sequential : describe.skip
const why = (detail?: string) => pillarWhy(PILLAR, detail)

integration('Cancellation and replacement through the same actual local assignment', () => {
  for (const actorKind of ['customer', 'worker'] as const) {
    it(`persists and replays ${actorKind} cancellation without duplicate work or early reassignment`, async context => {
      const { owner, worker, workers, foreign, jobId, request, command, read, journey, dispatchMatching, addMatchingWorker } = await prepareAssigned(context, { apiRoot: `/functions/v1/${fixture}` })
      expect((await command(`/jobs/${jobId}/status`, worker, { status: 'worker_on_way' }, 'PATCH')).status, why()).toBe(200)
      const replacement = actorKind === 'worker' ? await addMatchingWorker() : null
      const actor = actorKind === 'customer' ? owner : worker
      const path = `/jobs/${jobId}/${actorKind}-cancellation`
      const input = actorKind === 'customer'
        ? { reason_code: 'changed_mind', reason_note: 'Tôi không còn cần xử lý yêu cầu này.' }
        : { reason: 'Unexpected vehicle breakdown prevents continuing to this job.', evidence_photo_urls: [] }
      expect((await command(path, foreign, input)).status, why('foreign actor cannot cancel another assignment')).toBe(actorKind === 'customer' ? 404 : 403)
      expect((await command(path, actorKind === 'customer' ? worker : owner, input)).status, why()).toBe(403)
      if (actorKind === 'worker') expect((await command(path, workers[1], input)).status, why()).toBe(404)
      expect((await command(path, actor, {})).status, why('invalid input cannot create cancellation')).toBe(400)
      const disabled = await request('/functions/v1/mobile-api' + path, { method: 'POST', token: actor.token, key: target?.anonKey, body: input })
      expect(disabled.status, why('the canonical off-profile guard must remain effective')).toBe(409)
      const unchanged = await read(`/jobs/${jobId}`, owner)
      expect(record(record(unchanged.payload).job).status, why()).toBe('worker_on_way')
      const responses = await Promise.all([command(path, actor, input), command(path, actor, input)])
      Object.assign(journey, { actorKind, cancellationStatuses: responses.map(item => item.status), cancellationCodes: responses.map(item => record(item.payload).code ?? null) })
      expect(responses.map(item => item.status), why('concurrent requests must recover one committed cancellation')).toEqual([201, 201])
      const receipt = record(responses[0].payload)
      expect(record(responses[1].payload).cancellation_id, why()).toBe(receipt.cancellation_id)
      Object.assign(journey, { cancellationId: receipt.cancellation_id })
      const table = actorKind === 'customer' ? 'customer_cancellation_records' : 'worker_cancellation_requests'
      const records = await request(`/rest/v1/${table}?job_id=eq.${jobId}&select=id`)
      expect(records.payload, why('duplicate HTTP cannot append another cancellation')).toHaveLength(1)
      const fresh = await read(`/jobs/${jobId}`, owner)
      expect(fresh.status, why()).toBe(200)
      const job = record(record(fresh.payload).job)
      expect(job, why('cancellation is not a financial verification')).toMatchObject({ final_price: null, payment_status: 'not_started' })
      if (actorKind === 'customer') {
        expect(receipt, why()).toMatchObject({ job_status: 'cancelled', phase0_no_monetary_penalty: true })
        expect(job.status, why()).toBe('cancelled')
        const operations = await request(`/rest/v1/matching_operations?job_id=eq.${jobId}&select=state`)
        expect(operations.payload, why('the matching projection cannot stay official after cancellation')).toEqual([{ state: 'stopped' }])
      } else {
        expect(receipt, why()).toMatchObject({ status: 'approved', job_status: 'broadcasting', broadcast_sent: false })
        expect(job.status, why('replacement cannot inherit the cancelled Worker')).toBe('broadcasting')
        expect(record(fresh.payload).worker, why('public detail has no assigned Worker')).toBeNull()
        const persisted = await request(`/rest/v1/jobs?id=eq.${jobId}&select=worker_id`)
        expect(persisted.payload, why()).toEqual([{ worker_id: null }])
        const queued = await request(`/rest/v1/workflow_outbox?worker_cancellation_id=eq.${receipt.cancellation_id}&select=id,status`)
        expect(queued.payload, why()).toHaveLength(1)
        const dispatch = await dispatchMatching()
        Object.assign(journey, { replacementMaintainerStatus: dispatch.status })
        if (!replacement) throw new Error(why('fresh eligible replacement Worker missing'))
        const broadcasts = await request(`/rest/v1/job_broadcasts?job_id=eq.${jobId}&worker_id=eq.${replacement.id}&status=eq.sent&select=id`)
        expect(broadcasts.payload, why('replacement dispatcher must persist a controlled recipient')).toHaveLength(1)
        if (!Array.isArray(broadcasts.payload)) throw new Error(why('replacement delivery missing'))
        const proposed = await command(`/workers/me/broadcasts/${record(broadcasts.payload[0]).id}/proposal`, replacement, {
          scope_summary: 'Khảo sát thay thế theo phạm vi đã xác nhận.', price_min: 300000, price_max: 500000,
        })
        Object.assign(journey, { replacementProposalStatus: proposed.status, replacementProposalCode: record(proposed.payload).code ?? null, replacementProposalRunId: proposed.runId })
        expect(proposed.status, why()).toBe(201)
        const waiting = await read(`/jobs/${jobId}`, owner)
        expect(record(waiting.payload).worker, why('Worker proposal is not Customer selection')).toBeNull()
        const selected = await command(`/jobs/${jobId}/candidates/${record(proposed.payload).candidate_id}/confirm`, owner)
        expect(selected.status, why()).toBe(200)
        const replay = await command(path, worker, input)
        expect(replay.status, why('old Worker may recover only their existing cancellation receipt')).toBe(201)
        expect(record(replay.payload).cancellation_id, why()).toBe(receipt.cancellation_id)
        const reopened = await read(`/jobs/${jobId}`, owner)
        expect(record(record(reopened.payload).job).status, why('late cancellation replay must not overwrite the new assignment')).toBe('worker_matched')
        expect(record(record(reopened.payload).worker).id, why()).toBe(replacement.id)
        const outboxes = await request(`/rest/v1/workflow_outbox?worker_cancellation_id=eq.${receipt.cancellation_id}&select=id`)
        expect(outboxes.payload, why()).toHaveLength(1)
      }
      const payment = await request(`/rest/v1/job_payment_orders?job_id=eq.${jobId}&select=id`)
      expect(payment.payload, why('no payment or refund is synthesized by these cancellation paths')).toEqual([])
      const logs = await request(`/rest/v1/api_logs?job_id=eq.${jobId}&select=id`)
      expect(logs.payload, why('policy cancellation and replacement cannot call inference')).toEqual([])
    }, 120_000)
  }
})
