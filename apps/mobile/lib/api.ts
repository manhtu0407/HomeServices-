import Constants from 'expo-constants'
import { supabase } from './supabase'

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl ?? ''
const TIMEOUT_MS = 15_000

export type ApiResult<T> =
  | { success: true; data: T; status: number }
  | { success: false; error: string; code: string; status: number }

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
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
      error: 'API chưa được cấu hình',
      code: 'CONFIG_MISSING',
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

    const json = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: json.error ?? 'Lỗi không xác định',
        code: json.code ?? 'UNKNOWN',
        status: response.status,
      }
    }

    return { success: true, data: json as T, status: response.status }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        success: false,
        error: 'Kết nối quá chậm, vui lòng thử lại',
        code: 'TIMEOUT',
        status: 0,
      }
    }
    return {
      success: false,
      error: 'Không thể kết nối đến server',
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
