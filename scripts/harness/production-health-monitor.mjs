import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const PRODUCTION_PROJECT_REF = 'iwevizmsedyqozxlawwl'
const PRODUCTION_API_BASE = `https://${PRODUCTION_PROJECT_REF}.supabase.co/functions/v1/mobile-api`
const MAX_RESPONSE_BYTES = 32 * 1024
const DEFAULT_TIMEOUT_MS = 8_000
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const GIT_SHA = /^[0-9a-f]{40}$/u
const DEPLOYMENT_ID = new RegExp(
  `^${PRODUCTION_PROJECT_REF}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[1-9][0-9]*$`,
  'u',
)

export async function checkProductionHealth(input = {}) {
  const fetchImpl = input.fetchImpl ?? fetch
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const [health, charter] = await Promise.all([
    getJson(fetchImpl, `${PRODUCTION_API_BASE}/harness/health`, timeoutMs),
    getJson(fetchImpl, `${PRODUCTION_API_BASE}/kael/charter`, timeoutMs),
  ])
  assertHealthyRelease(health)
  assertValidCharter(charter)
  return {
    status: 'healthy',
    projectRef: PRODUCTION_PROJECT_REF,
    releaseId: health.release.release_id,
    gitSha: health.release.git_sha,
  }
}

async function getJson(fetchImpl, url, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response?.ok) {
      throw new Error(`${endpointLabel(url)} failed with HTTP ${response?.status ?? 'unknown'}`)
    }
    const text = await readBoundedText(response)
    let value
    try {
      value = JSON.parse(text)
    } catch {
      throw new Error(`${endpointLabel(url)} returned invalid JSON`)
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${endpointLabel(url)} returned an invalid object`)
    }
    return value
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${endpointLabel(url)} timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function readBoundedText(response) {
  const declaredLength = Number(response.headers?.get?.('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error('Production health monitor response exceeded its size limit')
  }
  const reader = response.body?.getReader?.()
  if (!reader) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('Production health monitor response exceeded its size limit')
    }
    return text
  }

  const decoder = new TextDecoder()
  let result = ''
  let bytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('Production health monitor response exceeded its size limit')
    }
    result += decoder.decode(value, { stream: true })
  }
  return result + decoder.decode()
}

function assertHealthyRelease(health) {
  const release = health?.release
  if (
    health?.status !== 'ok' ||
    health?.environment?.name !== 'production' ||
    health?.environment?.project_ref !== PRODUCTION_PROJECT_REF ||
    release?.registered !== true ||
    !RELEASE_ID.test(release?.release_id ?? '') ||
    !GIT_SHA.test(release?.git_sha ?? '') ||
    !DEPLOYMENT_ID.test(release?.deployment_id ?? '')
  ) {
    throw new Error('Production harness health payload is not release-ready')
  }
}

function assertValidCharter(charter) {
  if (
    typeof charter?.charter_version !== 'string' || !charter.charter_version.trim() ||
    typeof charter?.identity_summary !== 'string' || !charter.identity_summary.trim() ||
    !['locked_files', 'tunable_files', 'forbidden_categories', 'mission_values'].every((key) =>
      Array.isArray(charter[key]) && charter[key].length > 0 &&
      charter[key].every((value) => typeof value === 'string' && value.trim().length > 0)
    )
  ) {
    throw new Error('Production Kael charter response is invalid')
  }
}

function endpointLabel(url) {
  return url.endsWith('/harness/health')
    ? 'Production harness health'
    : 'Production Kael charter'
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkProductionHealth()
    .then((result) => {
      console.log(`Production mobile-api health and Kael charter are healthy for ${result.releaseId}`)
    })
    .catch((error) => {
      console.error(`production health monitor failed: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    })
}
