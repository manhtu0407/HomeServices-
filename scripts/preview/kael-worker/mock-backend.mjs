import { createServer } from 'node:http'

import { MOCK_PASSWORD, MOCK_USERS, mockSession } from '../cache-e2e/mock-backend.mjs'
import {
  DEFAULT_PHASE,
  WORKER_PHASES,
  earningsResponse,
  performanceInsights,
  profileResponse,
  routeMapSvg,
  incidentResponse,
  jobDetailResponse,
  problemPhotoSvg,
  scopeChangeCreated,
  scopeQuote,
  routePreview,
} from './worker-phases.mjs'

// Local stand-in for Auth, PostgREST and mobile-api that replays the worker's Case Work phases.
// The app keeps one active deal from /workers/me/jobs + /workers/me/broadcasts, so the mock holds
// one current phase; /__mock/go?phase= switches it and redirects into the matching app screen.
// Accounts, tokens and rows exist only in this process.

export { MOCK_PASSWORD, MOCK_USERS, mockSession }

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

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
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

// p1.localhost:8087 ... pN.localhost:8087 are separate origins, so each browser tab keeps its own phase.
function phaseForOrigin(origin) {
  const match = /^http:\/\/p(\d+)\.localhost(?::\d+)?$/.exec(String(origin ?? ''))
  return match ? Object.keys(WORKER_PHASES)[Number(match[1]) - 1] ?? null : null
}

export function startMockBackend({ port = 54398, appPort = 8087 } = {}) {
  let phase = DEFAULT_PHASE
  // Origins whose worker has sent a scope proposal: the job then reads as waiting for the customer.
  const proposed = new Set()
  let log = []
  const appUrl = (key) => `http://localhost:${appPort}/jobs?ns_worker_screen=${WORKER_PHASES[key].screen}&ns_worker_lang=vi`

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    const path = url.pathname
    if (req.method === 'OPTIONS') return send(res, 204)

    if (path.startsWith('/__mock/')) {
      if (path === '/__mock/log') return send(res, 200, log)
      if (path === '/__mock/reset-proposals') {
        proposed.clear()
        return send(res, 200, { ok: true })
      }
      if (path === '/__mock/phase') {
        const name = url.searchParams.get('name')
        if (name && WORKER_PHASES[name]) phase = name
        return send(res, 200, { phase })
      }
      if (path === '/__mock/go') {
        const name = url.searchParams.get('phase')
        if (!name || !WORKER_PHASES[name]) return send(res, 404, { error: 'unknown phase' })
        phase = name
        res.writeHead(302, { Location: appUrl(name) })
        return res.end()
      }
      if (path === '/__mock/session') {
        const user = MOCK_USERS[url.searchParams.get('email') ?? 'worker.a@nestscout.test']
        return user ? send(res, 200, mockSession(user)) : send(res, 404, { error: 'unknown mock user' })
      }
      if (path === '/__mock/phases') {
        const rows = Object.entries(WORKER_PHASES).map(([key, entry]) =>
          `<li><a href="/__mock/go?phase=${key}">${entry.label}</a>${key === phase ? ' &larr; hiện tại' : ''}</li>`).join('')
        return sendHtml(res, `<!doctype html><meta charset="utf-8"><title>Worker phases</title><body style="font:16px system-ui;padding:24px"><h3>Kael thợ nhận Job &middot; ${Object.keys(WORKER_PHASES).length} phase</h3><ul>${rows}</ul>`)
      }
      return send(res, 404, {})
    }

    const user = userFromRequest(req)
    const entry = { method: req.method, path: path + url.search, t: Date.now(), phase }
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

    if (path.startsWith('/storage/v1/')) {
      if (req.method === 'POST' && path.startsWith('/storage/v1/object/sign/')) {
        return send(res, 200, { signedURL: path.replace('/storage/v1', '') + '?token=mock' })
      }
      res.writeHead(200, { ...CORS, 'Cache-Control': 'no-store', 'Content-Type': 'image/svg+xml' })
      return res.end(problemPhotoSvg())
    }
    if (path === '/rest/v1/profiles') {
      if (!user) return send(res, 401, { message: 'JWT required' })
      const row = { role: user.role }
      return String(req.headers.accept || '').includes('vnd.pgrst.object') ? send(res, 200, row) : send(res, 200, [row])
    }
    if (path.startsWith('/rest/v1/')) return send(res, 200, [])

    const api = path.replace(/^\/functions\/v1\/mobile-api/, '')
    if (api !== path) {
      if (!user) return send(res, 401, { code: 'UNAUTHORIZED', error: 'Unauthorized' })
      const current = WORKER_PHASES[phaseForOrigin(req.headers.origin) ?? phase]
      if (req.method === 'GET' && api === '/workers/me') return send(res, 200, profileResponse())
      const incidentMatch = /^\/jobs\/([^/]+)\/kael-incident(\/(preview-scope|propose-scope))?$/.exec(api)
      if (incidentMatch) {
        const jobId = incidentMatch[1]
        const step = incidentMatch[3]
        if (req.method === 'GET') return send(res, 200, { incident: null })
        if (step === 'preview-scope') return send(res, 200, { incident: incidentResponse(jobId), quote: scopeQuote(jobId) })
        if (step === 'propose-scope') proposed.add(String(req.headers.origin ?? ''))
        if (step === 'propose-scope') return send(res, 200, { incident: incidentResponse(jobId, 'scope_proposed'), scope_change: scopeChangeCreated(jobId) })
        return send(res, 200, { incident: incidentResponse(jobId), quote: scopeQuote(jobId) })
      }
      const detailMatch = /^\/jobs\/([^/]+)$/.exec(api)
      if (req.method === 'GET' && detailMatch) {
        const detail = jobDetailResponse(current, detailMatch[1])
        if (detail && proposed.has(String(req.headers.origin ?? ''))) {
          detail.job.status = 'scope_change_pending'
        } else if (detail) {
          detail.current_scope_change = null
        }
        return detail ? send(res, 200, detail) : send(res, 404, { code: 'NOT_FOUND', error: 'No such job in this phase' })
      }
      if (req.method === 'GET' && api === '/workers/me/broadcasts') return send(res, 200, { broadcasts: current.broadcasts })
      if (req.method === 'GET' && api === '/workers/me/jobs') {
        const waiting = proposed.has(String(req.headers.origin ?? ''))
        return send(res, 200, { jobs: waiting ? current.jobs.map((entry) => ({ ...entry, status: 'scope_change_pending' })) : current.jobs })
      }
      if (req.method === 'GET' && api === '/workers/me/earnings') return send(res, 200, earningsResponse(current.ledger ?? []))
      if (req.method === 'GET' && api === '/workers/me/performance-insights') return send(res, 200, performanceInsights())
      if (req.method === 'GET' && /^\/workers\/me\/jobs\/[^/]+\/route-preview$/.test(api)) return send(res, 200, routePreview())
      if (req.method === 'GET' && /^\/workers\/me\/jobs\/[^/]+\/route-map$/.test(api)) {
        res.writeHead(200, { ...CORS, 'Cache-Control': 'private, no-store', 'Content-Type': 'image/svg+xml' })
        return res.end(routeMapSvg())
      }
      if (req.method === 'POST' && api === '/workers/me/matching-heartbeat') {
        return send(res, 200, { active_until: new Date(Date.now() + 300_000).toISOString(), server_time: new Date().toISOString() })
      }
      if (req.method === 'POST' && api === '/workers/me/activity-minute') return send(res, 200, { active_minutes: 4201 })
      if (req.method === 'GET' && api === '/workers/me/payout-method') return send(res, 200, { payout_method: null })
      if (req.method === 'GET' && api === '/workers/me/withdrawal-requests') return send(res, 200, { requests: [] })
      if (req.method === 'GET' && api === '/workers/me/violations') return send(res, 200, { cases: [] })
      if (req.method === 'GET' && api === '/notifications') return send(res, 200, { notifications: [], unread_count: 0 })
      if (api === '/me/admin-activation') return send(res, 200, { capability_count: 0, email_masked: null, full_name: null, required: false, status: null })
      if (req.method === 'POST' && /^\/workers\/me\/broadcasts\/[^/]+\/seen$/.test(api)) return send(res, 200, {})
    }
    entry.unhandled = true
    return send(res, 404, { code: 'NOT_FOUND', error: 'Not served by the Kael worker mock' })
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
