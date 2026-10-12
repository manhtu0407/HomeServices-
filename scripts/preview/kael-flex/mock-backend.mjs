import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MOCK_PASSWORD, MOCK_USERS, mockSession } from '../cache-e2e/mock-backend.mjs'

// Local stand-in for Auth, PostgREST and mobile-api that replays the Kael Work states of the shelf case.
// Every payload under fixtures/ is written by the real Edge code (pillar P374), so the screen is checked
// against what the server sends; only the state transition below is decided here. Accounts, tokens and
// rows exist only in this process.

export { MOCK_PASSWORD, MOCK_USERS, mockSession }

export const SESSION_ID = 'a3740000-0000-4000-8000-000000000001'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const STATES = ['01-price-gap', '02-question-answered', '03-worker-quote-ready']
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

// Control surface under /__mock: log, reset (back to the price gap), session?email=, state?name=.
export function startMockBackend({ port = 54398 } = {}) {
  let state = STATES[0]
  let log = []

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    const path = url.pathname
    if (req.method === 'OPTIONS') return send(res, 204)

    if (path.startsWith('/__mock/')) {
      if (path === '/__mock/log') return send(res, 200, log)
      if (path === '/__mock/reset') {
        log = []
        state = STATES[0]
        return send(res, 200, { ok: true, state })
      }
      if (path === '/__mock/state') {
        const name = url.searchParams.get('name')
        if (name && STATES.includes(name)) state = name
        return send(res, 200, { state })
      }
      if (path === '/__mock/session') {
        const user = MOCK_USERS[url.searchParams.get('email')]
        return user ? send(res, 200, mockSession(user)) : send(res, 404, { error: 'unknown mock user' })
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
      const chat = `/kael/chat/${SESSION_ID}`
      if (req.method === 'GET' && api === chat) return send(res, 200, fixture(state))
      if (req.method === 'POST' && (api === chat || api === `${chat}/stream`)) {
        const body = await readJson(req)
        entry.turn_intent = body.turn_intent ?? null
        entry.message = typeof body.message === 'string' ? body.message.slice(0, 120) : null
        state = nextState(state, body)
        entry.state = state
        return api.endsWith('/stream') ? sendStream(res, fixture(state)) : send(res, 200, fixture(state))
      }
      if (api === `${chat}/progress`) return send(res, 200, { progress: null })
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
