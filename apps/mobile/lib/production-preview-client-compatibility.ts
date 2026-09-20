import { readResponseTextBounded } from './response-guard'

const PRODUCTION_PROJECT_REF = 'iwevizmsedyqozxlawwl'
const PRODUCTION_API_BASE_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co/functions/v1/mobile-api`
const MAX_HEALTH_RESPONSE_BYTES = 16 * 1024
const HEALTH_TIMEOUT_MS = 3_000
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const GIT_SHA = /^[0-9a-f]{40}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const RUNTIME_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export type ProductionPreviewCompatibilityInput = {
  development: boolean
  platform: string
  hostname: string
  apiBaseUrl: string
  publishableKey?: string
  fetchImpl?: typeof fetch
}

export async function createDevelopmentProductionPreviewCompatibilityHeaders(
  input: ProductionPreviewCompatibilityInput,
): Promise<Record<string, string>> {
  if (!isLocalProductionPreview(input)) return {}
  const fetchImpl = input.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${PRODUCTION_API_BASE_URL}/harness/health`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(input.publishableKey ? { apikey: input.publishableKey } : {}),
      },
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) return {}
    const text = await readResponseTextBounded(response, MAX_HEALTH_RESPONSE_BYTES)
    const payload = parseObject(text)
    const tuple = registeredIosTuple(payload)
    if (!tuple) return {}
    return {
      'x-client-platform': 'ios',
      'x-client-application-id': tuple.applicationId,
      'x-client-build-number': String(tuple.minimumBuildNumber),
      'x-client-contract-epoch': '2',
      'x-client-eas-build-id': tuple.easBuildId,
      'x-client-runtime-version': tuple.runtimeVersion,
      'x-client-git-sha': tuple.gitSha,
      'x-client-release-id': tuple.releaseId,
    }
  } catch {
    return {}
  } finally {
    clearTimeout(timeout)
  }
}

function isLocalProductionPreview(input: ProductionPreviewCompatibilityInput) {
  if (!input.development || input.platform !== 'web' || !LOCAL_HOSTS.has(input.hostname)) return false
  try {
    const url = new URL(input.apiBaseUrl)
    return url.origin === `https://${PRODUCTION_PROJECT_REF}.supabase.co` &&
      url.pathname.replace(/\/+$/u, '') === '/functions/v1/mobile-api' &&
      !url.search && !url.hash && !url.username && !url.password
  } catch {
    return false
  }
}

function parseObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function registeredIosTuple(payload: Record<string, unknown> | null) {
  const environment = payload?.environment as Record<string, unknown> | undefined
  const release = payload?.release as Record<string, unknown> | undefined
  const compatibility = release?.client_compatibility as Record<string, unknown> | undefined
  const ios = compatibility?.ios as Record<string, unknown> | undefined
  const applicationId = ios?.applicationId
  const minimumBuildNumber = ios?.minimumBuildNumber
  const easBuildId = ios?.easBuildId
  const runtimeVersion = ios?.runtimeVersion
  if (
    payload?.status !== 'ok' ||
    environment?.name !== 'production' ||
    environment?.project_ref !== PRODUCTION_PROJECT_REF ||
    release?.registered !== true ||
    !RELEASE_ID.test(String(release?.release_id ?? '')) ||
    !GIT_SHA.test(String(release?.git_sha ?? '')) ||
    compatibility?.contractEpoch !== 2 ||
    applicationId !== 'com.phanmanhtu.homeservices' ||
    typeof minimumBuildNumber !== 'number' ||
    !Number.isSafeInteger(minimumBuildNumber) ||
    minimumBuildNumber < 1 ||
    minimumBuildNumber > 999_999_999 ||
    typeof easBuildId !== 'string' || !UUID.test(easBuildId) ||
    typeof runtimeVersion !== 'string' || !RUNTIME_VERSION.test(runtimeVersion)
  ) return null
  return {
    applicationId,
    minimumBuildNumber,
    easBuildId,
    runtimeVersion,
    gitSha: release?.git_sha as string,
    releaseId: release?.release_id as string,
  }
}
