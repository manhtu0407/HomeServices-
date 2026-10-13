import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { WORKER_ID, JOB_PHASES, candidateResponse, completionNudgeState, jobDetail, jobIdFor, phaseForJobId } from './job-phases.mjs'
import { MOCK_PASSWORD, MOCK_USERS, mockSession } from '../cache-e2e/mock-backend.mjs'

// Local stand-in for Auth, PostgREST and mobile-api that replays the Kael Work states of the shelf case.
// Every payload under fixtures/ is written by the real Edge code (pillar P374), so the screen is checked
// against what the server sends; only the state transition below is decided here. Accounts, tokens and
// rows exist only in this process.

export { MOCK_PASSWORD, MOCK_USERS, mockSession }

export const SESSION_ID = 'a3740000-0000-4000-8000-000000000001'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const STATES = ['00-intake', '01-price-gap', '02-question-answered', '03-worker-quote-ready', '04-evidence-request']
const CHAT_LABELS = {
  '00-intake': 'Xác nhận thông tin công việc (intake_started)',
  '01-price-gap': 'Kael phân tích, thiếu nguồn giá (kael_estimating)',
  '02-question-answered': 'Kael trả lời câu hỏi của khách (kael_collecting)',
  '03-worker-quote-ready': 'Xem lại phạm vi, gửi thợ báo giá (ticket_review)',
  '04-evidence-request': 'Kael xin thêm ảnh hiện trạng (cổng bổ sung bằng chứng)',
}
// One session id per chat state; a session then moves on its own when the customer acts in it.
const sessionIdFor = (name) => (name === '01-price-gap'
  ? SESSION_ID
  : `a3740000-0000-4000-8000-${String(10 + STATES.indexOf(name)).padStart(12, '0')}`)
const startStateForSession = (id) => STATES.find((name) => sessionIdFor(name) === id) ?? null
const chatUrl = (name) => `http://localhost:8087/kael-chat?mode=case&sessionId=${sessionIdFor(name)}`
const jobUrl = (name) => `http://localhost:8087/kael-chat?mode=case&jobId=${jobIdFor(name)}`

// The intake step has no recorded Edge payload, so it is derived from the price-gap session.
function intakeFixture() {
  const f = fixture('01-price-gap')
  const first = f.turns[0]
  f.session.status = 'active'
  f.session.case_phase = 'intake'
  f.session.total_turns = 1
  f.session.next_action = 'confirm_intake'
  f.session.diagnosis_scope = null
  f.session.intake_confirmation = {
    blocking: true, checked_at: first.created_at, confirmed_at: null, correction_requested_at: null,
    focus: 'Kael đã kiểm tra mô tả, khu vực và thời gian trước khi phân tích.',
    question: 'Thông tin trên đã đúng chưa? Bạn xác nhận để Kael bắt đầu phân tích.',
    source: 'booking', status: 'pending', version: 1,
    fields: [
      { key: 'service', label: 'Dịch vụ', note: null, state: 'clear', value: 'Sửa vặt & Lắp đặt' },
      { key: 'problem', label: 'Vấn đề', note: null, state: 'clear', value: 'Khoan/lắp kệ' },
      { key: 'description', label: 'Mô tả', note: null, state: 'clear', value: 'Khoan lắp kệ gỗ 30x20cm, nặng khoảng 1kg lên tường gạch.' },
      { key: 'location', label: 'Khu vực', note: null, state: 'clear', value: 'S1.07 Vinhomes Grand Park' },
      { key: 'schedule', label: 'Thời gian', note: null, state: 'clear', value: 'T3 13/10 · Bắt đầu lúc 09:00' },
    ],
    issues: [],
    intake: {
      service_type: 'handyman', profile_id: 'task_scope', description: first.text_content,
      problem_chips: ['Khoan/lắp kệ'], address_label: 'S1.07 Vinhomes Grand Park', address_district: 'Thủ Đức',
      scheduled_at: f.session.scheduled_at, schedule_window: { date: '2026-10-13', start: '09:00', end: '11:00' },
    },
  }
  f.turns = [first]
  return f
}
// The evidence request is derived from the price-gap session: the server asks for a photo before pricing.
function evidenceFixture() {
  const f = fixture('01-price-gap')
  f.session.next_action = 'request_evidence'
  f.session.diagnosis_scope = {
    ...f.session.diagnosis_scope,
    missing_facts: ['photo'],
    next_action: { evidence_kind: 'photo', kind: 'request_evidence', prompt: 'Bạn chụp giúp Kael ảnh bức tường và vị trí muốn khoan.', required: true },
    quote_blockers: ['evidence'],
    quote_ready: false,
  }
  return f
}
const fixture = (name) => JSON.parse(readFileSync(join(fixtureDir, `${name}.json`), 'utf8'))

const CORS = {
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': '*',
}

const byId = Object.fromEntries(Object.values(MOCK_USERS).map((user) => [user.id, user]))

function userFromRequest(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  try {
    return byId[JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub] ?? null
  } catch {
    return null
  }
}

function send(res, status, body) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

function sendStream(res, data) {
  res.writeHead(200, { ...CORS, 'Cache-Control': 'no-cache', 'Content-Type': 'text/event-stream' })
  res.end(`event: result\ndata: ${JSON.stringify(data)}\n\n`)
}

async function readJson(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// A chip names its intent; typed text stands in for the classifier: a question goes to the answer state.
function nextState(current, body) {
  if (body.turn_intent === 'request_worker_quote') return '03-worker-quote-ready'
  if (body.turn_intent === 'ask_question') return '02-question-answered'
  if (!body.turn_intent && /\?|vì sao|sao chưa|why/i.test(String(body.message ?? ''))) return '02-question-answered'
  return current
}

// Control surface under /__mock: log, reset, session?email=, phases (index of per-phase URLs).
export function startMockBackend({ port = 54398 } = {}) {
  const sessionStates = new Map()
  const accessGrants = new Map()
  const completions = new Set()
  const nudges = new Map()
  let log = []

  const stateOf = (sessionId) => sessionStates.get(sessionId) ?? startStateForSession(sessionId)
  const chatPayload = (sessionId) => {
    const state = stateOf(sessionId)
    const payload = state === '00-intake' ? intakeFixture() : state === '04-evidence-request' ? evidenceFixture() : fixture(state)
    payload.session.id = sessionId
    for (const turn of payload.turns) turn.session_id = sessionId
    return payload
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    const path = url.pathname
    if (req.method === 'OPTIONS') return send(res, 204)

    if (path.startsWith('/__mock/')) {
      if (path === '/__mock/log') return send(res, 200, log)
      if (path === '/__mock/reset') {
        log = []
        sessionStates.clear()
        accessGrants.clear()
        completions.clear()
        nudges.clear()
        return send(res, 200, { ok: true })
      }
      if (path === '/__mock/session') {
        const user = MOCK_USERS[url.searchParams.get('email')]
        return user ? send(res, 200, mockSession(user)) : send(res, 404, { error: 'unknown mock user' })
      }
      if (path === '/__mock/phases') {
        const row = (href, label) => `<li><a href="${href}">${label}</a></li>`
        const groups = {}
        for (const [name, p] of Object.entries(JOB_PHASES)) (groups[p.group] ??= []).push(row(jobUrl(name), p.label))
        const html = `<!doctype html><meta charset="utf-8"><title>Kael phases</title><style>body{font:16px system-ui;max-width:640px;margin:32px auto;padding:0 16px}h2{margin-top:24px}li{margin:6px 0}</style><h1>Luồng khách — Kael Agentic</h1><p>Mỗi phase có URL riêng, mở nhiều tab song song được.</p><h2>Làm rõ &amp; báo giá</h2><ul>${STATES.map((n) => row(chatUrl(n), CHAT_LABELS[n])).join('')}</ul>${Object.entries(groups).map(([g, items]) => `<h2>${g}</h2><ul>${items.join('')}</ul>`).join('')}`
        res.writeHead(200, { ...CORS, 'Content-Type': 'text/html; charset=utf-8' })
        return res.end(html)
      }
      return send(res, 404, {})
    }

    const user = userFromRequest(req)
    const entry = { method: req.method, path: path + url.search, t: Date.now() }
    log.push(entry)

    if (path === '/auth/v1/token') {
      const body = await readJson(req)
      const grant = url.searchParams.get('grant_type')
      const found = grant === 'password' ? MOCK_USERS[body.email] : byId[String(body.refresh_token || '').replace('refresh-', '')]
      if (!found || (grant === 'password' && body.password !== MOCK_PASSWORD)) {
        return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
      }
      return send(res, 200, mockSession(found))
    }
    if (path === '/auth/v1/user') return user ? send(res, 200, mockSession(user).user) : send(res, 401, { msg: 'invalid token' })
    if (path === '/auth/v1/logout') return send(res, 204)

    if (path === '/rest/v1/profiles') {
      if (!user) return send(res, 401, { message: 'JWT required' })
      const row = { role: user.role }
      return String(req.headers.accept || '').includes('vnd.pgrst.object') ? send(res, 200, row) : send(res, 200, [row])
    }
    if (path.startsWith('/rest/v1/')) return send(res, 200, [])

    const api = path.replace(/^\/functions\/v1\/mobile-api/, '')
    if (api !== path) {
      if (!user) return send(res, 401, { code: 'UNAUTHORIZED', error: 'Unauthorized' })
      const chatMatch = api.match(/^\/kael\/chat\/([0-9a-f-]{36})(\/[a-z]+)?$/)
      if (chatMatch && stateOf(chatMatch[1])) {
        const [, sessionId, tail = ''] = chatMatch
        if (req.method === 'GET' && tail === '') return send(res, 200, chatPayload(sessionId))
        if (req.method === 'POST' && (tail === '' || tail === '/stream')) {
          const body = await readJson(req)
          entry.turn_intent = body.turn_intent ?? null
          entry.message = typeof body.message === 'string' ? body.message.slice(0, 120) : null
          sessionStates.set(sessionId, nextState(stateOf(sessionId), body))
          entry.state = stateOf(sessionId)
          return tail === '/stream' ? sendStream(res, chatPayload(sessionId)) : send(res, 200, chatPayload(sessionId))
        }
        // Confirmation creates a job server-side; the mock only records what the app asked for.
        if (req.method === 'POST' && tail === '/confirm') {
          const body = await readJson(req)
          entry.confirmation_kind = body.confirmation_kind ?? null
          return send(res, 501, { code: 'MOCK_CONFIRM_NOT_SERVED', error: 'The Kael flex mock records confirmations only' })
        }
        if (tail === '/progress') return send(res, 200, { progress: null })
      }
      const accessMatch = api.match(/^\/jobs\/([0-9a-f-]{36})\/access\/authorize$/)
      if (req.method === 'POST' && accessMatch && phaseForJobId(accessMatch[1])) {
        const context = jobDetail(phaseForJobId(accessMatch[1]))?.job.address_access.authorization_context
        const body = await readJson(req)
        if (!context || context.expected_worker_id !== body.expected_worker_id || context.expected_check_in_at !== body.expected_check_in_at) {
          return send(res, 409, { code: 'ACCESS_NOT_READY', error: 'The worker has not checked in for this visit' })
        }
        const receipt = {
          already_authorized: accessGrants.has(accessMatch[1]),
          authorized_at: new Date().toISOString(),
          checked_in_at: context.expected_check_in_at,
          job_id: accessMatch[1],
          release_stage: 'unit_released',
          worker_id: context.expected_worker_id,
        }
        if (!receipt.already_authorized) accessGrants.set(accessMatch[1], receipt)
        return send(res, 200, accessGrants.get(accessMatch[1]))
      }
      const rfqMatch = api.match(/^\/jobs\/([0-9a-f-]{36})\/rfq-price(\/decide)?$/)
      if (rfqMatch && phaseForJobId(rfqMatch[1])) {
        const proposal = (status) => ({
          created_at: new Date(Date.now() - 300_000).toISOString(),
          currency: 'VND', customer_id: MOCK_USERS['customer.a@nestscout.test'].id,
          customer_total: 520_000, decided_at: status === 'pending' ? null : new Date().toISOString(),
          id: 'f8b90000-0000-4000-8000-000000000009', job_id: rfqMatch[1], quote_mode: 'rfq', status,
          scope_summary: 'Thay hai bản lề kim loại, công thay và vật tư tắc kê nở, bảo hành 30 ngày.',
          worker_id: WORKER_ID,
        })
        if (req.method === 'GET' && !rfqMatch[2]) return send(res, 200, { job_id: rfqMatch[1], proposal: proposal('pending'), quote_mode: 'rfq' })
        if (req.method === 'POST' && rfqMatch[2]) {
          const body = await readJson(req)
          return send(res, 200, proposal(body.approve ? 'approved' : 'rejected'))
        }
      }
      const nudgeMatch = api.match(/^\/jobs\/([0-9a-f-]{36})\/nudge-completion$/)
      if (req.method === 'POST' && nudgeMatch && phaseForJobId(nudgeMatch[1])) {
        const sent = nudges.get(nudgeMatch[1]) ?? []
        const before = completionNudgeState(jobDetail(phaseForJobId(nudgeMatch[1])).job, sent)
        if (!before.can_nudge) {
          const codes = { COOLDOWN: 'NUDGE_COOLDOWN', LIMIT_REACHED: 'NUDGE_LIMIT_REACHED', TOO_EARLY: 'NUDGE_TOO_EARLY', WORK_PAUSED: 'NUDGE_WORK_PAUSED' }
          return send(res, 409, { code: codes[before.reason] ?? 'INVALID_STATUS', completion_nudge: before, error: 'Chưa thể nhắc thợ lúc này.' })
        }
        nudges.set(nudgeMatch[1], [...sent, Date.now()])
        const after = completionNudgeState(jobDetail(phaseForJobId(nudgeMatch[1])).job, nudges.get(nudgeMatch[1]))
        return send(res, 200, { ...after, job_id: nudgeMatch[1], nudged: true })
      }
      const completionMatch = api.match(/^\/jobs\/([0-9a-f-]{36})\/confirm-completion$/)
      if (req.method === 'POST' && completionMatch && phaseForJobId(completionMatch[1])) {
        if (jobDetail(phaseForJobId(completionMatch[1])).job.status !== 'completed_by_worker') {
          return send(res, 409, { code: 'INVALID_STATUS', error: 'The worker has not reported the work as done' })
        }
        completions.add(completionMatch[1])
        return send(res, 200, { job_id: completionMatch[1], status: 'payment_pending' })
      }
      const jobMatch = api.match(/^\/jobs\/([0-9a-f-]{36})(\/candidate)?$/)
      if (req.method === 'GET' && jobMatch && phaseForJobId(jobMatch[1])) {
        const name = phaseForJobId(jobMatch[1])
        if (jobMatch[2]) return send(res, 200, candidateResponse(name))
        const afterPayment = jobDetail('19-payment')
        const detail = completions.has(jobMatch[1])
          ? { ...afterPayment, job: { ...afterPayment.job, id: jobMatch[1] } }
          : jobDetail(name)
        if (detail.job.status === 'repairing') detail.completion_nudge = completionNudgeState(detail.job, nudges.get(jobMatch[1]) ?? [])
        const grant = accessGrants.get(jobMatch[1])
        if (grant) {
          detail.job.address_access = {
            ...detail.job.address_access,
            authorization_receipt: grant,
            exact_unit_released: true,
            release_stage: 'unit_released',
          }
        }
        return send(res, 200, detail)
      }
      if (req.method === 'GET' && api === '/me/jobs/active') return send(res, 200, { active_job: null })
      if (req.method === 'GET' && api === '/me/favorite-workers') return send(res, 200, { workers: [] })
      if (api === '/me/admin-activation') return send(res, 200, { capability_count: 0, email_masked: null, full_name: null, required: false, status: null })
      if (api === '/me/jobs/history') return send(res, 200, { service_history: [] })
      if (api === '/notifications') return send(res, 200, { notifications: [], unread_count: 0 })
    }
    entry.unhandled = true
    return send(res, 404, { code: 'NOT_FOUND', error: 'Not served by the Kael flex mock' })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    const close = () => new Promise((done) => {
      server.closeAllConnections()
      server.close(() => done())
    })
    server.listen(port, '127.0.0.1', () => resolve({ close, port }))
  })
}
