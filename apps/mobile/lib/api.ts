import { supabase } from './supabase'
import { mobileRuntimeConfig } from './runtime-config'
import {
  readResponseTextBounded,
  ResponseBodyInvalidEncodingError,
  ResponseBodyTooLargeError,
} from './response-guard'

const API_BASE_URL = mobileRuntimeConfig.apiBaseUrl.replace(/\/+$/, '')
const SUPABASE_PUBLISHABLE_KEY = mobileRuntimeConfig.supabasePublishableKey
const TIMEOUT_MS = 15_000
const MAX_RETRIES = 2
const BASE_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 10_000
const MAX_API_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_API_ERROR_LENGTH = 512
const API_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
const API_ERROR_CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/u
const MOBILE_API_BASE_PATH = /(?:\/functions\/v1)?\/mobile-api$/i

export type ApiResult<T> =
  | { success: true; data: T; status: number }
  | { success: false; error: string; code: string; status: number }

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

export function mobileApiConfigError(): ApiResult<never> | null {
  if (!API_BASE_URL) {
    return {
      success: false,
      error: 'Dịch vụ chưa được cấu hình',
      code: 'CONFIG_MISSING',
      status: 0,
    }
  }
  if (!MOBILE_API_BASE_PATH.test(API_BASE_URL)) {
    return {
      success: false,
      error: 'Đường kết nối chưa đúng',
      code: 'CONFIG_INVALID',
      status: 0,
    }
  }
  return null
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  accessToken?: string,
): Promise<ApiResult<T>> {
  if (!API_BASE_URL) {
    return {
      success: false,
      error: 'Dịch vụ chưa được cấu hình',
      code: 'CONFIG_MISSING',
      status: 0,
    }
  }
  if (!MOBILE_API_BASE_PATH.test(API_BASE_URL)) {
    return {
      success: false,
      error: 'Đường kết nối chưa đúng',
      code: 'CONFIG_INVALID',
      status: 0,
    }
  }

  const retryBudget = isRetrySafeRequest(method, path, body) ? MAX_RETRIES : 0

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let responseStatus = 0

    try {
      const headers = accessToken === undefined
        ? await waitForAbort(getMobileApiAuthHeaders(), controller.signal)
        : createMobileApiHeaders(accessToken)
      const url = `${API_BASE_URL}${path}`

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: controller.signal,
      })
      responseStatus = response.status

      const responseText = await readResponseTextBounded(response, MAX_API_RESPONSE_BYTES)
      const json = safeParseJsonObject(responseText)

      if (!response.ok) {
        if (attempt < retryBudget && shouldRetryResponse(response.status)) {
          await waitForRetry(method, path, attempt, `HTTP_${response.status}`)
          continue
        }
        return {
          success: false,
          error: safeServerError(json?.error),
          code: safeServerErrorCode(json?.code, response.status),
          status: response.status,
        }
      }

      if (json === null) {
        return {
          success: false,
          error: 'Phản hồi từ hệ thống không hợp lệ',
          code: 'INVALID_RESPONSE',
          status: response.status,
        }
      }

      return { success: true, data: json as T, status: response.status }
    } catch (err) {
      if (attempt < retryBudget && shouldRetryError(err)) {
        await waitForRetry(method, path, attempt, isAbortError(err) ? 'TIMEOUT' : 'NETWORK_ERROR')
        continue
      }
      if (err instanceof ResponseBodyTooLargeError) {
        return {
          success: false,
          error: 'Phản hồi từ hệ thống quá lớn',
          code: 'RESPONSE_TOO_LARGE',
          status: 0,
        }
      }
      if (err instanceof ResponseBodyInvalidEncodingError) {
        return {
          success: false,
          error: 'Phản hồi từ hệ thống không hợp lệ',
          code: 'INVALID_RESPONSE',
          status: responseStatus,
        }
      }
      if (isAbortError(err)) {
        return {
          success: false,
          error: 'Kết nối quá chậm, vui lòng thử lại',
          code: 'TIMEOUT',
          status: 0,
        }
      }
      return {
        success: false,
        error: 'Không thể kết nối đến hệ thống',
        code: 'NETWORK_ERROR',
        status: 0,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    success: false,
    error: 'Không thể kết nối đến hệ thống',
    code: 'NETWORK_ERROR',
    status: 0,
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
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
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
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
  }
  if (SUPABASE_PUBLISHABLE_KEY) {
    headers.apikey = SUPABASE_PUBLISHABLE_KEY
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  return headers
}

type ApiJsonObject = { error?: unknown; code?: unknown } & Record<string, unknown>

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
  if (method === 'POST' && path === '/places/autocomplete') return true
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
    /^\/jobs\/[^/]+\/kael-incident\/propose-scope$/.test(path) &&
    hasClientRequestId(body)
  ) return true
  if (method === 'POST' && path === '/notifications/device-token') return true
  if (method === 'POST' && /^\/notifications\/[^/]+\/read$/.test(path)) return true
  return false
}

function hasClientRequestId(body: unknown) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const clientRequestId = (body as Record<string, unknown>).client_request_id
  return typeof clientRequestId === 'string' && clientRequestId.trim().length > 0
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

function shouldRetryResponse(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function shouldRetryError(err: unknown) {
  return isAbortError(err) || err instanceof TypeError
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
