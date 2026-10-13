#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { startMockBackend } from './mock-backend.mjs'
import { startWebProxy } from './web-proxy.mjs'

// Starts the worker Case Work mock and an Expo web build pointed at it, to walk the worker Jobs phases by hand.
// Ctrl+C stops both. Open the phase index, sign in as worker.a@nestscout.test (password in cache-e2e/mock-backend.mjs)
// or write /__mock/session into localStorage (key sb-localhost-auth-token).

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const mobile = join(root, 'apps', 'mobile')
const MOCK_PORT = 54398
const APP_PORT = 8087
// Metro listens here; the proxy on APP_PORT adds a fixed device position to the page.
const METRO_PORT = APP_PORT + 100

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

async function main() {
  for (const port of [MOCK_PORT, APP_PORT, METRO_PORT]) {
    if (!(await portFree(port))) throw new Error(`port ${port} is in use; stop the other preview first`)
  }
  const backend = await startMockBackend({ port: MOCK_PORT, appPort: APP_PORT })
  // Metro roots its transform cache in os.tmpdir(); a private TEMP keeps another checkout's bundle out of this one.
  const tmp = join(mobile, '.expo', 'metro-tmp-kael-worker')
  mkdirSync(tmp, { recursive: true })
  const metro = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--web', '--port', String(METRO_PORT), '--clear'], {
    cwd: mobile,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      BROWSER: 'none',
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_API_BASE_URL: `http://localhost:${MOCK_PORT}/functions/v1/mobile-api`,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-key',
      EXPO_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK_PORT}`,
      // Without the web-preview identity the app refuses typed Kael turns on web as an unreleased client.
      EXPO_PUBLIC_WEB_PREVIEW_CLIENT: 'true',
      TEMP: tmp,
      TMP: tmp,
    },
    stdio: 'inherit',
  })
  const proxy = await startWebProxy({ port: APP_PORT, target: METRO_PORT })
  const stop = async () => {
    killTree(metro)
    await proxy.close()
    await backend.close()
  }
  process.once('SIGINT', () => { void stop().then(() => process.exit(130)) })
  process.once('SIGTERM', () => { void stop().then(() => process.exit(143)) })
  metro.once('exit', (code) => { void proxy.close().then(() => backend.close()).then(() => process.exit(code ?? 1)) })
  console.log(`mock on http://127.0.0.1:${MOCK_PORT}; phase index http://127.0.0.1:${MOCK_PORT}/__mock/phases; app http://localhost:${APP_PORT}`)
}

main().catch((error) => {
  console.error(String(error?.stack ?? error))
  process.exit(2)
})
