import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALLOWED_ENV_NAMES, assertSupabasePublishableKey, parseArgs, parseEnvFile } from './production-web.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])
const PROCESS_ENV_NAMES = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
  'USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES',
  'PROGRAMFILES(X86)', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'LANG',
  'CI', 'PNPM_HOME', 'COREPACK_HOME',
])

function localUrl(value, path) {
  if (!value || value !== value.trim()) throw new Error('A local Supabase endpoint is required.')
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username || url.password || value.includes('?') || value.includes('#') ||
    (url.pathname.replace(/\/+$/, '') || '/') !== path) {
    throw new Error('Local Preview requires exact loopback endpoints without credentials, queries or fragments.')
  }
  return url
}

/**
 * The subprocess receives only public configuration and the OS environment needed to start Expo.
 * @param {string} text
 * @param {string} publicEnvPath
 * @param {Record<string, string | undefined>} [baseEnv]
 * @returns {Record<string, string | undefined>}
 */
export function buildLocalPreviewEnv(text, publicEnvPath, baseEnv = process.env) {
  const values = parseEnvFile(text)
  const supabaseUrl = values.EXPO_PUBLIC_SUPABASE_URL
  const apiBase = values.EXPO_PUBLIC_API_BASE_URL || `${supabaseUrl?.replace(/\/+$/, '')}/functions/v1/mobile-api`
  const auth = localUrl(supabaseUrl, '/')
  const api = localUrl(apiBase, '/functions/v1/mobile-api')
  if (auth.origin !== api.origin) throw new Error('Local Auth and mobile-api must use one exact origin.')
  assertSupabasePublishableKey(values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const cleanBase = Object.fromEntries(Object.entries(baseEnv).filter(([name]) => PROCESS_ENV_NAMES.has(name.toUpperCase())))
  return {
    ...cleanBase,
    EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
    EXPO_PUBLIC_API_BASE_URL: apiBase,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED: 'false',
    EXPO_PUBLIC_WEB_PREVIEW_CLIENT: 'true',
    EXPO_NO_DOTENV: '1',
    NESTSCOUT_MOBILE_ENV_FILE: publicEnvPath,
    BROWSER: 'none',
  }
}

function portIsFree(port) {
  return new Promise((done) => {
    const server = createServer()
    server.once('error', () => done(false))
    server.once('listening', () => server.close(() => done(true)))
    server.listen(port, '127.0.0.1')
  })
}

async function main() {
  const args = process.argv.slice(2)
  if (!args.includes('--env-file')) throw new Error('Pass --env-file with the local Supabase public configuration; Production env files are not used by default.')
  const options = parseArgs(args)
  const sourcePath = isAbsolute(options.envFile) ? options.envFile : resolve(root, options.envFile)
  if (!existsSync(sourcePath)) throw new Error('Local public env file is missing. Configure a local Auth/Edge stack first.')
  if (!existsSync(resolve(root, 'apps/mobile/node_modules/expo'))) throw new Error('Install workspace dependencies before opening local Preview.')
  const publicEnvPath = resolve(root, '.scratch/local-preview', `public-${options.port}.env`)
  const env = buildLocalPreviewEnv(readFileSync(sourcePath, 'utf8'), publicEnvPath)
  if (!await portIsFree(options.port)) throw new Error(`Preview port ${options.port} is occupied; the existing process was left untouched.`)
  let health
  try {
    health = await fetch(`${env.EXPO_PUBLIC_API_BASE_URL}/harness/health`, { signal: AbortSignal.timeout(5_000), redirect: 'error' })
  } catch {
    throw new Error('Local mobile-api health is unreachable; real backend Preview remains BLOCKED.')
  }
  if (!health.ok) throw new Error(`Local mobile-api health returned HTTP ${health.status}; real backend Preview remains BLOCKED.`)
  await health.body?.cancel()
  if (options.check) {
    console.log('Local target checks passed and mobile-api health is reachable. Authentication, source identity and real AI replies still require end-to-end verification.')
    return 0
  }
  // app.config reads this file independently of Expo dotenv, so it must contain only public values.
  mkdirSync(dirname(publicEnvPath), { recursive: true })
  writeFileSync(publicEnvPath, ALLOWED_ENV_NAMES.map((name) => `${name}=${env[name]}`).join('\n') + '\n')
  const command = [resolve(root, 'scripts/run.mjs'), 'run-package-script', '@nestscout/mobile', 'web', '--port', String(options.port)]
  if (options.clear) command.push('--clear')
  console.log(`Starting Customer-capable local mobile Preview on port ${options.port}. No hosted backend is selected.`)
  const child = spawn(process.execPath, command, { cwd: root, env, stdio: 'inherit' })
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal))
  return new Promise((done, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => done(code ?? 1))
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code }).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
