import { supabase } from './supabase'
import { mobileRuntimeConfig } from './runtime-config'

const API_BASE_URL = mobileRuntimeConfig.apiBaseUrl.replace(/\/+$/, '')
const SUPABASE_PUBLISHABLE_KEY = mobileRuntimeConfig.supabasePublishableKey
const TIMEOUT_MS = 15_000
const MOBILE_API_BASE_PATH = /(?:\/functions\/v1)?\/mobile-api$/i

export type ApiResult<T> =
  | { success: true; data: T; status: number }
  | { success: false; error: string; code: string; status: number }

async function getAuthHeaders(): Promise<Record<string, string>> {
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

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const headers = await getAuthHeaders()
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
      return {
        success: false,
        error: json.error ?? 'Lỗi không xác định',
        code: typeof json?.code === 'string' ? json.code : `HTTP_${response.status}`,
        status: response.status,
      }
    }

    return { success: true, data: (json ?? {}) as T, status: response.status }
  } catch (err) {
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
