#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { startMockBackend } from './mock-backend.mjs'

// Cache, offline and 3G checks for the Expo web build against a local mock backend, driven through a
// headless Chromium browser over CDP. Usage: `node scripts/preview/cache-e2e/run.mjs` runs every
// scenario and exits non-zero on a failure; `--serve` only starts the mock and Metro for manual use.
// Runbook: docs/ops/cache-e2e.md.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const mobile = join(root, 'apps', 'mobile')
const outDir = join(root, '.scratch', 'cache-e2e')
const MOCK_PORT = 54399
const APP_PORT = 8098
const CDP_PORT = 9333
const APP = `http://localhost:${APP_PORT}`
const MOCK = `http://127.0.0.1:${MOCK_PORT}`
const serveOnly = process.argv.includes('--serve')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const BROWSER_CANDIDATES = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'],
  win32: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ],
}

function findBrowser() {
  const override = process.env.CACHE_E2E_BROWSER
  if (override) return existsSync(override) ? override : null
  return (BROWSER_CANDIDATES[process.platform] ?? []).find((candidate) => existsSync(candidate)) ?? null
}

function portFree(port) {
  return new Promise((resolvePort) => {
    const probe = createServer()
    probe.once('error', () => resolvePort(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolvePort(true)))
  })
}

function killTree(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else {
    try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
  }
}

// Metro roots its transform cache in os.tmpdir(); a private TEMP keeps another checkout's bundle out of this one.
function startMetro() {
  const metroLog = serveOnly ? null : openSync(join(outDir, 'metro.log'), 'w')
  const tmp = join(mobile, '.expo', 'metro-tmp')
  mkdirSync(tmp, { recursive: true })
  return spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--web', '--port', String(APP_PORT), '--clear'], {
    cwd: mobile,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      BROWSER: 'none',
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_API_BASE_URL: `http://localhost:${MOCK_PORT}/functions/v1/mobile-api`,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-key',
      EXPO_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK_PORT}`,
      TEMP: tmp,
      TMP: tmp,
    },
    stdio: serveOnly ? 'inherit' : ['ignore', metroLog, metroLog],
  })
}

async function waitForApp(metro, timeoutMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (metro.exitCode !== null) throw new Error(`Metro exited with code ${metro.exitCode}; see ${join(outDir, 'metro.log')}`)
    try {
      const html = await (await fetch(APP)).text()
      const bundle = /src="([^"]*\.bundle[^"]*)"/.exec(html)?.[1]
      if (bundle) {
        // The first bundle request pays the cold Metro build; doing it here keeps it out of every timing below.
        const res = await fetch(new URL(bundle, APP))
        if (res.ok) return true
      }
    } catch { /* Metro still starting */ }
    await sleep(2000)
  }
  return false
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg)
        this.pending.delete(msg.id)
      }
    }
  }

  static async connect(port) {
    for (let i = 0; i < 100; i++) {
      try {
        const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')
        if (page) {
          const ws = new WebSocket(page.webSocketDebuggerUrl)
          await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
          return new Cdp(ws)
        }
      } catch { /* browser still starting */ }
      await sleep(200)
    }
    throw new Error('browser did not expose a page target')
  }

  send(method, params = {}) {
    const id = ++this.seq
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => this.pending.set(id, (msg) => (msg.error ? rej(new Error(`${method}: ${msg.error.message}`)) : res(msg.result))))
  }

  async evaluate(expression) {
    const out = await this.send('Runtime.evaluate', { awaitPromise: true, expression, returnByValue: true })
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description ?? out.exceptionDetails.text)
    return out.result.value
  }
}

// Records, from the first frame of every document, when each marker string first appears.
const FIRST_PAINT_HOOK = `
  window.__marks = {}
  window.__watch = ['350.000', '500.000']
  const check = () => {
    const t = document.body ? document.body.innerText : ''
    if (!window.__marks.firstText && t.trim()) window.__marks.firstText = Math.round(performance.now())
    for (const m of window.__watch) if (!window.__marks[m] && t.includes(m)) window.__marks[m] = Math.round(performance.now())
  }
  new MutationObserver(check).observe(document, { characterData: true, childList: true, subtree: true })
`

async function runScenarios(cdp) {
  const results = []
  const record = (name, pass, detail) => {
    results.push({ detail, name, pass })
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${JSON.stringify(detail)}`)
  }
  const mock = async (path) => (await fetch(MOCK + path)).json()
  const mode = (query) => mock(`/__mock/mode?${query}`)
  const requestsSince = async (t0, pattern) => (await mock('/__mock/log')).filter((e) => e.t >= t0 && (!pattern || e.path.includes(pattern)))
  const describeRequests = (list, t0) => list.map((e) => `${e.t - t0}ms ${e.path.replace('/functions/v1/mobile-api', '').slice(0, 44)}`)
  const text = () => cdp.evaluate('document.body ? document.body.innerText : ""')
  const pathname = () => cdp.evaluate('location.pathname')
  const visible = (testId) => cdp.evaluate(`!!document.querySelector('[data-testid=${testId}]')`)
  const hasPill = () => visible('offline-status-pill')
  const waitFor = async (fn, timeoutMs, stepMs = 25) => {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      try { if (await fn()) return Date.now() - t0 } catch { /* page navigating */ }
      await sleep(stepMs)
    }
    return null
  }
  const clickLabel = (label) => cdp.evaluate(`(() => { const el = Array.from(document.querySelectorAll('[role=button],[role=tab],a')).find(e => (e.getAttribute('aria-label') || e.innerText || '').trim() === ${JSON.stringify(label)}); if (el) el.click(); return !!el })()`)
  const clickContaining = (label) => cdp.evaluate(`(() => { const el = Array.from(document.querySelectorAll('[role=button],a,[tabindex]')).reverse().find(e => (e.getAttribute('aria-label') || e.innerText || '').includes(${JSON.stringify(label)})); if (el) el.click(); return !!el })()`)
  const go = async (path) => {
    await cdp.send('Page.navigate', { url: APP + path })
    await waitFor(async () => (await cdp.evaluate('document.readyState')) === 'complete', 30_000)
  }
  const seedSession = async (email) => {
    const session = await mock(`/__mock/session?email=${encodeURIComponent(email)}`)
    await cdp.evaluate(`localStorage.setItem('sb-localhost-auth-token', ${JSON.stringify(JSON.stringify(session))})`)
  }
  const shot = async (name) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'))
  }
  const historyOf = async (marker) => (await text()).includes(marker)

  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { deviceScaleFactor: 2, height: 844, mobile: true, width: 390 })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: FIRST_PAINT_HOOK })
  await mode('offline=0&hang=0&delayMs=0&profileDelayMs=0')
  await go('/')
  await cdp.evaluate('localStorage.clear(); sessionStorage.clear()')

  // Cold start, slow backend (every read 2 s, role read 7 s): first without any cache, then with it.
  await seedSession('customer.a@nestscout.test')
  await mode('delayMs=2000&profileDelayMs=5000')
  await go('/history')
  await waitFor(() => historyOf('350.000'), 30_000)
  const noCache = await cdp.evaluate('window.__marks')
  await mode('delayMs=0&profileDelayMs=0')
  await sleep(1500)
  const envelope = await cdp.evaluate(`JSON.parse(localStorage.getItem('nestscout.resource-cache.v1') || 'null')`)
  const displayOnly = /^(auth\.role|auth\.admin-activation|notifications|customer\.(service-history|membership|compensation|profile-insights))/
  record('the disk envelope holds one owner and display data only', Boolean(envelope) && Object.keys(envelope.entries).every((k) => displayOnly.test(k)), { keys: envelope && Object.keys(envelope.entries) })

  await mode('delayMs=2000&profileDelayMs=5000')
  await go('/history')
  await waitFor(() => historyOf('350.000'), 30_000)
  const withCache = await cdp.evaluate('window.__marks')
  record('a cold start paints cached data before the role read returns', withCache['350.000'] < 7000 && withCache['350.000'] < noCache['350.000'], { noCache, withCache })
  await mode('delayMs=0&profileDelayMs=0')
  await sleep(8000)

  // Tab re-entry inside staleMs: no request, data on the first frame, even with a 3 s backend.
  await mode('delayMs=3000')
  let t0 = Date.now()
  const reentry = []
  for (const label of ['Hồ sơ', 'Hoạt động', 'Trang chủ', 'Hoạt động']) {
    await clickLabel(label)
    if (label === 'Hoạt động') reentry.push(await waitFor(() => historyOf('350.000'), 6000, 10))
    await sleep(1200)
  }
  const historyCalls = (await requestsSince(t0, '/me/jobs/history')).length
  record('re-entering the tab shows cached history without a request', historyCalls === 0 && reentry.every((ms) => ms !== null && ms < 300), { historyCalls, rowVisibleMs: reentry })
  await mode('delayMs=0')

  // Dead link at launch with a cache: data stays, the pill appears, no profile error.
  await mode('offline=1')
  await go('/history')
  const dataMs = await waitFor(() => historyOf('350.000'), 20_000)
  const pillMs = await waitFor(hasPill, 20_000)
  await shot('offline-cached-history')
  record('an offline launch keeps cached data and shows the pill', dataMs !== null && pillMs !== null && (await pathname()) === '/history', { dataMs, pillMs, path: await pathname() })

  await sleep(2000)
  await mode('offline=0')
  t0 = Date.now()
  const backMs = await waitFor(async () => !(await hasPill()), 45_000, 100)
  record('the app comes back online without a tap', backMs !== null && backMs <= 31_000, { pillGoneMs: backMs, requests: describeRequests(await requestsSince(t0), t0) })

  // Loaded and idle when the link dies and returns: only the recovery probe can notice.
  await sleep(3000)
  await mode('offline=1')
  await clickLabel('Hồ sơ')
  await sleep(500)
  await clickLabel('Hoạt động')
  const idleOfflineMs = await waitFor(hasPill, 30_000, 100)
  await sleep(1000)
  await mode('offline=0')
  t0 = Date.now()
  const idleBackMs = await waitFor(async () => !(await hasPill()), 45_000, 100)
  const idleRequests = await requestsSince(t0)
  record('an idle screen recovers through the probe', idleOfflineMs !== null && idleBackMs !== null && Boolean(idleRequests[0]?.path.includes('/notifications')), { idleBackMs, requests: describeRequests(idleRequests, t0) })

  // Weak 3G: requests hang. Two bounded timeouts, then offline; the cached screen stays.
  await mode('hang=1')
  t0 = Date.now()
  await clickLabel('Hồ sơ')
  await sleep(500)
  await clickLabel('Hoạt động')
  const hangMs = await waitFor(hasPill, 70_000, 200)
  record('a hanging link is detected within two bounded timeouts', hangMs !== null && hangMs <= 35_000, { pillMs: hangMs, stillShowsHistory: await historyOf('350.000') })
  await mode('hang=0')
  await waitFor(async () => !(await hasPill()), 45_000, 200)

  // DevTools Slow 3G on a loaded app: cached tabs do not wait on the network.
  await cdp.send('Network.emulateNetworkConditions', { downloadThroughput: 50_000, latency: 2000, offline: false, uploadThroughput: 50_000 })
  await clickLabel('Trang chủ')
  await sleep(800)
  await clickLabel('Hoạt động')
  const slowMs = await waitFor(() => historyOf('350.000'), 10_000, 10)
  record('Slow 3G: a cached tab paints without waiting', slowMs !== null && slowMs < 500, { rowMs: slowMs })
  await cdp.send('Network.emulateNetworkConditions', { downloadThroughput: -1, latency: 0, offline: false, uploadThroughput: -1 })

  // Sign out through the UI, then a second customer on the same device.
  await clickLabel('Hồ sơ')
  await sleep(1500)
  await clickContaining('Đăng xuất')
  await waitFor(async () => (await pathname()) === '/login', 10_000)
  await sleep(600)
  const afterSignOut = await cdp.evaluate(`({ cache: localStorage.getItem('nestscout.resource-cache.v1'), path: location.pathname, session: !!localStorage.getItem('sb-localhost-auth-token') })`)
  record('sign-out clears the cached data from disk', afterSignOut.path === '/login' && afterSignOut.cache === null && !afterSignOut.session, afterSignOut)

  await seedSession('customer.b@nestscout.test')
  await go('/history')
  const bMs = await waitFor(() => historyOf('500.000'), 20_000)
  record('account B sees only its own history', bMs !== null && !(await historyOf('350.000')), { bVisibleMs: bMs })

  // A left on disk (crash before the wipe), B launches offline with no cache of its own.
  await go('/')
  await cdp.evaluate('localStorage.clear()')
  await seedSession('customer.a@nestscout.test')
  await go('/history')
  await waitFor(() => historyOf('350.000'), 20_000)
  await sleep(1500)
  await seedSession('customer.b@nestscout.test')
  await mode('offline=1')
  await go('/history')
  const offlineScreenMs = await waitFor(() => visible('session-offline-screen'), 15_000, 50)
  // The colour scheme is read at load, so each capture reloads under its emulated scheme.
  for (const scheme of ['light', 'dark']) {
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
    await go('/history')
    await waitFor(() => visible('session-offline-screen'), 15_000, 50)
    await shot(`offline-first-launch-no-cache-${scheme}`)
  }
  await cdp.send('Emulation.setEmulatedMedia', { features: [] })
  const leaked = (await historyOf('350.000')) || (await historyOf('420.000'))
  record('a leftover envelope of A never shows to B; B gets the offline screen, not the Login Gate', !leaked && offlineScreenMs !== null && (await pathname()) !== '/login', { leakedA: leaked, offlineScreenMs, path: await pathname() })

  await mode('offline=0')
  t0 = Date.now()
  const recoveredMs = await waitFor(() => historyOf('500.000'), 45_000, 100)
  record('the offline screen recovers to B without a tap', recoveredMs !== null && !(await visible('session-offline-screen')), { recoveredMs, requests: describeRequests(await requestsSince(t0), t0).slice(0, 6) })

  return results
}

async function main() {
  for (const port of [MOCK_PORT, APP_PORT, ...(serveOnly ? [] : [CDP_PORT])]) {
    if (!(await portFree(port))) throw new Error(`port ${port} is in use; stop the other preview first`)
  }
  mkdirSync(outDir, { recursive: true })
  const browserPath = serveOnly ? null : findBrowser()
  if (!serveOnly && !browserPath) throw new Error('no Chromium browser found; set CACHE_E2E_BROWSER to a Chrome or Edge binary')

  const backend = await startMockBackend({ port: MOCK_PORT })
  const metro = startMetro()
  let browser = null
  const stop = async () => {
    killTree(browser)
    killTree(metro)
    await backend.close()
  }
  process.once('SIGINT', () => { void stop().then(() => process.exit(130)) })

  try {
    console.log(`mock backend on ${MOCK}; starting Metro on ${APP} (first build takes a few minutes)`)
    if (!(await waitForApp(metro, 10 * 60_000))) throw new Error(`Metro did not serve the app bundle; see ${join(outDir, 'metro.log')}`)
    if (serveOnly) {
      console.log(`ready: open ${APP}/login and sign in with customer.a@nestscout.test (password in mock-backend.mjs); Ctrl+C stops both`)
      await new Promise(() => undefined)
    }

    const profile = join(outDir, 'browser-profile')
    rmSync(profile, { force: true, recursive: true })
    browser = spawn(browserPath, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--window-size=430,932', 'about:blank'], { stdio: 'ignore' })
    const cdp = await Cdp.connect(CDP_PORT)
    let results
    try {
      results = await runScenarios(cdp)
    } finally {
      cdp.ws.close()
    }
    const failed = results.filter((r) => !r.pass).length
    writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2))
    console.log(`\n${results.length - failed}/${results.length} passed · screenshots and results.json in ${outDir}`)
    process.exitCode = failed ? 1 : 0
  } finally {
    await stop()
  }
}

main().catch((error) => {
  console.error(String(error?.stack ?? error))
  process.exit(2)
})
