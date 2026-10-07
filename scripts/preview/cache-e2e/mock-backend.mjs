import { createServer } from 'node:http'

// Local stand-in for Supabase Auth + PostgREST + mobile-api, serving only what the cache and
// offline scenarios read. It lives on localhost so the mobile runtime guard accepts it, and it
// never proxies anywhere: every account, row and token below exists only in this process.

export const MOCK_PASSWORD = 'mock-secret'

export const MOCK_USERS = Object.freeze({
  'customer.a@nestscout.test': { id: '0b6f5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5a', role: 'customer', name: 'Khach A' },
  'customer.b@nestscout.test': { id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', role: 'customer', name: 'Khach B' },
  'worker.a@nestscout.test': { id: '9b2d3f4e-5a6b-4c7d-8e9f-1a2b3c4d5e6f', role: 'worker', name: 'Tho A' },
})

const historyRow = (id, serviceType, endedAt, finalPrice, worker) => ({
  ended_at: endedAt,
  final_price: finalPrice,
  id,
  service_type: serviceType,
  status: 'completed',
  worker: { avatar_url: null, is_favorite: false, ...worker },
})

// Prices are the on-screen markers the scenarios look for: 350.000 and 420.000 belong to A, 500.000 to B.
const HISTORY = {
  [MOCK_USERS['customer.a@nestscout.test'].id]: [
    historyRow('a1111111-1111-4111-8111-111111111111', 'electrical', '2026-10-01T03:00:00Z', 350000, { id: 'b1111111-1111-4111-8111-111111111111', display_name: 'Tho Dien Alpha' }),
    historyRow('a2222222-2222-4222-8222-222222222222', 'plumbing', '2026-09-20T03:00:00Z', 420000, { id: 'b2222222-2222-4222-8222-222222222222', display_name: 'Tho Nuoc Alpha', is_favorite: true }),
  ],
  [MOCK_USERS['customer.b@nestscout.test'].id]: [
    historyRow('b3333333-3333-4333-8333-333333333333', 'cleaning', '2026-09-28T03:00:00Z', 500000, { id: 'b4444444-4444-4444-8444-444444444444', display_name: 'Tho Ve Sinh Beta' }),
  ],
}

const CORS = {
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': '*',
}

const byId = Object.fromEntries(Object.values(MOCK_USERS).map((user) => [user.id, user]))
const emailOf = Object.fromEntries(Object.entries(MOCK_USERS).map(([email, user]) => [user.id, email]))
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function accessToken(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ aud: 'authenticated', email: emailOf[user.id], exp, role: 'authenticated', sub: user.id })}.mock`
}

function authUser(user) {
  const now = new Date().toISOString()
  return { app_metadata: { provider: 'email' }, aud: 'authenticated', created_at: now, email: emailOf[user.id], id: user.id, role: 'authenticated', updated_at: now, user_metadata: { full_name: user.name } }
}

export function mockSession(user) {
  return { access_token: accessToken(user), expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, refresh_token: `refresh-${user.id}`, token_type: 'bearer', user: authUser(user) }
}

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

async function readJson(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// Control surface under /__mock: log, reset, session?email=, and mode?offline=1&hang=1&delayMs=&profileDelayMs=.
export function startMockBackend({ port = 54399 } = {}) {
  const mode = { delayMs: 0, hang: false, offline: false, profileDelayMs: 0 }
  let log = []

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    const path = url.pathname
    if (req.method === 'OPTIONS') return send(res, 204)

    if (path.startsWith('/__mock/')) {
      if (path === '/__mock/log') return send(res, 200, log)
      if (path === '/__mock/reset') {
        log = []
        return send(res, 200, { ok: true })
      }
      if (path === '/__mock/mode') {
        for (const [key, value] of url.searchParams) mode[key] = key === 'offline' || key === 'hang' ? value === '1' : Number(value)
        return send(res, 200, mode)
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
    // Offline resets the connection with no HTTP response, which is what fetch sees on a dead cellular link.
    if (mode.offline) return req.socket.destroy()
    // Hang accepts the request and never answers, as on a 3G cell edge; only the client timeout ends it.
    if (mode.hang) return undefined
    if (mode.delayMs) await sleep(mode.delayMs)

    if (path === '/auth/v1/token') {
      const body = await readJson(req)
      const grant = url.searchParams.get('grant_type')
      const found = grant === 'password' ? MOCK_USERS[body.email] : byId[String(body.refresh_token || '').replace('refresh-', '')]
      if (!found || (grant === 'password' && body.password !== MOCK_PASSWORD)) {
        return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
      }
      return send(res, 200, mockSession(found))
    }
    if (path === '/auth/v1/user') return user ? send(res, 200, authUser(user)) : send(res, 401, { msg: 'invalid token' })
    if (path === '/auth/v1/logout') return send(res, 204)

    if (path === '/rest/v1/profiles') {
      if (mode.profileDelayMs) await sleep(mode.profileDelayMs)
      if (!user) return send(res, 401, { message: 'JWT required' })
      const row = { role: user.role }
      return String(req.headers.accept || '').includes('vnd.pgrst.object') ? send(res, 200, row) : send(res, 200, [row])
    }
    if (path.startsWith('/rest/v1/')) return send(res, 200, [])

    const api = path.replace(/^\/functions\/v1\/mobile-api/, '')
    if (api !== path) {
      if (!user) return send(res, 401, { code: 'UNAUTHORIZED', error: 'Unauthorized' })
      if (api === '/me/admin-activation') return send(res, 200, { capability_count: 0, email_masked: null, full_name: null, required: false, status: null })
      if (api === '/me/jobs/history') return send(res, 200, { service_history: HISTORY[user.id] ?? [] })
      if (api === '/notifications') return send(res, 200, { notifications: [], unread_count: 0 })
    }
    entry.unhandled = true
    return send(res, 404, { code: 'NOT_FOUND', error: 'Not served by the cache E2E mock' })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    // Hang mode leaves requests open on purpose, so they are cut before the server can close.
    const close = () => new Promise((done) => {
      server.closeAllConnections()
      server.close(() => done())
    })
    server.listen(port, '127.0.0.1', () => resolve({ close, port }))
  })
}
