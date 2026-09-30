import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

import {
  PRODUCTION_MOBILE_API_URL,
  PRODUCTION_PROJECT_REF,
  validateProductionHealthPayload,
} from './kael-playbook-production-attestation.mjs'
import { PLAN55_PRODUCTION_FLAG_NAMES } from './plan55-production-canary-operations.mjs'

const SCRIPT_DIR = resolve(dirname(fileURLToPath(import.meta.url)))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../../..')
const POLICY = JSON.parse(readFileSync(resolve(REPO_ROOT, 'config/harness/plan55-production-only-policy.json'), 'utf8'))
const MANAGEMENT_ORIGIN = 'https://api.supabase.com/v1'
const REQUIRED_CANARY_PROVIDERS = Object.freeze(['anthropic', 'durable_guards', 'global_ai_enabled'])

export async function inspectPlan55ProductionReleasePreflight({
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const accessToken = env.SUPABASE_ACCESS_TOKEN
  if (!accessToken) throw new Error('plan55_release_preflight_access_token_missing')
  if (env.SUPABASE_URL && normalizeSupabaseUrl(env.SUPABASE_URL) !==
      `https://${PRODUCTION_PROJECT_REF}.supabase.co`) {
    throw new Error('plan55_release_preflight_wrong_supabase_url')
  }

  const health = await readJson(fetchImpl, `${PRODUCTION_MOBILE_API_URL}/harness/health`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  }, 'plan55_release_preflight_health_unavailable')
  const deployment = validateProductionHealthPayload(health)
  const sourceBase = POLICY.productionSourceBase
  if (deployment.git_sha !== sourceBase.sha || deployment.release_id !== sourceBase.releaseId) {
    throw new Error('plan55_release_preflight_production_base_changed')
  }

  const secrets = await readJson(fetchImpl,
    `${MANAGEMENT_ORIGIN}/projects/${PRODUCTION_PROJECT_REF}/secrets`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
    }, 'plan55_release_preflight_secret_inventory_unavailable')
  if (!Array.isArray(secrets) || secrets.some((entry) =>
    !entry || typeof entry !== 'object' || typeof entry.name !== 'string')) {
    throw new Error('plan55_release_preflight_secret_inventory_invalid')
  }
  const presentFlags = PLAN55_PRODUCTION_FLAG_NAMES.filter((name) =>
    secrets.some((entry) => entry.name === name))
  if (presentFlags.length) throw new Error('plan55_release_preflight_plan55_flags_not_absent')

  const readiness = health.release?.provider_readiness
  if (!readiness || typeof readiness !== 'object' || Array.isArray(readiness) ||
      REQUIRED_CANARY_PROVIDERS.some((provider) => readiness[provider] !== true)) {
    throw new Error('plan55_release_preflight_provider_not_ready')
  }

  return Object.freeze({
    schema: 'plan55-production-release-preflight/v1',
    status: 'PASS',
    project_ref: PRODUCTION_PROJECT_REF,
    source_sha: deployment.git_sha,
    release_id: deployment.release_id,
    plan55_flags_absent: true,
    required_provider_readiness: Object.freeze(Object.fromEntries(
      REQUIRED_CANARY_PROVIDERS.map((provider) => [provider, true]),
    )),
    mutations: 0,
  })
}

async function readJson(fetchImpl, url, init, errorCode) {
  if (typeof fetchImpl !== 'function') throw new Error('plan55_release_preflight_fetch_invalid')
  const response = await fetchImpl(url, {
    ...init,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  }).catch(() => { throw new Error(errorCode) })
  if (!response.ok) throw new Error(errorCode)
  return response.json().catch(() => { throw new Error(errorCode) })
}

function normalizeSupabaseUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return ''
    return `${url.origin}`.replace(/\/$/u, '')
  } catch {
    return ''
  }
}
