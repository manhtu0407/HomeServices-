import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// POSIX twin of scripts/run-mobile-web-preview.ps1 + scripts/lib/staging-target-safety.ps1.
// Sourcing .env.local straight into a shell exports every key in it, harness passwords included,
// and skips the Production-origin and publishable-key checks; this launcher keeps both guards on
// macOS and Linux exactly as the PowerShell path enforces them on Windows.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export const PRODUCTION_PROJECT_REF = 'iwevizmsedyqozxlawwl'
export const DEFAULT_ENV_FILE = 'apps/mobile/.env.local'
export const DEFAULT_PORT = 8085
export const ALLOWED_ENV_NAMES = Object.freeze([
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_API_BASE_URL',
])

export function parseEnvFile(text, allowedNames = ALLOWED_ENV_NAMES) {
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const match = /^\s*(?:export\s+)?([^=]+?)\s*=\s*(.*)$/.exec(trimmed)
    if (!match) continue
    const name = match[1].trim()
    if (!allowedNames.includes(name)) continue
    let value = match[2].trim()
    if (value.length >= 2) {
      const first = value[0]
      const last = value[value.length - 1]
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) value = value.slice(1, -1)
    }
    values[name] = value
  }
  return values
}

function trustedSupabaseUrl(value, label, expectedPath) {
  const expectedOrigin = `https://${PRODUCTION_PROJECT_REF}.supabase.co`
  if (!value || value !== value.trim()) {
    throw new Error(`${label} must use the exact production Supabase origin ${expectedOrigin}.`)
  }
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL.`)
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== `${PRODUCTION_PROJECT_REF}.supabase.co` ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    value.includes('?') ||
    value.includes('#')
  ) {
    throw new Error(
      `${label} must use the exact production Supabase origin ${expectedOrigin} without credentials, query, or fragment.`,
    )
  }
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (path !== expectedPath) throw new Error(`${label} must use path ${expectedPath}.`)
  return url
}

export function assertProductionSupabaseTargets(supabaseUrl, mobileApiUrl) {
  const supabase = trustedSupabaseUrl(supabaseUrl, 'Supabase URL', '/')
  const mobileApi = trustedSupabaseUrl(mobileApiUrl, 'mobile-api URL', '/functions/v1/mobile-api')
  if (supabase.origin.toLowerCase() !== mobileApi.origin.toLowerCase()) {
    throw new Error('Supabase and mobile-api targets must use the same production origin.')
  }
}

function legacyJwtRole(value) {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    return String(JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString('utf8')).role ?? '')
  } catch {
    return null
  }
}

export function assertSupabasePublishableKey(value) {
  if (!value || value !== value.trim() || value.length > 4096 || /[\x00-\x20\x7f]/.test(value)) {
    throw new Error('Supabase publishable key is invalid.')
  }
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return
  if (legacyJwtRole(value) === 'anon') return
  throw new Error('Supabase publishable key must not contain server authority.')
}

// Builds the child environment from a clean allowlist: nothing else from the env file is
// exported, and the staging payment rail is forced off so a Production preview cannot reach it.
/**
 * @param {string} envText
 * @param {string} envFilePath
 * @param {Record<string, string | undefined>} [baseEnv]
 * @returns {Record<string, string | undefined>}
 */
export function buildPreviewEnv(envText, envFilePath, baseEnv = process.env) {
  const values = parseEnvFile(envText)
  const supabaseUrl = values.EXPO_PUBLIC_SUPABASE_URL
  const publishableKey = values.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl) throw new Error('Missing required local environment variable: EXPO_PUBLIC_SUPABASE_URL')
  if (!publishableKey) {
    throw new Error('Missing required local environment variable: EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  }
  const apiBase = values.EXPO_PUBLIC_API_BASE_URL || `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/mobile-api`

  assertProductionSupabaseTargets(supabaseUrl, apiBase)
  assertSupabasePublishableKey(publishableKey)

  const env = { ...baseEnv }
  for (const name of Object.keys(env)) {
    if (name.startsWith('EXPO_PUBLIC_') || name.startsWith('SECTION32_')) delete env[name]
  }
  return {
    ...env,
    EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    EXPO_PUBLIC_API_BASE_URL: apiBase,
    EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED: 'false',
    EXPO_PUBLIC_WEB_PREVIEW_CLIENT: 'true',
    EXPO_NO_DOTENV: '1',
    NESTSCOUT_MOBILE_ENV_FILE: envFilePath,
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

function parseArgs(argv) {
  const options = { check: false, envFile: DEFAULT_ENV_FILE, port: DEFAULT_PORT, clear: true }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--check') options.check = true
    else if (arg === '--no-clear') options.clear = false
    else if (arg === '--env-file') options.envFile = argv[++index]
    else if (arg === '--port') options.port = Number(argv[++index])
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!options.envFile) throw new Error('--env-file needs a path.')
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('--port must be an integer between 1 and 65535.')
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const envFilePath = isAbsolute(options.envFile) ? options.envFile : resolve(root, options.envFile)
  const problems = []

  let env = null
  if (!existsSync(envFilePath)) {
    problems.push(`env file not found: ${options.envFile} (copy apps/mobile/.env.example and fill the Production EXPO_PUBLIC_* values)`)
  } else {
    try {
      env = buildPreviewEnv(readFileSync(envFilePath, 'utf8'), envFilePath)
    } catch (error) {
      problems.push(error.message)
    }
  }
  if (!existsSync(resolve(root, 'apps/mobile/node_modules/expo'))) {
    problems.push('apps/mobile dependencies are not installed (run pnpm install)')
  }
  if (!(await portIsFree(options.port))) {
    problems.push(`port ${options.port} is already in use (stop the running preview or pass --port)`)
  }

  if (problems.length > 0) {
    console.error('Production web preview preflight failed:')
    for (const problem of problems) console.error(`- ${problem}`)
    return 1
  }
  if (options.check) {
    console.log(`Production web preview preflight passed for port ${options.port}. Values are hidden.`)
    return 0
  }

  console.log(`Starting NestScout mobile web preview on port ${options.port} with production public env loaded. Values are hidden.`)
  const args = [resolve(root, 'scripts/run.mjs'), 'run-package-script', '@nestscout/mobile', 'web', '--port', String(options.port)]
  if (options.clear) args.push('--clear')
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', detached: true })
  // Preview panes stop the launcher, not Expo; without forwarding, Expo outlives it and holds the port.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      try {
        process.kill(-child.pid, signal)
      } catch {
        child.kill(signal)
      }
    })
  }
  return new Promise((done) => child.on('exit', (code) => done(code ?? 1)))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
}
