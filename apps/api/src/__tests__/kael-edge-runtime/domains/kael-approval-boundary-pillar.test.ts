import { describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { CASE_ADMIN_ID, CASE_SESSION_ID, OWNER, installEdgeRuntimeTestHooks, makeSequenceClient, type CaseWorld } from '../harness'
import { activeWorld, pendingWorld } from '../harness/emergency-fixtures'

export const PILLAR = {
  id: 'P413-kael-approval-boundary',
  invariant:
    'every route that records a customer approval (the offer, the proposed worker, a scope or price change, completion, payment, apartment access) refuses an admin, a worker or any other wrong role before the database or a provider is touched, and every route where a worker proposes refuses an admin and a customer the same way; a request without its approval evidence fails validation before any call; and no module that answers an emergency, runs the model or lives in the Kael layer can reach a function that records an approval',
  authority: [
    'governance/RULES.md #7 (Kael stops for the offer, proposed-worker, scope-change, completion and payment confirmations; an authenticated customer action is not a Kael decision)',
    'governance/RULES.md #4 (an admin never approves for the customer)',
    'governance/critical.md §24 (forbidden behaviours: unvalidated money-impacting autonomous actions)',
    'KAWA_01_Foundation_Safety_Evaluation.pdf SAFETY (permission, approval, idempotency and privacy observations)',
  ],
  target: 'supabase/functions/mobile-api/_shared/http/dispatch/job.ts',
  layer: 'security-negative',
  siblings: ['P19-job-access-ownership', 'P86-customer-completion-http', 'P87-scope-change-http-authority', 'P18-capability-registry-parity'],
  mutation:
    'drop the customer guard from one decision service, let an admin through a route that records an approval, or import a decision service from the emergency or Kael layer: the matching row turns red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const U = (n: number) => `a413abcd-0000-4000-8000-${String(n).padStart(12, '0')}`
const ACTOR = U(1)
const JOB = U(2)
const SESSION = U(3)
const CANDIDATE = U(4)
const SCOPE = U(5)
const PROPOSAL = U(6)
const REQUEST = U(7)
const OPERATION = U(8)
const WORKER = U(9)

type Role = 'customer' | 'worker' | 'admin'
type Row = { name: string; method: 'POST' | 'PATCH'; path: string; body: Record<string, unknown> }

// Routes where the customer's approval is recorded. Each body is valid for its schema, so a refusal can only come
// from the role guard and never from validation.
const CUSTOMER_DECISIONS: readonly Row[] = [
  { name: 'confirm the priced offer', method: 'POST', path: `/kael/chat/${SESSION}/confirm`, body: { price_reasoning_receipt_id: 'receipt-00000001' } },
  { name: 'confirm the booking intake', method: 'POST', path: `/kael/chat/${SESSION}/intake-confirmation`, body: { decision: 'confirmed' } },
  { name: 'recover a confirmation', method: 'POST', path: `/kael/chat/${SESSION}/recover-confirmation`, body: { job_id: JOB, price_reasoning_receipt_id: 'receipt-00000001' } },
  { name: 'start matching', method: 'POST', path: `/jobs/${JOB}/confirm-search`, body: { client_request_id: REQUEST, expected_matching_operation_id: OPERATION } },
  { name: 'choose how matching runs', method: 'POST', path: `/jobs/${JOB}/matching-preference`, body: { mode: 'general', client_request_id: REQUEST } },
  { name: 'confirm the proposed worker', method: 'POST', path: `/jobs/${JOB}/candidates/${CANDIDATE}/confirm`, body: {} },
  { name: 'reject the proposed worker', method: 'POST', path: `/jobs/${JOB}/candidates/${CANDIDATE}/reject`, body: {} },
  { name: 'decide a scope change', method: 'POST', path: `/scope-changes/${SCOPE}/decide`, body: { decision: 'approve' } },
  { name: 'decide a worker price', method: 'POST', path: `/jobs/${JOB}/rfq-price/decide`, body: { proposal_id: PROPOSAL, approve: true } },
  { name: 'authorize apartment access', method: 'POST', path: `/jobs/${JOB}/access/authorize`, body: { expected_worker_id: WORKER, expected_check_in_at: '2026-10-21T02:00:00.000Z' } },
  { name: 'confirm completion', method: 'POST', path: `/jobs/${JOB}/confirm-completion`, body: {} },
  { name: 'open the payment order', method: 'POST', path: `/jobs/${JOB}/payment-order`, body: {} },
  { name: 'claim a payment', method: 'POST', path: `/jobs/${JOB}/payment-order/claim`, body: { transferred_at: '2026-10-21T02:00:00.000Z' } },
  { name: 'ask the worker to finish', method: 'POST', path: `/jobs/${JOB}/nudge-completion`, body: {} },
  { name: 'cancel the job', method: 'POST', path: `/jobs/${JOB}/cancel`, body: {} },
  { name: 'request a cancellation', method: 'POST', path: `/jobs/${JOB}/customer-cancellation`, body: { reason_code: 'changed_mind', reason_note: 'Không cần nữa' } },
  { name: 'report a worker', method: 'POST', path: `/jobs/${JOB}/worker-reports`, body: { violation_code: 'off_app_dealing', statement: 'Thợ đề nghị thanh toán ngoài ứng dụng' } },
  { name: 'review the job', method: 'POST', path: `/jobs/${JOB}/review`, body: { rating: 5, tags: [] } },
  { name: 'submit evidence or skip it', method: 'POST', path: `/kael/chat/${SESSION}/evidence`, body: { decision: 'skipped', skip_reason: 'Không có ảnh' } },
  { name: 'send a message to the Case', method: 'POST', path: `/kael/chat/${SESSION}`, body: { message: 'Máy treo tường hai bộ' } },
]

// Routes where the worker proposes or acts; an admin or a customer must not act in the worker's place.
const WORKER_ACTIONS: readonly Row[] = [
  { name: 'accept an offer', method: 'POST', path: `/jobs/${JOB}/accept`, body: { quote_id: REQUEST } },
  { name: 'propose a scope change', method: 'POST', path: `/jobs/${JOB}/scope-change`, body: { client_request_id: REQUEST, new_description: 'Thay thêm dây dẫn mới cho ổ cắm', reason: 'Dây cũ đã hỏng nặng bên trong tường' } },
  { name: 'propose a price', method: 'POST', path: `/jobs/${JOB}/rfq-price`, body: { request_id: REQUEST, customer_total: 500000, scope_summary: 'Khảo sát và sửa ổ cắm bị cháy' } },
  { name: 'decline an offer', method: 'POST', path: `/jobs/${JOB}/decline`, body: {} },
  { name: 'advance the job status', method: 'PATCH', path: `/jobs/${JOB}/status`, body: { status: 'worker_on_way' } },
  { name: 'cancel as the worker', method: 'POST', path: `/jobs/${JOB}/worker-cancellation`, body: { reason: 'Không thể đến vì bị ốm đột xuất' } },
  { name: 'ask Kael as the worker', method: 'POST', path: `/jobs/${JOB}/kael-clarify`, body: { question: 'Cần kiểm tra gì trước?' } },
]

const WRITE_OPERATIONS = new Set(['insert', 'update', 'upsert', 'delete'])
// The request audit trail (run, event, privileged-operation and authorized-request records) is written for every
// request, refused ones included; it is not a business write.
const isAuditCall = (table: string) => /harness/.test(table)

function harness(role: Role) {
  const client = makeSequenceClient([], {
    begin_harness_authorized_request: Array.from({ length: 4 }, () => ({ data: true, error: null })),
    finish_harness_authorized_request: Array.from({ length: 4 }, () => ({ data: true, error: null })),
  }, {})
  const providerCalls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    providerCalls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    return new Response('{}')
  }))
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true as const,
      user: { id: ACTOR },
      role,
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }) as never,
    services: createEdgeServices({ anthropicApiKey: 'test-anthropic', deepseekApiKey: 'test-deepseek' } as Parameters<typeof createEdgeServices>[0]),
  })
  const call = async (row: Row) => {
    const response = await handler(new Request(`https://edge.test/mobile-api${row.path}`, {
      method: row.method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(row.body),
    }))
    return { status: response.status, body: await response.json().catch(() => ({})) as Record<string, any> }
  }
  const businessCalls = () => client.calls.filter((entry) => !isAuditCall(entry.table))
  const touched = () => businessCalls().map((entry) => ({
    table: entry.table,
    writes: entry.operations.filter((operation) => WRITE_OPERATIONS.has(String(operation[0]))).length,
  })).filter((entry) => entry.table.startsWith('rpc:') || entry.writes > 0)
  return { client, call, providerCalls, touched, businessCalls }
}

describe(`${PILLAR.id}: a customer approval is never recorded for the wrong role`, () => {
  describe.each(['admin', 'worker'] as const)('as %s', (role) => {
    it.each(CUSTOMER_DECISIONS.map((row) => [row.name, row] as const))('%s is refused with no write, no function call and no provider call', async (_name, row) => {
      const { call, providerCalls, touched, businessCalls } = harness(role)

      const result = await call(row)
      const why = pillarWhy(PILLAR, `${role} ${row.method} ${row.path} -> ${result.status} ${JSON.stringify(result.body).slice(0, 160)} calls=${businessCalls().map((entry) => entry.table).join(',')}`)
      expect(result.status, why).toBe(403)
      expect(touched(), `${why} (nothing may be written or called)`).toEqual([])
      expect(providerCalls, why).toEqual([])
    })
  })
})

describe(`${PILLAR.id}: an admin does not open a dispute for either party`, () => {
  it('is refused with no write and no function call', async () => {
    const { call, touched, businessCalls } = harness('admin')

    const result = await call({ name: 'open a dispute', method: 'POST', path: `/jobs/${JOB}/disputes`, body: { dispute_type: 'other', initiator_statement: 'Công việc chưa hoàn thành đúng yêu cầu' } })
    const why = pillarWhy(PILLAR, `admin -> ${result.status} ${JSON.stringify(result.body).slice(0, 160)} calls=${businessCalls().map((entry) => entry.table).join(',')}`)
    expect(result.status, why).toBe(403)
    expect(touched(), why).toEqual([])
  })
})

describe(`${PILLAR.id}: a worker action is never taken for the wrong role`, () => {
  describe.each(['admin', 'customer'] as const)('as %s', (role) => {
    it.each(WORKER_ACTIONS.map((row) => [row.name, row] as const))('%s is refused with no write, no function call and no provider call', async (_name, row) => {
      const { call, providerCalls, touched, businessCalls } = harness(role)

      const result = await call(row)
      const why = pillarWhy(PILLAR, `${role} ${row.method} ${row.path} -> ${result.status} ${JSON.stringify(result.body).slice(0, 160)} calls=${businessCalls().map((entry) => entry.table).join(',')}`)
      expect(result.status, why).toBe(403)
      expect(touched(), `${why} (nothing may be written or called)`).toEqual([])
      expect(providerCalls, why).toEqual([])
    })
  })
})

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const caseState = (world: CaseWorld) => clone({ session: world.session(), turns: world.db.tables.kael_chat_turns })

describe(`${PILLAR.id}: an admin cannot decide, confirm or abandon a customer's Case`, () => {
  const ADMIN = { id: CASE_ADMIN_ID, role: 'admin' as const }

  it.each(['confirmed', 'correction_requested'] as const)('refuses the booking-intake decision %s and leaves the confirmation pending', async (decision) => {
    const world = pendingWorld('hvac')
    const before = caseState(world)

    const result = await world.request('/intake-confirmation', { decision }, { as: ADMIN })
    const why = pillarWhy(PILLAR, `status=${result.status} session=${world.session().status}`)
    expect(result.status, why).toBe(403)
    expect(caseState(world), `${why} (the customer's confirmation is not the admin's to give or withdraw)`).toEqual(before)
    expect((world.session().safe_metadata as Record<string, any>).intake_confirmation.status, why).toBe('pending')
    expect(world.modelCalls, why).toEqual([])
  })

  it('refuses to submit or skip evidence for the customer, so no customer turn is forged', async () => {
    const world = activeWorld()
    const before = caseState(world)

    const result = await world.request('/evidence', { language: 'vi', decision: 'skipped', skip_reason: 'Không có ảnh' }, { as: ADMIN })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(403)
    expect(caseState(world), why).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
  })

  it('still lets the owning customer make the same decisions, so the guard is the role and not the route', async () => {
    const pending = pendingWorld('hvac')
    const confirmed = await pending.request('/intake-confirmation', { decision: 'confirmed' }, { as: OWNER })
    expect(confirmed.status, pillarWhy(PILLAR, JSON.stringify(confirmed.body).slice(0, 120))).toBe(200)
    expect((pending.session().safe_metadata as Record<string, any>).intake_confirmation.status, pillarWhy(PILLAR, 'the owner confirmed')).toBe('confirmed')

    const world = activeWorld()
    const skipped = await world.request('/evidence', { language: 'vi', decision: 'skipped', skip_reason: 'Không có ảnh' }, { as: OWNER })
    expect(skipped.status, pillarWhy(PILLAR, JSON.stringify(skipped.body).slice(0, 120))).toBe(200)
  })
})

describe(`${PILLAR.id}: a Case stream refuses the wrong role before anything is written`, () => {
  it.each([
    ['the evidence stream', '/evidence-stream', { decision: 'skipped', skip_reason: 'Không có ảnh' }],
    ['the message stream', '/stream', { message: 'Máy treo tường hai bộ' }],
  ])('%s refuses an admin', async (_name, action, body) => {
    const world = activeWorld()
    const before = caseState(world)
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true as const,
        user: { id: CASE_ADMIN_ID },
        role: 'admin',
        supabase: world.db.client,
        privilegedSupabase: world.db.client,
        userSupabase: world.db.client,
      }) as never,
      services: world.services,
    })

    const response = await handler(new Request(`https://edge.test/mobile-api/kael/chat/${CASE_SESSION_ID}${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'vi', ...body }),
    }))
    const text = await response.text()
    const why = pillarWhy(PILLAR, `${action} -> ${response.status} ${text.slice(0, 240)}`)
    expect(response.status === 403 || /AUTH_FORBIDDEN|KAEL_PATH_CONTROL_DENIED/.test(text), `${why} (refused by role, not by an absent Case)`).toBe(true)
    expect(caseState(world), `${why} (nothing is written)`).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
  })
})

describe(`${PILLAR.id}: a request without its approval evidence fails before any call`, () => {
  it.each([
    ['an offer confirmation without a price receipt', `/kael/chat/${SESSION}/confirm`, {}],
    ['an offer confirmation with an empty receipt', `/kael/chat/${SESSION}/confirm`, { price_reasoning_receipt_id: '' }],
    ['a scope decision without a decision', `/scope-changes/${SCOPE}/decide`, {}],
    ['a scope decision that is neither approve nor reject', `/scope-changes/${SCOPE}/decide`, { decision: 'maybe' }],
    ['a price decision without the proposal it decides', `/jobs/${JOB}/rfq-price/decide`, { approve: true }],
    ['a price decision that names no outcome', `/jobs/${JOB}/rfq-price/decide`, { proposal_id: PROPOSAL }],
    ['an apartment authorization that names no worker or check-in', `/jobs/${JOB}/access/authorize`, { unexpected: true }],
    ['a payment claim without a transfer time', `/jobs/${JOB}/payment-order/claim`, {}],
    ['a matching start from a client that cannot name the operation', `/jobs/${JOB}/confirm-search`, {}],
  ])('%s', async (_name, path, body) => {
    const { call, providerCalls, touched, businessCalls } = harness('customer')

    const result = await call({ name: _name, method: 'POST', path, body: body as Record<string, unknown> })
    const why = pillarWhy(PILLAR, `${path} -> ${result.status} ${JSON.stringify(result.body).slice(0, 160)}`)
    expect([400, 409], why).toContain(result.status)
    expect(businessCalls().map((entry) => entry.table), `${why} (no database call before the approval evidence is valid)`).toEqual([])
    expect(touched(), why).toEqual([])
    expect(providerCalls, why).toEqual([])
  })
})

// The functions that record an approval or move a commitment, and the one module that defines each. The scan is by
// definition, so a renamed wrapper still has to be listed here before a Kael-layer or emergency module may reach it.
const APPROVAL_FUNCTIONS = {
  confirmKaelChat: 'domains/kael-chat/confirm.service.ts',
  requestDurableKaelConfirmation: 'domains/kael-chat/confirmation-operation.ts',
  recoverLegacyKaelConfirmation: 'domains/kael-chat/legacy-confirmation-recovery.ts',
  decideKaelIntakeConfirmation: 'domains/kael-chat/intake-confirmation.service.ts',
  confirmSearch: 'domains/matching/flow.ts',
  setJobMatchingPreference: 'domains/matching/matching-preference-selection.ts',
  confirmWorkerCandidate: 'domains/matching/candidate.ts',
  rejectWorkerCandidate: 'domains/matching/candidate.ts',
  decideScopeChange: 'domains/job/scope-change/decision.ts',
  decideRfqPrice: 'domains/job/rfq-price.ts',
  authorizeApartmentAccess: 'domains/worker/apartment-access.ts',
  createManualBankPaymentOrder: 'domains/payment/manual-bank.ts',
  claimManualBankPayment: 'domains/payment/manual-bank.ts',
  cancelJob: 'domains/customer/cancellation.ts',
  requestCustomerCancellation: 'domains/customer/cancellation.ts',
} as const
const DEFINERS: readonly string[] = [...new Set(Object.values(APPROVAL_FUNCTIONS))]

const SHARED_ROOT = resolve(__dirname, '../../../../../../supabase/functions/mobile-api/_shared')
const sourceFiles = (dir: string): string[] => readdirSync(dir).flatMap((entry) => {
  const full = join(dir, entry)
  if (statSync(full).isDirectory()) return sourceFiles(full)
  return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
})

function directImports(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const found = [...text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)].map((match) => match[1] as string)
  return found.map((specifier) => resolve(dirname(file), specifier)).filter((path) => path.endsWith('.ts'))
}

function closure(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [resolve(entry)]
  while (queue.length > 0) {
    const file = queue.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    for (const next of directImports(file)) queue.push(next)
  }
  return seen
}

const relativeToShared = (file: string) => relative(SHARED_ROOT, file).replace(/\\/g, '/')

describe(`${PILLAR.id}: nothing that answers an emergency or runs the model can record an approval`, () => {
  const defines = (file: string, name: string) => new RegExp(`export (?:async )?function ${name}\\b`).test(readFileSync(join(SHARED_ROOT, file), 'utf8'))

  it('lists, for every approval function, the module that still defines it', () => {
    const stale = Object.entries(APPROVAL_FUNCTIONS).filter(([name, file]) => !defines(file, name)).map(([name, file]) => `${name} -> ${file}`)
    expect(stale, pillarWhy(PILLAR, 'a moved or renamed function would leave the reachability rows below guarding nothing')).toEqual([])
  })

  it('has no file of the Kael layer import from the domains or the HTTP layer', () => {
    const offenders = sourceFiles(join(SHARED_ROOT, 'kael')).flatMap((file) =>
      directImports(file)
        .filter((target) => /[\\/]_shared[\\/](domains|http)[\\/]/.test(target))
        .map((target) => `${relativeToShared(file)} -> ${relativeToShared(target)}`))
    expect(offenders, pillarWhy(PILLAR, 'layers run http -> domains -> kael -> platform, never upward')).toEqual([])
  })

  it('reaches no module that defines an approval function from anywhere in the Kael layer', () => {
    const offenders = sourceFiles(join(SHARED_ROOT, 'kael')).flatMap((file) =>
      [...closure(file)].map(relativeToShared).filter((reached) => DEFINERS.includes(reached)).map((reached) => `${relativeToShared(file)} -> ${reached}`))
    expect(offenders, pillarWhy(PILLAR, 'the Kael layer proposes; it never reaches a module that records an approval')).toEqual([])
  })

  it.each([
    'domains/kael-chat/emergency-turn.ts',
    'domains/customer/assistant.ts',
  ])('%s reaches no module that defines an approval function', (entry) => {
    const reached = [...closure(join(SHARED_ROOT, entry))].map(relativeToShared)
    const offenders = reached.filter((file) => DEFINERS.includes(file))
    expect(offenders, pillarWhy(PILLAR, `${reached.length} files reached from ${entry}; an answer to a customer is a reply, never an approval`)).toEqual([])
  })

  it('reaches a cancellation only from archiving a conversation, which is the customer deleting it', () => {
    const callers = sourceFiles(SHARED_ROOT)
      .filter((file) => /\bcloseLinkedCustomerJob\(/.test(readFileSync(file, 'utf8')))
      .map(relativeToShared)
      .sort()
    expect(callers, pillarWhy(PILLAR, 'closeLinkedCustomerJob is defined in the turn module and called from the archive route only')).toEqual([
      'domains/customer/kael-conversation-turn.ts',
      'domains/customer/kael-conversation.ts',
    ])
    const turn = readFileSync(join(SHARED_ROOT, 'domains/customer/kael-conversation-turn.ts'), 'utf8')
    const sendTurn = turn.slice(turn.indexOf('export async function sendCustomerKaelConversationTurn'), turn.indexOf('function customerReasoningCompletion'))
    expect(/\b(cancelJob|requestCustomerCancellation|closeLinkedCustomerJob)\b/.test(sendTurn), pillarWhy(PILLAR, 'answering a normal-chat message never cancels a job')).toBe(false)
  })
})
