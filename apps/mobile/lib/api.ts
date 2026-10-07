import Constants from 'expo-constants'
import { Platform } from 'react-native'

import { supabase } from './supabase'
import { mobileRuntimeConfig } from './runtime-config'
import { releaseClientPlatform } from './release-client-platform'
import { generateClientRequestId } from './client-request-id'
import { isConnectivityOffline, reportTransportFailure, reportTransportSuccess } from './connectivity'
import type { ApiResponseMetadata } from './api-types/shared'
import {
  readResponseTextBounded,
  ResponseBodyInvalidEncodingError,
  ResponseBodyTooLargeError,
} from './response-guard'

const API_BASE_URL = mobileRuntimeConfig.apiBaseUrl.replace(/\/+$/, '')
const SUPABASE_PUBLISHABLE_KEY = mobileRuntimeConfig.supabasePublishableKey
const TIMEOUT_MS = 15_000
const KAEL_CHAT_CREATE_TIMEOUT_MS = 30_000
const KAEL_CHAT_CONFIRM_TIMEOUT_MS = 30_000
const CUSTOMER_KAEL_TURN_TIMEOUT_MS = 30_000
const SCOPE_CHANGE_PREVIEW_TIMEOUT_MS = 45_000
const MAX_RETRIES = 2
const BASE_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 10_000
const MAX_API_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_API_ERROR_LENGTH = 512
const API_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
const API_ERROR_CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/u
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,160}$/
const RESPONSE_IDENTITY_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/
const SUPPORT_CODE_PATTERN = /^[A-Z0-9]{8}$/
const MOBILE_API_BASE_PATH = /(?:\/functions\/v1)?\/mobile-api$/i
const KAEL_CHAT_CONFIRM_PATH = /^\/kael\/chat\/[^/]+\/confirm$/
const KAEL_CHAT_INTAKE_CONFIRMATION_PATH = /^\/kael\/chat\/[^/]+\/intake-confirmation$/
const CUSTOMER_KAEL_TURN_PATH = /^\/me\/kael\/conversations\/[^/]+\/turn$/
const SCOPE_CHANGE_PREVIEW_PATH = /^\/jobs\/[^/]+\/kael-incident\/preview-scope$/

export type ApiResult<T> =
  | { success: true; data: T; status: number; meta?: ApiResponseMetadata }
  | { success: false; error: string; code: string; status: number; meta?: ApiResponseMetadata }

type ApiRequestOptions = {
  idempotencyKey?: string
  signal?: AbortSignal
}

export async function getMobileApiAuthHeaders(): Promise<Record<string, string>> {
  if (!supabase) {
    return createMobileApiHeaders()
  }

  const { data } = await supabase.auth.getSession()
  return createMobileApiHeaders(data.session?.access_token)
}

export function mobileApiUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

export function mobileApiConfigError(meta?: ApiResponseMetadata): ApiResult<never> | null {
  if (!API_BASE_URL) {
    return {
      success: false,
      error: 'Dịch vụ chưa được cấu hình',
      code: 'CONFIG_MISSING',
      status: 0,
      meta: meta ?? createClientDiagnosticMetadata(),
    }
  }
  if (!MOBILE_API_BASE_PATH.test(API_BASE_URL)) {
    return {
      success: false,
      error: 'Đường kết nối chưa đúng',
      code: 'CONFIG_INVALID',
      status: 0,
      meta: meta ?? createClientDiagnosticMetadata(),
    }
  }
  return null
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  accessToken?: string,
  options: ApiRequestOptions = {},
): Promise<ApiResult<T>> {
  const clientMetadata = createClientDiagnosticMetadata()
  const configError = mobileApiConfigError(clientMetadata)
  if (configError) return configError

  const retryBudget = isRetrySafeRequest(method, path, body) ? MAX_RETRIES : 0
  const timeoutMs = requestTimeoutMs(method, path)
  const idempotencyKey = idempotencyKeyForRequest(method, body, options.idempotencyKey)
  if (options.signal?.aborted) {
    return {
      success: false,
      error: 'Yêu cầu đã dừng',
      code: 'REQUEST_CANCELLED',
      status: 0,
      meta: clientMetadata,
    }
  }
  if (options.idempotencyKey && !idempotencyKey) {
    return {
      success: false,
      error: 'Mã chống trùng yêu cầu không hợp lệ',
      code: 'IDEMPOTENCY_KEY_INVALID',
      status: 0,
      meta: clientMetadata,
    }
  }

  let responseMetadata = clientMetadata
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const forwardAbort = () => controller.abort()
    options.signal?.addEventListener('abort', forwardAbort, { once: true })
    if (options.signal?.aborted) forwardAbort()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    let responseStatus = 0

    try {
      const authHeaders = accessToken === undefined
        ? await waitForAbort(getMobileApiAuthHeaders(), controller.signal)
        : createMobileApiHeaders(accessToken)
      const headers = idempotencyKey
        ? { ...authHeaders, 'Idempotency-Key': idempotencyKey }
        : authHeaders
      const url = `${API_BASE_URL}${path}`

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: controller.signal,
      })
      responseStatus = response.status
      reportTransportSuccess()
      responseMetadata = { ...clientMetadata, ...extractApiResponseMetadata(response.headers) }

      const responseText = await readResponseTextBounded(response, MAX_API_RESPONSE_BYTES)
      const json = safeParseJsonObject(responseText)
      responseMetadata = withBodySupportCode(responseMetadata, json?.support_code)

      if (!response.ok) {
        if (attempt < retryBudget && shouldRetryResponse(response.status, method, path)) {
          await waitForRetry(method, path, attempt, `HTTP_${response.status}`)
          continue
        }
        return {
          success: false,
          error: safeServerError(json?.error),
          code: safeServerErrorCode(json?.code, response.status),
          status: response.status,
          meta: responseMetadata,
        }
      }

      if (json === null) {
        return {
          success: false,
          error: 'Phản hồi từ hệ thống không hợp lệ',
          code: 'INVALID_RESPONSE',
          status: response.status,
          meta: responseMetadata,
        }
      }

      return { success: true, data: json as T, status: response.status, meta: responseMetadata }
    } catch (err) {
      if (options.signal?.aborted) {
        return {
          success: false,
          error: 'Yêu cầu đã dừng',
          code: 'REQUEST_CANCELLED',
          status: 0,
          meta: responseMetadata,
        }
      }
      if (responseStatus === 0 && shouldRetryError(err)) reportTransportFailure()
      // Once the transport is known to be down, reads fail fast so cached screens show offline instead of
      // waiting ~46s; idempotent writes keep their full retry budget because a lost write costs the user more.
      const readFailsFast = (method === 'GET' || method === 'HEAD') && isConnectivityOffline()
      if (attempt < retryBudget && !readFailsFast && shouldRetryRequestError(err, method, path)) {
        await waitForRetry(method, path, attempt, isAbortError(err) ? 'TIMEOUT' : 'NETWORK_ERROR')
        continue
      }
      if (err instanceof ResponseBodyTooLargeError) {
        return {
          success: false,
          error: 'Phản hồi từ hệ thống quá lớn',
          code: 'RESPONSE_TOO_LARGE',
          status: 0,
          meta: responseMetadata,
        }
      }
      if (err instanceof ResponseBodyInvalidEncodingError) {
        return {
          success: false,
          error: 'Phản hồi từ hệ thống không hợp lệ',
          code: 'INVALID_RESPONSE',
          status: responseStatus,
          meta: responseMetadata,
        }
      }
      if (isAbortError(err)) {
        return {
          success: false,
          error: 'Kết nối quá chậm, vui lòng thử lại',
          code: 'TIMEOUT',
          status: 0,
          meta: responseMetadata,
        }
      }
      return {
        success: false,
        error: 'Không thể kết nối đến hệ thống',
        code: 'NETWORK_ERROR',
        status: 0,
        meta: responseMetadata,
      }
    } finally {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', forwardAbort)
    }
  }

  return {
    success: false,
    error: 'Không thể kết nối đến hệ thống',
    code: 'NETWORK_ERROR',
    status: 0,
    meta: responseMetadata,
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  getAuthenticated: <T>(path: string, accessToken: string): Promise<ApiResult<T>> => {
    if (!accessToken.trim()) {
      return Promise.resolve({
        success: false,
        error: 'Phiên đăng nhập không hợp lệ',
        code: 'AUTH_REQUIRED',
        status: 401,
      })
    }
    return request<T>('GET', path, undefined, accessToken)
  },
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) => request<T>('POST', path, body, undefined, options),
  postWithIdempotency: <T>(path: string, body: unknown, idempotencyKey: string) =>
    request<T>('POST', path, body, undefined, { idempotencyKey }),
  postAuthenticated: <T>(path: string, body: unknown, accessToken: string): Promise<ApiResult<T>> => {
    if (!accessToken.trim()) {
      return Promise.resolve({
        success: false,
        error: 'Phiên đăng nhập không hợp lệ',
        code: 'AUTH_REQUIRED',
        status: 401,
      })
    }
    return request<T>('POST', path, body, accessToken)
  },
  postAuthenticatedWithIdempotency: <T>(
    path: string,
    body: unknown,
    accessToken: string,
    idempotencyKey: string,
  ): Promise<ApiResult<T>> => {
    if (!accessToken.trim()) {
      return Promise.resolve({
        success: false,
        error: 'Phiên đăng nhập không hợp lệ',
        code: 'AUTH_REQUIRED',
        status: 401,
      })
    }
    return request<T>('POST', path, body, accessToken, { idempotencyKey })
  },
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  patchAuthenticated: <T>(path: string, body: unknown, accessToken: string): Promise<ApiResult<T>> => {
    if (!accessToken.trim()) return Promise.resolve({ success: false, error: 'Phiên đăng nhập không hợp lệ', code: 'AUTH_REQUIRED', status: 401 })
    return request<T>('PATCH', path, body, accessToken)
  },
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  deleteAuthenticated: <T>(path: string, body: unknown, accessToken: string): Promise<ApiResult<T>> => {
    if (!accessToken.trim()) {
      return Promise.resolve({
        success: false,
        error: 'Phiên đăng nhập không hợp lệ',
        code: 'AUTH_REQUIRED',
        status: 401,
      })
    }
    return request<T>('DELETE', path, body, accessToken)
  },
}

function createMobileApiHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...createClientReleaseHeaders(),
  }
  if (SUPABASE_PUBLISHABLE_KEY) {
    headers.apikey = SUPABASE_PUBLISHABLE_KEY
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  return headers
}

type ApiJsonObject = { error?: unknown; code?: unknown; support_code?: unknown } & Record<string, unknown>

function safeParseJsonObject(text: string): ApiJsonObject | null {
  if (!text.trim()) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as ApiJsonObject
      : null
  } catch {
    return null
  }
}

function isAbortError(err: unknown) {
  return typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
}

function isRetrySafeRequest(method: string, path: string, body: unknown) {
  if (method === 'GET' || method === 'HEAD') return true
  if (method === 'POST' && (path === '/places/autocomplete' || path === '/places/resolve')) return true
  if (
    method === 'POST' &&
    path === '/worker-applications' &&
    hasClientRequestId(body)
  ) return true
  if (
    method === 'POST' &&
    (path === '/jobs' || path === '/kael/chat') &&
    hasClientRequestId(body)
  ) return true
  if (
    method === 'POST' &&
    path === '/me/kael/conversations' &&
    hasClientRequestId(body)
  ) return true
  if (method === 'POST' && isKaelChatDecisionPath(path)) return true
  if (
    method === 'POST' &&
    /^\/jobs\/[^/]+\/scope-change$/.test(path) &&
    hasClientRequestId(body)
  ) return true
  if (
    method === 'POST' &&
    /^\/workers\/me\/kael\/chat(?:\/[^/]+)?$/.test(path) &&
    hasClientRequestId(body)
  ) return true
  if (
    method === 'POST' &&
    /^\/jobs\/[^/]+\/kael-incident$/.test(path) &&
    hasClientRequestId(body)
  ) return true
  if (
    method === 'POST' &&
    SCOPE_CHANGE_PREVIEW_PATH.test(path) &&
    hasClientRequestId(body)
  ) return true
  if (
    method === 'POST' &&
    /^\/jobs\/[^/]+\/kael-incident\/propose-scope$/.test(path) &&
    hasClientRequestId(body)
  ) return true
  if (method === 'POST' && path === '/notifications/device-token') return true
  if (method === 'POST' && /^\/notifications\/[^/]+\/read$/.test(path)) return true
  if (
    method === 'POST' &&
    path === '/me/account-deletion' &&
    hasClientRequestId(body)
  ) return true
  return false
}

function hasClientRequestId(body: unknown) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const clientRequestId = (body as Record<string, unknown>).client_request_id
  return typeof clientRequestId === 'string' && clientRequestId.trim().length > 0
}

function idempotencyKeyForRequest(method: string, body: unknown, explicitKey?: string): string | null {
  if (method === 'GET' || method === 'HEAD') return null
  if (explicitKey) {
    const normalized = explicitKey.trim()
    if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) return null
    return normalized.startsWith('mobile:') ? normalized : `mobile:${normalized}`
  }
  const bodyRequestId = typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).client_request_id
    : null
  if (typeof bodyRequestId === 'string' && IDEMPOTENCY_KEY_PATTERN.test(bodyRequestId.trim())) {
    const stableRequestId = bodyRequestId.trim()
    return stableRequestId.startsWith('mobile:')
      ? stableRequestId
      : `mobile:${stableRequestId}`
  }
  return `mobile:${method.toLowerCase()}:${generateClientRequestId()}`
}

function createClientReleaseHeaders() {
  const runtimeBuildInfo = mobileRuntimeConfig.runtimeBuildInfo as typeof mobileRuntimeConfig.runtimeBuildInfo & {
    releaseId?: string
  }
  const releaseId = safeResponseIdentity(runtimeBuildInfo?.releaseId ?? null)
  const gitSha = safeResponseIdentity(runtimeBuildInfo?.gitSha ?? null)
  const contractEpoch = safeNumericHeader(runtimeBuildInfo?.contractEpoch)
  const easBuildId = safeUuidHeader(runtimeBuildInfo?.easBuildId)
  const runtimeVersion = safeResponseIdentity(runtimeBuildInfo?.runtimeVersion ?? null)
  const buildNumber = Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber
    : Constants.expoConfig?.android?.versionCode
  const applicationId = Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.bundleIdentifier
    : Platform.OS === 'android'
      ? Constants.expoConfig?.android?.package
      : null
  const platform = releaseClientPlatform()
  return {
    ...(platform ? { 'x-client-platform': platform } : {}),
    ...(applicationId ? { 'x-client-application-id': applicationId } : {}),
    ...(buildNumber !== undefined && buildNumber !== null && String(buildNumber).trim()
      ? { 'x-client-build-number': String(buildNumber).trim() }
      : {}),
    ...(contractEpoch ? { 'x-client-contract-epoch': contractEpoch } : {}),
    ...(easBuildId ? { 'x-client-eas-build-id': easBuildId } : {}),
    ...(runtimeVersion ? { 'x-client-runtime-version': runtimeVersion } : {}),
    ...(gitSha ? { 'x-client-git-sha': gitSha } : {}),
    ...(releaseId ? { 'x-client-release-id': releaseId } : {}),
  }
}

function safeNumericHeader(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return /^[1-9][0-9]{0,8}$/u.test(normalized) ? normalized : null
}

function safeUuidHeader(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(normalized)
    ? normalized
    : null
}

export function createClientDiagnosticMetadata(): ApiResponseMetadata {
  const clientRequestId = generateClientRequestId()
  return {
    clientRequestId,
    clientDiagnosticCode: `NSL-${supportCodeFromIdentity(clientRequestId)}`,
    operationId: null,
    releaseId: null,
    runId: null,
    supportCode: null,
    traceId: null,
  }
}

export function extractApiResponseMetadata(headers: Pick<Headers, 'get'>): ApiResponseMetadata {
  const releaseId = safeResponseIdentity(headers.get('x-release-id'))
    ?? safeResponseIdentity(headers.get('x-release'))
  const traceId = safeResponseIdentity(headers.get('x-trace-id'))
  const runId = safeResponseIdentity(headers.get('x-run-id'))
  const operationId = safeResponseIdentity(headers.get('x-operation-id'))
  const supportHeader = headers.get('x-support-code')?.trim().toUpperCase() ?? ''
  return {
    operationId,
    releaseId,
    runId,
    supportCode: SUPPORT_CODE_PATTERN.test(supportHeader)
      ? supportHeader
      : supportCodeFromIdentity(traceId ?? operationId ?? runId),
    traceId,
  }
}

function withBodySupportCode(meta: ApiResponseMetadata, value: unknown): ApiResponseMetadata {
  if (typeof value !== 'string') return meta
  const normalized = value.trim().toUpperCase()
  return SUPPORT_CODE_PATTERN.test(normalized) ? { ...meta, supportCode: normalized } : meta
}

function safeResponseIdentity(value: string | null) {
  if (!value) return null
  const normalized = value.trim()
  return RESPONSE_IDENTITY_PATTERN.test(normalized) ? normalized : null
}

function supportCodeFromIdentity(value: string | null) {
  if (!value) return null
  const normalized = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (normalized.length < 8) return null
  return normalized.slice(-8)
}

async function waitForAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw abortError()
  let rejectOnAbort: ((error: Error) => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = reject
  })
  const onAbort = () => rejectOnAbort?.(abortError())
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await Promise.race([operation, aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export function safeServerError(value: unknown, fallback = 'Lỗi không xác định') {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_API_ERROR_LENGTH ||
    !value.trim() ||
    API_ERROR_CONTROL_PATTERN.test(value)
  ) {
    return fallback
  }
  return value
}

export function safeServerErrorCode(value: unknown, status: number) {
  return typeof value === 'string' && API_ERROR_CODE_PATTERN.test(value)
    ? value
    : `HTTP_${status}`
}

function abortError() {
  const error = new Error('Request aborted')
  error.name = 'AbortError'
  return error
}

function shouldRetryResponse(status: number, method: string, path: string) {
  if (
    method === 'POST' &&
    (isKaelChatDecisionPath(path) || SCOPE_CHANGE_PREVIEW_PATH.test(path))
  ) return false
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function shouldRetryError(err: unknown) {
  return isAbortError(err) || err instanceof TypeError
}

function shouldRetryRequestError(err: unknown, method: string, path: string) {
  if (
    isAbortError(err) &&
    method === 'POST' &&
    (path === '/kael/chat' || isKaelChatDecisionPath(path) || SCOPE_CHANGE_PREVIEW_PATH.test(path))
  ) return false
  return shouldRetryError(err)
}

function requestTimeoutMs(method: string, path: string) {
  if (method !== 'POST') return TIMEOUT_MS
  if (path === '/kael/chat') return KAEL_CHAT_CREATE_TIMEOUT_MS
  if (isKaelChatDecisionPath(path)) return KAEL_CHAT_CONFIRM_TIMEOUT_MS
  if (CUSTOMER_KAEL_TURN_PATH.test(path)) return CUSTOMER_KAEL_TURN_TIMEOUT_MS
  if (SCOPE_CHANGE_PREVIEW_PATH.test(path)) return SCOPE_CHANGE_PREVIEW_TIMEOUT_MS
  return TIMEOUT_MS
}

function isKaelChatDecisionPath(path: string) {
  return KAEL_CHAT_CONFIRM_PATH.test(path) || KAEL_CHAT_INTAKE_CONFIRMATION_PATH.test(path)
}

async function waitForRetry(method: string, path: string, attempt: number, reason: string) {
  const backoffMs = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS)
  console.warn('mobile-api retry', {
    method,
    path: safePathForLog(path),
    attempt: attempt + 1,
    backoffMs,
    reason,
  })
  await new Promise((resolve) => setTimeout(resolve, backoffMs))
}

function safePathForLog(path: string) {
  return path.split('?')[0] || '/'
}
