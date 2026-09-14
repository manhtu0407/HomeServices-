/**
 * Resolves which Supabase instance the integration suites run against.
 *
 * The local stack is the default so a developer or agent can run these without
 * reaching a shared hosted project. Hosted runs are Production-only and require
 * an explicit operator-approved target.
 *
 * The distinction this module exists to enforce: a MISSING target is a skip, a
 * DANGEROUS target is a throw. Skipping a dangerous configuration reports green
 * for a suite that never ran, which is the silent degradation RULES.md #8 bans.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  HARNESS_LOCAL_URL,
  assertHarnessMutationAllowed,
  resolveHarnessEnvironment,
} from '../../../../../supabase/functions/_shared/harness/environment'

const LOCAL_API_URL = HARNESS_LOCAL_URL

/**
 * The local stack signs its tokens with a fixed, published secret, so every
 * machine gets byte-identical demo keys. They are not credentials: they carry no
 * authority over any hosted project and are only accepted by a loopback
 * listener. They are inlined so `db:local:up` plus `vitest` needs no extra
 * setup — and `assertNotLocalKeyAgainstRemote` makes it impossible to aim one at
 * a remote host.
 */
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

/**
 * Throws when the configuration is dangerous, returns `ok: false` when it is
 * merely absent. Never returns a target the caller should not connect to.
 */
export function resolveIntegrationTarget(_label: string): TargetResolution {
  const envVars = loadEnvFile()
  const read = (key: string) => envVars[key] || process.env[key]

  const explicitUrl = read('NEXT_PUBLIC_SUPABASE_URL')
  const explicitServiceRole = read('SUPABASE_SERVICE_ROLE_KEY')
  const explicitAnon = read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  const url = explicitUrl || LOCAL_API_URL
  usedImplicitLocalDefault = !explicitUrl

  const descriptor = resolveHarnessEnvironment({
    url,
    environment: read('NESTSCOUT_ENVIRONMENT'),
    publishableKey: explicitAnon,
    secretKey: explicitServiceRole,
    mutationIntent: 'mutate',
    approval: readRemoteApproval(read),
  })
  assertHarnessMutationAllowed(descriptor)

  const serviceRoleKey = explicitServiceRole || (descriptor.isLocal ? LOCAL_SERVICE_ROLE_KEY : undefined)
  const anonKey = explicitAnon || (descriptor.isLocal ? LOCAL_ANON_KEY : undefined)

  if (!serviceRoleKey || !anonKey) {
    return {
      ok: false,
      reason:
        `no usable target for ${url} — ` +
        'set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, ' +
        'or run `pnpm db:local:up` and leave them unset to use the local stack',
    }
  }

  const target = {
    url,
    serviceRoleKey,
    anonKey,
    isLocal: descriptor.isLocal,
  }

  // The integration suites dynamically import application services after this
  // resolver. Hydrate only loopback defaults so those imports use the same
  // safe local target without requiring a developer-owned .env.local file.
  if (target.isLocal) {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= target.url
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= target.anonKey
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= target.serviceRoleKey
    process.env.NESTSCOUT_ENVIRONMENT ??= 'local'
  }

  return {
    ok: true,
    target,
  }
}

function readRemoteApproval(
  read: (key: string) => string | undefined,
) {
  const environment = read('NESTSCOUT_ENVIRONMENT')
  const projectRef = read('SUPABASE_PROJECT_REF') ?? projectRefFromUrl(
    read('NEXT_PUBLIC_SUPABASE_URL'),
  )
  const approvalId = read('HARNESS_REMOTE_MUTATION_APPROVAL')
  const releaseId = read('HARNESS_RELEASE_ID')
  if (!environment || environment === 'local' || !projectRef || !approvalId || !releaseId) {
    return null
  }
  if (environment !== 'production') return null
  return {
    approvalId,
    environment: 'production' as const,
    projectRef,
    releaseId,
    source: read('HARNESS_APPROVAL_SOURCE') === 'operator' ? 'operator' as const : 'ci' as const,
    allowProduction: read('HARNESS_ALLOW_PRODUCTION_MUTATION') === 'true',
  }
}

function projectRefFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const [projectRef, ...rest] = new URL(value).hostname.split('.')
    return rest.join('.') === 'supabase.co' ? projectRef : undefined
  } catch {
    return undefined
  }
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
 * Only the IMPLICIT local fallback is probed. An explicitly named Production
 * target that is unreachable stays a failure and never quietly skips.
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
