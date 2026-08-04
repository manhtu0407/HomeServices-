/**
 * Resolves which Supabase instance the integration suites run against.
 *
 * The local stack is the default so a developer or agent can run these without
 * reaching a shared hosted project. CI keeps pointing at staging by passing the
 * env explicitly.
 *
 * The distinction this module exists to enforce: a MISSING target is a skip, a
 * DANGEROUS target is a throw. Skipping a dangerous configuration reports green
 * for a suite that never ran, which is the silent degradation RULES.md #8 bans.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'

const LOCAL_API_URL = 'http://127.0.0.1:54321'
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]', '0.0.0.0', 'host.docker.internal']

/**
 * The local stack signs its tokens with a fixed, published secret, so every
 * machine gets byte-identical demo keys. They are not credentials: they carry no
 * authority over any hosted project and are only accepted by a loopback
 * listener. They are inlined so `db:local:up` plus `vitest` needs no extra
 * setup — and `assertNotLocalKeyAgainstRemote` makes it impossible to aim one at
 * a remote host.
 */
const LOCAL_DEMO_ISSUER = 'supabase-demo'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export type IntegrationTarget = {
  url: string
  serviceRoleKey: string
  anonKey: string
  isLocal: boolean
}

export type TargetResolution =
  | { ok: true; target: IntegrationTarget }
  | { ok: false; reason: string }

/** True when the caller named no target and we fell back to the local stack. */
let usedImplicitLocalDefault = false

function loadEnvFile(): Record<string, string> {
  const envPath = resolve(__dirname, '../../../../../.env.local')
  try {
    const content = readFileSync(envPath, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const [key, ...valueParts] = trimmed.split('=')
      if (!key || valueParts.length === 0) continue
      vars[key.trim()] = valueParts.join('=').trim()
    }
    return vars
  } catch {
    return {}
  }
}

function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.includes(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Reads the `iss` claim without verifying the signature — enough to tell a local demo token apart. */
function issuerOf(jwt: string | undefined): string | null {
  if (!jwt) return null
  const payload = jwt.split('.')[1]
  if (!payload) return null
  try {
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
    const claims = JSON.parse(json) as { iss?: string }
    return claims.iss ?? null
  } catch {
    return null
  }
}

function assertNotProduction(label: string, url: string): void {
  if (url.includes(PRODUCTION_REF)) {
    throw new Error(
      `[${label}] Refusing to run against PRODUCTION (${PRODUCTION_REF}). ` +
        'These suites create and delete real rows. Point NEXT_PUBLIC_SUPABASE_URL at the local stack or staging.',
    )
  }
}

function assertNotLocalKeyAgainstRemote(label: string, url: string, keys: (string | undefined)[]): void {
  if (isLocalUrl(url)) return
  const leaked = keys.some((k) => issuerOf(k) === LOCAL_DEMO_ISSUER)
  if (leaked) {
    throw new Error(
      `[${label}] Refusing to run: a local-stack demo key was supplied for the remote host ${url}. ` +
        'The demo keys are public and must never be sent off-machine. Fix the env before retrying.',
    )
  }
}

/**
 * Throws when the configuration is dangerous, returns `ok: false` when it is
 * merely absent. Never returns a target the caller should not connect to.
 */
export function resolveIntegrationTarget(label: string): TargetResolution {
  const envVars = loadEnvFile()
  const read = (key: string) => envVars[key] || process.env[key]

  const explicitUrl = read('NEXT_PUBLIC_SUPABASE_URL')
  const explicitServiceRole = read('SUPABASE_SERVICE_ROLE_KEY')
  const explicitAnon = read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')

  const url = explicitUrl || LOCAL_API_URL
  usedImplicitLocalDefault = !explicitUrl

  assertNotProduction(label, url)
  assertNotLocalKeyAgainstRemote(label, url, [explicitServiceRole, explicitAnon])

  const local = isLocalUrl(url)
  const serviceRoleKey = explicitServiceRole || (local ? LOCAL_SERVICE_ROLE_KEY : undefined)
  const anonKey = explicitAnon || (local ? LOCAL_ANON_KEY : undefined)

  if (!serviceRoleKey || !anonKey) {
    return {
      ok: false,
      reason:
        `no usable target for ${url} — ` +
        'set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ' +
        'or run `pnpm db:local:up` and leave them unset to use the local stack',
    }
  }

  return { ok: true, target: { url, serviceRoleKey, anonKey, isLocal: local } }
}

/**
 * Cheap liveness probe. Any HTTP answer means something is listening; only a
 * transport-level failure counts as "not running".
 */
async function isReachable(url: string, timeoutMs = 1500): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fetch(`${url}/auth/v1/health`, { signal: controller.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolve and announce. A skip is logged loudly on purpose: an unannounced skip
 * is indistinguishable from a pass in CI output.
 *
 * Only the IMPLICIT local fallback is probed. An explicitly named target that
 * is unreachable stays a failure — if CI points at staging and staging is down,
 * that must go red, not quietly skip.
 */
export async function resolveOrAnnounceSkip(label: string): Promise<TargetResolution> {
  const resolution = resolveIntegrationTarget(label)

  if (resolution.ok && usedImplicitLocalDefault && !(await isReachable(resolution.target.url))) {
    const reason = `local stack is not running at ${resolution.target.url} — run \`pnpm db:local:up\` first`
    console.warn(`[${label}] SKIPPED - ${reason}`)
    return { ok: false, reason }
  }

  if (resolution.ok) {
    const where = resolution.target.isLocal ? 'LOCAL stack' : resolution.target.url
    console.info(`[${label}] integration target: ${where}`)
  } else {
    console.warn(`[${label}] SKIPPED - ${resolution.reason}`)
  }
  return resolution
}
