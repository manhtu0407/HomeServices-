import { supabase } from './supabase'
import { mobileRuntimeConfig } from './runtime-config'

const API_BASE_URL = mobileRuntimeConfig.apiBaseUrl.replace(/\/+$/, '')
const SUPABASE_PUBLISHABLE_KEY = mobileRuntimeConfig.supabasePublishableKey
const TIMEOUT_MS = 15_000
const MAX_RETRIES = 2
const BASE_RETRY_DELAY_MS = 500
const MAX_RETRY_DELAY_MS = 10_000
const MOBILE_API_BASE_PATH = /(?:\/functions\/v1)?\/mobile-api$/i

export type ApiResult<T> =
  | { success: true; data: T; status: number }
  | { success: false; error: string; code: string; status: number }

export async function getMobileApiAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (SUPABASE_PUBLISHABLE_KEY) {
    headers.apikey = SUPABASE_PUBLISHABLE_KEY
  }
  if (!supabase) {
    return headers
  }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export function mobileApiUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

export function mobileApiConfigError(): ApiResult<never> | null {
  if (!API_BASE_URL) {
    return {
      success: false,
      error: 'Dá»‹ch vá»¥ chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh',
      code: 'CONFIG_MISSING',
      status: 0,
    }
  }
  if (!MOBILE_API_BASE_PATH.test(API_BASE_URL)) {
    return {
      success: false,
      error: 'ÄÆ°á»ng káº¿t ná»‘i chÆ°a Ä‘Ãºng',
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

  const retryBudget = isRetrySafeRequest(method, path) ? MAX_RETRIES : 0

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const headers = await getMobileApiAuthHeaders()
      const url = `${API_BASE_URL}${path}`

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      const responseText = await response.text()
      const json = safeParseJsonObject(responseText)

      if (!response.ok) {
        if (attempt < retryBudget && shouldRetryResponse(response.status)) {
          await waitForRetry(method, path, attempt, `HTTP_${response.status}`)
          continue
        }
        return {
          success: false,
          error: json.error ?? 'Lỗi không xác định',
          code: typeof json?.code === 'string' ? json.code : `HTTP_${response.status}`,
          status: response.status,
        }
      }

      return { success: true, data: (json ?? {}) as T, status: response.status }
    } catch (err) {
      if (attempt < retryBudget && shouldRetryError(err)) {
        await waitForRetry(method, path, attempt, isAbortError(err) ? 'TIMEOUT' : 'NETWORK_ERROR')
        continue
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
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
}

type ApiJsonObject = { error?: string; code?: string } & Record<string, unknown>

function safeParseJsonObject(text: string): ApiJsonObject {
  if (!text.trim()) return {}
  try {
    const parsed = JSON.parse(text) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as ApiJsonObject
      : {}
  } catch {
    return {}
  }
}

function isAbortError(err: unknown) {
  return typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
}

function isRetrySafeRequest(method: string, path: string) {
  if (method === 'GET' || method === 'HEAD') return true
  if (method === 'POST' && path === '/places/autocomplete') return true
  if (method === 'POST' && path === '/notifications/device-token') return true
  if (method === 'POST' && /^\/notifications\/[^/]+\/read$/.test(path)) return true
  return false
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
