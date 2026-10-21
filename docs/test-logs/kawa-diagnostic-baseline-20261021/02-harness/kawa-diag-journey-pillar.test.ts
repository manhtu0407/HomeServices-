import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { JOB_STATUSES } from '../../../../../../packages/shared/src/constants'
import { toWorkflowPhase, WORKFLOW_PHASES } from '../../../../../../packages/shared/src/workflow/workflow-phases'
import { acceptBroadcast } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/accept'
import { declineBroadcast } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/decline'
import { getKaelPerformanceProfile } from '../../../../../../supabase/functions/mobile-api/_shared/kael/index'
import { buildKaelIntakeConfirmation } from '../../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/intake-confirmation'
import { validateTransition } from '../../../../../../supabase/functions/mobile-api/_shared/platform/lifecycle'
import { validateWorkflowTransition } from '../../../../../../supabase/functions/mobile-api/_shared/workflow-orchestrator'
import { CASE_SESSION_ID, OWNER, installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { ADMIN, HARNESS_VERSION, buildWorld, loadMatrix, post, type Instrumented } from './diag-support'

installEdgeRuntimeTestHooks()

const { matrix, sha256 } = loadMatrix()
const snapshot = process.env.KAWA_DIAG_SNAPSHOT ?? 'unknown'
const repeats = Number(process.env.KAWA_DIAG_REPEATS ?? '2')
const only = process.env.KAWA_DIAG_ONLY ? new Set(process.env.KAWA_DIAG_ONLY.split(',')) : null
const runs: Array<Record<string, unknown>> = []

const orchestratorSource = readFileSync(resolve(process.cwd(), '../../supabase/functions/mobile-api/_shared/workflow-orchestrator.ts'), 'utf8')
const eventBlock = /const WORKFLOW_EVENT_TRANSITIONS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(orchestratorSource)?.[1] ?? ''
const EVENTS = [...eventBlock.matchAll(/^ {2}([a-z_]+):\s*\[/gm)].map((match) => match[1])
const STATUSES = [...JOB_STATUSES] as string[]
const ON_SITE = ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing']

const legal = (event: string, from: string, to: string) => (validateWorkflowTransition({ event, from, to } as never) as { valid: boolean }).valid
const producers = (to: string, fromFilter: (from: string) => boolean = () => true) =>
  EVENTS.filter((event) => STATUSES.some((from) => fromFilter(from) && legal(event, from, to)))

type Checkpoint = { id: string; name: string; expected: string; result: string; detail: string }
const checkpoint = (id: string, name: string, expected: string, result: string, detail: string): Checkpoint => ({ id, name, expected, result, detail })

const LEGAL_PATH: Array<[string, string, string]> = [
  ['analyzing', 'awaiting_customer_confirm', 'ai_estimate_ready'],
  ['awaiting_customer_confirm', 'broadcasting', 'customer_confirmed_ticket'],
  ['broadcasting', 'worker_candidate_pending', 'worker_accepted'],
  ['worker_candidate_pending', 'worker_matched', 'customer_confirmed_worker'],
  ['worker_matched', 'worker_on_way', 'worker_status_advanced'],
  ['worker_on_way', 'arrived', 'worker_status_advanced'],
  ['arrived', 'inspecting', 'worker_status_advanced'],
  ['inspecting', 'repairing', 'worker_status_advanced'],
  ['repairing', 'completed_by_worker', 'worker_completed'],
  ['completed_by_worker', 'confirmed_by_customer', 'customer_confirmed_completion'],
  ['confirmed_by_customer', 'payment_pending', 'kael_decided_payment'],
  ['payment_pending', 'paid', 'payment_confirmed'],
  ['paid', 'reviewed', 'review_submitted'],
]

function pendingIntake(inst: Instrumented, service: string) {
  const profile = getKaelPerformanceProfile(service as never)
  const date = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const scheduledAt = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 2, 0)).toISOString()
  const confirmation = buildKaelIntakeConfirmation({
    actorId: OWNER.id,
    serviceType: service,
    profileId: profile!.id,
    description: 'Cần thợ xem giúp thiết bị trong căn hộ vào cuối tuần',
    problemChips: [`other_${service}`],
    addressLabel: 'Căn hộ thử nghiệm',
    addressDistrict: 'Quận 7',
    scheduledAt,
    scheduleWindow: { date, start: '09:00', end: '11:00', time_zone: 'Asia/Ho_Chi_Minh' },
    language: 'vi',
  } as never)
  const session = inst.world.db.tables.kael_chat_sessions[0] as Record<string, any>
  session.safe_metadata = { ...session.safe_metadata, intake_confirmation: confirmation }
  return confirmation as { status: string }
}

const businessOutsideKael = (inst: Instrumented) =>
  Object.entries(inst.world.db.tables)
    .filter(([table, rows]) => rows.length > 0 && !matrix.allowed_business_writes.tables.includes(table))
    .map(([table, rows]) => `${table}=${rows.length}`)

async function journey(service: string): Promise<Checkpoint[]> {
  const cps: Checkpoint[] = []
  const definition = matrix.journey_definitions.standard.checkpoints
  const expectedOf = (id: string) => definition.find((entry) => entry.id === id)!.expected
  const nameOf = (id: string) => definition.find((entry) => entry.id === id)!.name
  const add = (id: string, result: string, detail: string) => cps.push(checkpoint(id, nameOf(id), expectedOf(id), result, detail))
  const guard = async (id: string, work: () => Promise<[string, string]>) => {
    try {
      const [result, detail] = await work()
      add(id, result, detail)
    } catch (error) {
      add(id, 'BLOCKED', `harness error: ${String((error as Error)?.message ?? error).slice(0, 300)}`)
    }
  }

  await guard('J01', async () => {
    const inst = buildWorld(service, { kind: 'new_case' })
    try {
      const response = await post(inst.world, '/kael/chat', { service_type: service, problem_chips: [], photo_urls: [], message: 'Mình cần thợ xem giúp thiết bị trong căn hộ', language: 'vi', address_district: 'Quận 7' })
      const session = inst.world.db.tables.kael_chat_sessions[0] as Record<string, any> | undefined
      const pass = response.status === 201 && session?.service_type === service && session?.case_phase === 'analysis'
      return [pass ? 'PASS' : 'FAIL', `status=${response.status} service_type=${session?.service_type} case_phase=${session?.case_phase}`]
    } finally { inst.restore() }
  })
  await guard('J02', async () => {
    const inst = buildWorld(service, { kind: 'new_case' })
    try {
      await post(inst.world, '/kael/chat', { service_type: service, problem_chips: [], photo_urls: [], message: 'Mình cần thợ xem giúp thiết bị trong căn hộ', language: 'vi', address_district: 'Quận 7' })
      const profile = getKaelPerformanceProfile(service as never)
      const scope = (inst.world.db.tables.kael_chat_sessions[0] as Record<string, any> | undefined)?.diagnosis_scope
      const pass = Boolean(profile) && scope?.profile_id === profile?.id
      return [pass ? 'PASS' : 'FAIL', `profile=${profile?.id ?? 'none'} scope.profile_id=${scope?.profile_id ?? 'none'}`]
    } finally { inst.restore() }
  })
  await guard('J03', async () => {
    const inst = buildWorld(service, { kind: 'active_case' })
    try {
      const response = await post(inst.world, `/kael/chat/${CASE_SESSION_ID}/confirm`, { confirmation_kind: 'priced_offer', price_reasoning_receipt_id: 'receipt-0001-diagnostic' })
      const rpcs = inst.rpcCalls.filter((name) => /confirm|match|broadcast|job/i.test(name) && !/ai_spend/i.test(name))
      const writes = businessOutsideKael(inst)
      const refused = response.status >= 400 && response.status < 500
      if (refused && rpcs.length === 0 && writes.length === 0) return ['PASS', `refused at the Edge boundary: status=${response.status}`]
      if (rpcs.length > 0) return ['BLOCKED', `the Edge layer delegated the quote-readiness decision to ${rpcs.join(',')} (status=${response.status} from the in-memory stand-in, which cannot decide); needs T1 PostgreSQL. No Edge pre-check refused a non-quote-ready Case. other-writes=[${writes.join(',')}]`]
      return ['FAIL', `status=${response.status} business-rpcs=[] other-writes=[${writes.join(',')}]`]
    } finally { inst.restore() }
  })
  await guard('J04', async () => {
    const adminWorld = buildWorld(service, { kind: 'active_case' })
    const ownerWorld = buildWorld(service, { kind: 'active_case' })
    try {
      const pendingAdmin = pendingIntake(adminWorld, service)
      const before = JSON.stringify((adminWorld.world.db.tables.kael_chat_sessions[0] as Record<string, any>).safe_metadata)
      const adminResponse = await post(adminWorld.world, `/kael/chat/${CASE_SESSION_ID}/intake-confirmation`, { decision: 'confirmed' }, ADMIN)
      const after = JSON.stringify((adminWorld.world.db.tables.kael_chat_sessions[0] as Record<string, any>).safe_metadata)
      pendingIntake(ownerWorld, service)
      const ownerResponse = await post(ownerWorld.world, `/kael/chat/${CASE_SESSION_ID}/intake-confirmation`, { decision: 'confirmed' })
      const pass = pendingAdmin.status === 'pending' && adminResponse.status === 403 && before === after && ownerResponse.status >= 200 && ownerResponse.status < 300
      return [pass ? 'PASS' : 'FAIL', `fixture=${pendingAdmin.status} admin=${adminResponse.status} metadata-unchanged=${before === after} owner=${ownerResponse.status}`]
    } finally { adminWorld.restore(); ownerWorld.restore() }
  })
  await guard('J05', async () => {
    const inst = buildWorld(service, { kind: 'active_case' })
    try {
      const turnsBefore = inst.world.db.tables.kael_chat_turns.length
      const response = await post(inst.world, `/kael/chat/${CASE_SESSION_ID}/evidence`, { decision: 'skipped', skip_reason: 'Không có ảnh để gửi' }, ADMIN)
      const wrote = inst.world.db.tables.kael_chat_turns.length - turnsBefore
      return [response.status === 403 && wrote === 0 ? 'PASS' : 'FAIL', `admin status=${response.status} turns-written=${wrote}`]
    } finally { inst.restore() }
  })
  await guard('J06', async () => {
    const failures: string[] = []
    const driftNotes: string[] = []
    const lifecycleOnly = validateTransition('draft' as never, 'analyzing' as never) as { valid: boolean }
    if (!lifecycleOnly.valid) failures.push('draft->analyzing (lifecycle table)')
    for (const [from, to, event] of LEGAL_PATH) {
      if (legal(event, from, to)) continue
      const accepting = EVENTS.filter((candidate) => legal(candidate, from, to))
      if (accepting.length === 0) failures.push(`${from}->${to}: no event accepts it`)
      else driftNotes.push(`${from}->${to}: documented event ${event} does not exist in code; accepted by [${accepting.join(',')}]`)
    }
    return [failures.length === 0 ? 'PASS' : 'FAIL', failures.length ? `refused: ${failures.join('; ')}` : `${LEGAL_PATH.length} event-gated pairs accepted by some event; draft->analyzing has no event and is checked against the lifecycle table only (events enumerated: ${EVENTS.length}). DOC DRIFT: ${driftNotes.join(' | ') || 'none'}`]
  })
  await guard('J07', async () => {
    const illegal: Array<[string, string]> = [
      ['draft', 'broadcasting'], ['awaiting_customer_confirm', 'worker_matched'], ['broadcasting', 'worker_matched'],
      ['worker_candidate_pending', 'worker_on_way'], ['repairing', 'confirmed_by_customer'],
    ]
    const leaks: string[] = []
    for (const [from, to] of illegal) for (const event of EVENTS) if (legal(event, from, to)) leaks.push(`${from}->${to} via ${event}`)
    for (const event of ['worker_status_advanced', 'worker_completed', 'worker_accepted', 'scope_change_requested', 'worker_confirmed_cash_payment']) {
      if (legal(event, 'completed_by_worker', 'payment_pending')) leaks.push(`completed_by_worker->payment_pending via ${event}`)
    }
    for (const event of EVENTS) for (const to of STATUSES) if (legal(event, 'cancelled', to)) leaks.push(`cancelled->${to} via ${event}`)
    return [leaks.length === 0 ? 'PASS' : 'FAIL', leaks.length ? `illegal accepted: ${leaks.join('; ')}` : 'all probed illegal pairs refused under every event']
  })
  await guard('J08', async () => {
    const preMatch = (from: string) => !ON_SITE.includes(from) && from !== 'scope_change_pending'
    const matched = producers('worker_matched', preMatch)
    const payment = producers('payment_pending')
    const workerFired = ['worker_accepted', 'worker_status_advanced', 'scope_change_requested', 'worker_completed', 'worker_confirmed_cash_payment']
    const workerPayment = payment.filter((event) => workerFired.includes(event))
    const pass = matched.length === 1 && matched[0] === 'customer_confirmed_worker' && payment.length >= 1 && workerPayment.length === 0 && !legal('worker_accepted', 'broadcasting', 'worker_matched') && !legal('worker_completed', 'completed_by_worker', 'payment_pending')
    return [pass ? 'PASS' : 'FAIL', `worker_matched (from a pre-match status) producers=[${matched.join(',')}]; payment_pending producers=[${payment.join(',')}] worker-fired among them=[${workerPayment.join(',')}]. Interpretation register I3: scope-change resumes into an on-site status are not matching steps; 'a Kael or payment event' is read as 'an event not fired by a worker'`]
  })
  await guard('J09', async () => {
    const entering = producers('scope_change_pending')
    const direct = EVENTS.filter((event) => legal(event, 'scope_change_pending', 'completed_by_worker'))
    const fromOnSite = ON_SITE.every((from) => legal('scope_change_requested', from, 'scope_change_pending'))
    const pass = entering.length === 1 && entering[0] === 'scope_change_requested' && direct.length === 0 && fromOnSite
    return [pass ? 'PASS' : 'FAIL', `entering producers=[${entering.join(',')}] direct-to-completed=[${direct.join(',')}] reachable-from-all-five-on-site=${fromOnSite}`]
  })
  await guard('J10', async () => {
    const cancelOnSite = ON_SITE.filter((from) => legal('cancel_requested', from, 'cancelled'))
    const rematch = ON_SITE.every((from) => legal('kael_processed_cancellation', from, 'broadcasting'))
    return [cancelOnSite.length === 0 && rematch ? 'PASS' : 'FAIL', `cancel_requested allowed from on-site=[${cancelOnSite.join(',')}] kael_processed_cancellation re-match from all five=${rematch}`]
  })
  await guard('J11', async () => {
    const probe = async (work: (client: ReturnType<typeof makeSequenceClient>) => Promise<unknown>) => {
      const client = makeSequenceClient([])
      try {
        await work(client)
        return { rejected: false, status: null as number | null, calls: client.calls.map((call) => call.table) }
      } catch (error) {
        const e = error as { status?: number; code?: string; message?: string }
        return { rejected: true, status: e.status ?? null, calls: client.calls.map((call) => call.table), code: e.code ?? null }
      }
    }
    const ctx = (client: unknown) => ({ success: true, user: { id: ADMIN.id }, role: 'admin', supabase: client }) as never
    const accept = await probe((client) => acceptBroadcast(ctx(client), '18800000-0000-4000-8000-000000000002', '18800000-0000-4000-8000-000000000009'))
    const decline = await probe((client) => declineBroadcast(ctx(client), '18800000-0000-4000-8000-000000000002'))
    const pass = accept.rejected && accept.status === 403 && accept.calls.length === 0 && decline.rejected && decline.status === 403 && decline.calls.length === 0
    return [pass ? 'PASS' : 'FAIL', `accept: ${JSON.stringify(accept)}; decline: ${JSON.stringify(decline)}`]
  })
  await guard('J12', async () => {
    const reach = EVENTS.filter((event) => legal(event, 'confirmed_by_customer', 'reviewed'))
    const result = reach.length === 0 ? 'PASS' : reach.length === 1 && reach[0] === 'kael_decided_dispute' ? 'KNOWN_GAP' : 'FAIL'
    return [result, `events permitting confirmed_by_customer->reviewed: [${reach.join(',')}]; lifecycle table alone allows it=${(validateTransition('confirmed_by_customer' as never, 'reviewed' as never) as { valid: boolean }).valid}`]
  })
  await guard('J13', async () => {
    const mapped: string[] = []
    const failed: string[] = []
    for (const status of STATUSES) {
      try { mapped.push(`${status}=${toWorkflowPhase(status as never)}`) } catch { failed.push(status) }
    }
    return ['INVENTORY', `statuses=${STATUSES.length} phases=${WORKFLOW_PHASES.length} unmapped=[${failed.join(',')}] (worker UI stage ids are inventoried from mobile source in 04-workflows, not from rendering)`]
  })
  await guard('J14', async () => ['BLOCKED', 'T0 has no payment rail, provider callback or ledger table'])
  await guard('J15', async () => ['BLOCKED', 'T0 stand-in cannot prove unique indexes, RLS, locks or RPC atomicity'])
  return cps
}

describe(`kawa-diag journeys on ${snapshot}`, () => {
  for (const scenario of matrix.scenarios.filter((entry) => entry.kind === 'journey' && (!only || only.has(entry.id)))) {
    for (let run = 1; run <= repeats; run += 1) {
      it(`${scenario.id} run ${run}`, async () => {
        const checkpoints = await journey(scenario.service)
        const gatingFail = checkpoints.filter((cp) => cp.expected === 'PASS' && cp.result !== 'PASS')
        const blocked = checkpoints.filter((cp) => cp.result === 'BLOCKED' && cp.expected === 'PASS')
        runs.push({
          scenario: scenario.id,
          service: scenario.service,
          class: 'S5',
          run,
          verdict: gatingFail.some((cp) => cp.result === 'FAIL') ? 'FAIL' : blocked.length > 0 ? 'BLOCKED' : 'PASS',
          events_enumerated: EVENTS.length,
          checkpoints,
        })
        expect(checkpoints.length).toBe(15)
      })
    }
  }
})

afterAll(() => {
  const out = process.env.KAWA_DIAG_OUT
  if (!out) return
  writeFileSync(out, `${JSON.stringify({
    schema: 'nestscout.diagnostic_results.v1',
    kind: 'journey',
    harness_version: HARNESS_VERSION,
    snapshot,
    matrix_sha256: sha256,
    executed_at: new Date().toISOString(),
    runs,
  }, null, 2)}\n`)
})
