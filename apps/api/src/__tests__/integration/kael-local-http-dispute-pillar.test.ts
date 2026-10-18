import { describe, expect, it } from 'vitest'
import { pillarPrerequisite, pillarWhy, type PillarManifest } from '../pillar-manifest'
import { localQaRecord as record } from './local-qa-http-harness'
import { createLocalFulfillmentFixture } from './local-qa-fulfillment-fixture'

export const PILLAR = {
  id: 'P401-kael-local-http-dispute',
  invariant: 'a genuinely completed local assignment opens one actor-bound dispute and evidence snapshot, accepts only the counter-party statement and Admin decision, and cannot invent payment or refund',
  authority: ['governance/RULES.md #7', 'governance/structures/cancellation-recovery.md', 'approved Build 56 journey verification plan'],
  target: 'actual local completion, dispute, counter-statement and Admin decision handlers and PostgreSQL',
  layer: 'integration',
  siblings: ['P396-kael-local-http-fulfillment', 'P189-dispute-lifecycle', 'P89-refund-obligation-integrity-sql'],
  mutation: 'use the initiating participant for the successful Admin decision; the actual role boundary must refuse it',
} as const satisfies PillarManifest

const { target, prepare, prepareAssigned } = createLocalFulfillmentFixture(PILLAR)
const integration = pillarPrerequisite(PILLAR, { available: target !== null,
  hint: 'Requires guarded named local Auth, actual Edge/PostgreSQL/Storage, no live inference or banking.' }) ? describe.sequential : describe.skip
const why = (detail?: string) => pillarWhy(PILLAR, detail)

integration('Dispute on the same publicly completed local assignment', () => {
  it('refuses both participants before an eligible execution phase without changing assignment', async context => {
    const { owner, worker, jobId, command, read, request } = await prepareAssigned(context)
    for (const actor of [owner, worker]) {
      const refused = await command(`/jobs/${jobId}/disputes`, actor, { dispute_type: 'completion_rejected',
        initiator_statement: 'Tôi đề nghị kiểm tra tình trạng công việc theo bằng chứng đã lưu.', evidence_photo_urls: [] })
      expect(refused.status, why('a matched job has not reached the dispute phase')).toBe(409)
      expect(record(refused.payload).code, why()).toBe('INVALID_STATUS')
    }
    const saved = await read(`/jobs/${jobId}`, owner)
    expect(record(record(saved.payload).job).status, why()).toBe('worker_matched')
    expect(record(record(saved.payload).worker).id, why()).toBe(worker.id)
    expect((await request(`/rest/v1/disputes?job_id=eq.${jobId}&select=id`)).payload, why()).toEqual([])
  }, 120_000)
  for (const initiatedBy of ['customer', 'worker'] as const) {
    it(`locks evidence, preserves money and enforces counter-party/Admin boundaries for ${initiatedBy}`, async context => {
      const { owner, worker, foreign, jobId, request, command, read, journey, customer } = await prepare(context)
      const admin = await customer('admin')
      const initiator = initiatedBy === 'customer' ? owner : worker
      const counterParty = initiatedBy === 'customer' ? worker : owner
      const input = { dispute_type: initiatedBy === 'customer' ? 'completion_rejected' : 'scope_disagreement_post_job',
        initiator_statement: 'Tôi đề nghị admin kiểm tra lại bằng chứng và phạm vi công việc đã ghi nhận.', evidence_photo_urls: [] }
      const resource = `/jobs/${jobId}/disputes`
      expect((await command(resource, foreign, input)).status, why('non-participant cannot open this dispute')).toBe(403)
      expect((await command(resource, initiator, {})).status, why('missing statement/type must fail before persistence')).toBe(400)
      const deferred = await command(resource, initiator, { ...input, dispute_type: 'unpaid_service' })
      expect(deferred.status, why('the existing unsupported payment-dispute boundary stays explicit')).toBe(409)
      expect(record(deferred.payload).code, why()).toBe('DEFERRED_PHASE0')
      const openings = await Promise.all([command(resource, initiator, input), command(resource, initiator, input)])
      expect(openings.map(item => item.status).sort(), why('one active dispute; duplicate is the documented ALREADY_OPEN conflict')).toEqual([201, 409])
      const opened = openings.find(item => item.status === 201)
      if (!opened) throw new Error(why('successful opening receipt missing'))
      const receipt = record(opened.payload)
      const disputeId = String(receipt.dispute_id)
      Object.assign(journey, { initiatedBy, disputeId, evidenceSnapshotId: receipt.evidence_snapshot_id, openStatuses: openings.map(item => item.status) })
      expect(receipt, why()).toMatchObject({ job_id: jobId, status: 'open', admin_review_required: true })
      const disputes = await request(`/rest/v1/disputes?job_id=eq.${jobId}&select=id,initiated_by_id,counter_party_id,status,evidence_snapshot_id`)
      expect(disputes.payload, why('the concurrent command must create exactly one durable dispute')).toEqual([{
        id: disputeId, initiated_by_id: initiator.id, counter_party_id: counterParty.id, status: 'open', evidence_snapshot_id: receipt.evidence_snapshot_id,
      }])
      const snapshots = await request(`/rest/v1/evidence_snapshots?job_id=eq.${jobId}&select=id`)
      expect(snapshots.payload, why()).toEqual([{ id: receipt.evidence_snapshot_id }])
      for (const actor of [owner, worker]) {
        const own = await request(`/rest/v1/disputes?id=eq.${disputeId}&select=id`, { token: actor.token, key: target?.anonKey })
        expect(own.status, why('participant read is also checked under authenticated RLS')).toBe(200)
        expect(own.payload, why()).toEqual([{ id: disputeId }])
      }
      const hidden = await request(`/rest/v1/disputes?id=eq.${disputeId}&select=id`, { token: foreign.token, key: target?.anonKey })
      expect(hidden.status, why()).toBe(200)
      expect(hidden.payload, why('another authenticated account cannot read this dispute')).toEqual([])
      const counterPath = `/disputes/${disputeId}/counter-statement`
      const statement = { statement: 'Tôi bổ sung phản hồi để admin xem xét khách quan theo bằng chứng đã lưu.' }
      expect((await command(counterPath, foreign, statement)).status, why()).toBe(403)
      expect((await command(counterPath, initiator, statement)).status, why('the initiator cannot impersonate the counter-party')).toBe(403)
      const counters = await Promise.all([command(counterPath, counterParty, statement), command(counterPath, counterParty, statement)])
      expect(counters.map(item => item.status).sort(), why('the existing duplicate statement conflict is not reported as a new success')).toEqual([200, 409])
      const decisionPath = `/disputes/${disputeId}/admin-decision`
      const decision = { outcome: 'no_fault_both', customer_trust_impact: 'none', worker_action: 'none',
        reasoning: 'Admin đã xem xét bằng chứng và phản hồi hai bên, ghi nhận kết quả trung lập, chưa xác nhận bất kỳ khoản thanh toán nào.' }
      expect((await command(decisionPath, initiator, decision)).status, why()).toBe(403)
      const refund = await command(decisionPath, admin, { ...decision, outcome: 'customer_favor_partial', refund_amount: 1 })
      expect(refund.status, why('unpaid work cannot manufacture a refund obligation')).toBe(409)
      expect(record(refund.payload).code, why()).toBe('REFUND_PAYMENT_UNVERIFIED')
      const decisions = await Promise.all([command(decisionPath, admin, decision), command(decisionPath, admin, decision)])
      expect(decisions.map(item => item.status).sort(), why('concurrent Admin decisions commit one durable outcome')).toEqual([200, 409])
      const decided = decisions.find(item => item.status === 200)
      if (!decided) throw new Error(why('successful Admin decision missing'))
      expect(decided.status, why('only an actual Admin can record the non-monetary resolution')).toBe(200)
      expect(record(decided.payload), why()).toMatchObject({ dispute_id: disputeId, status: 'admin_decided', outcome: 'no_fault_both' })
      const replay = await command(decisionPath, admin, decision)
      expect(replay.status, why('already-decided conflict preserves the existing decision')).toBe(409)
      expect(record(replay.payload).code, why()).toBe('ALREADY_DECIDED')
      const saved = await request(`/rest/v1/disputes?id=eq.${disputeId}&select=status,admin_decision_by,admin_decision_at,counter_party_statement`)
      expect(saved.payload, why()).toEqual([{ status: 'admin_decided', admin_decision_by: admin.id,
        admin_decision_at: record(decided.payload).decided_at, counter_party_statement: statement.statement }])
      const queue = await request(`/rest/v1/kael_admin_queue?job_id=eq.${jobId}&queue_type=eq.dispute_review&select=status`)
      expect(queue.payload, why('one review work item settles once')).toEqual([{ status: 'resolved' }])
      const events = await request(`/rest/v1/job_events?job_id=eq.${jobId}&event_type=eq.dispute_opened&select=id`)
      expect(events.payload, why('concurrent opening cannot duplicate its audit event')).toHaveLength(1)
      for (const actor of [owner, worker]) {
        const reopened = await read(`/jobs/${jobId}`, actor)
        expect(record(record(reopened.payload).job), why('dispute resolution cannot invent completion consent, payment or assignment changes'))
          .toMatchObject({ status: 'completed_by_worker', final_price: 350000, payment_status: 'not_started' })
      }
      expect((await request(`/rest/v1/job_payment_orders?job_id=eq.${jobId}&select=id`)).payload, why()).toEqual([])
      expect((await request(`/rest/v1/api_logs?job_id=eq.${jobId}&select=id`)).payload, why('neutral review is deterministic, without inference')).toEqual([])
    }, 120_000)
  }
})
