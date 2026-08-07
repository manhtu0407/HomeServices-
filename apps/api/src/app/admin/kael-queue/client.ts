import {
  readResponseTextBounded,
  ResponseBodyInvalidEncodingError,
  ResponseBodyTooLargeError,
} from '@/lib/http/response'
import { resolveTrustedMobileApiBase } from '../kael-learning/client'
import type { AdminKaelQueueItem } from './state'

const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_TOKEN_LENGTH = 8192
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u

export type AdminKaelQueueListResponse = {
  items: AdminKaelQueueItem[]
  page: number
  limit: number
  next_page: number | null
}

export type AdminKaelQueueResolveResponse = {
  ok: true
  item: AdminKaelQueueItem
}

export async function queueAdminFetch<T>(
  rawApiBase: string,
  bearerToken: string,
  path: string,
  options: {
    method?: 'GET' | 'POST'
    body?: Record<string, unknown>
    fetchImpl?: typeof fetch
    trustedSupabaseUrl?: string
    timeoutMs?: number
  } = {},
): Promise<T> {
  const base = resolveTrustedMobileApiBase(rawApiBase, options.trustedSupabaseUrl)
  if (!base) throw new Error('Cấu hình mobile-api không hợp lệ.')
  if (!allowedPath(path)) throw new Error('Đường dẫn hàng đợi Kael không hợp lệ.')
  const token = bearerToken.trim()
  if (!token || token.length > MAX_TOKEN_LENGTH || UNSAFE_TEXT.test(token)) {
    throw new Error('Cần token phiên admin hợp lệ.')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000)
  try {
    const response = await (options.fetchImpl ?? fetch)(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'error',
      signal: controller.signal,
    })
    const text = await readResponseTextBounded(response, MAX_RESPONSE_BYTES)
    const json = safeJson(text)
    if (!response.ok) throw new Error(safeError(json?.error, response.status))
    if (!json || !validResponse(path, json)) throw new Error('Phản hồi hàng đợi Kael không hợp lệ.')
    return json as T
  } catch (error) {
    if (error instanceof ResponseBodyTooLargeError) throw new Error('Phản hồi hàng đợi Kael quá lớn.')
    if (error instanceof ResponseBodyInvalidEncodingError) throw new Error('Phản hồi hàng đợi Kael không hợp lệ.')
    if (controller.signal.aborted) throw new Error('Quá thời gian kết nối mobile-api.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function allowedPath(path: string) {
  if (path === '/admin/kael-queue') return true
  if (path.startsWith('/admin/kael-queue?')) return validListQuery(path)
  const match = path.match(/^\/admin\/kael-queue\/([^/?#]+)\/resolve$/)
  if (!match) return false
  try { return UUID_PATTERN.test(decodeURIComponent(match[1] ?? '')) }
  catch { return false }
}

function validListQuery(path: string) {
  try {
    const url = new URL(path, 'https://kael.invalid')
    if (url.pathname !== '/admin/kael-queue' || url.hash) return false
    const allowed = new Set(['status', 'escalation_level', 'from', 'to', 'page', 'limit'])
    const seen = new Set<string>()
    for (const [key, value] of url.searchParams) {
      if (!allowed.has(key) || seen.has(key) || UNSAFE_TEXT.test(value) || value.length > 128) return false
      seen.add(key)
    }
    const page = url.searchParams.get('page')
    const limit = url.searchParams.get('limit')
    if (page && (!/^\d{1,6}$/.test(page) || Number(page) < 1)) return false
    if (limit && (!/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) return false
    return true
  } catch { return false }
}

function validResponse(path: string, value: Record<string, unknown>) {
  if (path.endsWith('/resolve')) return value.ok === true && validItem(value.item)
  return Array.isArray(value.items) && value.items.length <= 100 && value.items.every(validItem) &&
    Number.isInteger(value.page) && Number.isInteger(value.limit) &&
    (value.next_page === null || Number.isInteger(value.next_page))
}

function validItem(value: unknown): value is AdminKaelQueueItem {
  if (!isRecord(value) || typeof value.id !== 'string' || !UUID_PATTERN.test(value.id)) return false
  return safeText(value.queue_type, 120) && safeText(value.priority, 40) && safeText(value.status, 40) &&
    safeText(value.reason_code, 120) && nullableSafeText(value.response_summary, 500) &&
    nullableSafeText(value.resolution_note, 500) && safeText(value.created_at, 128) &&
    safeText(value.updated_at, 128) && isRecord(value.safe_metadata)
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown
    return isRecord(value) ? value : null
  } catch { return null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function safeText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !UNSAFE_TEXT.test(value)
}
function nullableSafeText(value: unknown, max: number): value is string | null {
  return value === null || safeText(value, max)
}
function safeError(value: unknown, status: number) {
  return safeText(value, 512) ? value : `HTTP ${status}`
}
