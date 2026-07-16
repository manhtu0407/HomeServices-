import {
  ResponseBodyInvalidEncodingError,
  readResponseTextBounded,
  ResponseBodyTooLargeError,
} from '@/lib/http/response'
import type { AdminLearningCandidate } from './state'

export type AdminLearningService =
  | 'electrical'
  | 'plumbing'
  | 'cleaning'
  | 'hvac'
  | 'upholstery'
  | 'handyman'

type EdgeAdminFetchOptions = {
  method?: 'GET' | 'POST'
  body?: Record<string, unknown>
  timeoutMs?: number
  fetchImpl?: typeof fetch
  trustedSupabaseUrl?: string
}

const MOBILE_API_PATH = '/functions/v1/mobile-api'
const ADMIN_LEARNING_CANDIDATES_PATH = '/admin/kael/learning/candidates'
const ADMIN_LEARNING_ACTION_PATH =
  /^\/admin\/kael\/learning\/candidates\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:approve|reject)$/i
const DEFAULT_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_BEARER_TOKEN_LENGTH = 8_192
const MAX_ERROR_MESSAGE_LENGTH = 512
const MAX_CANDIDATE_COUNT = 100
const MAX_IDENTIFIER_LENGTH = 128
const MAX_VISIBLE_TEXT_LENGTH = 2_048
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const UNSAFE_DISPLAY_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ADMIN_LEARNING_SERVICES = new Set<AdminLearningService>([
  'electrical',
  'plumbing',
  'cleaning',
  'hvac',
  'upholstery',
  'handyman',
])
const ADMIN_LEARNING_STATUSES = new Set([
  'created',
  'pending_evidence',
  'evidence_gate_passed',
  'manual_review',
  'auto_promoted',
  'rejected',
  'rolled_back',
  'archived',
])

export function resolveTrustedMobileApiBase(
  raw: string | undefined,
  trustedSupabaseUrl?: string,
): string | null {
  if (!raw?.trim()) return null
  try {
    const url = new URL(raw.trim())
    const isLocal = LOCAL_HOSTS.has(url.hostname)
    if ((!isLocal && url.protocol !== 'https:') || (isLocal && !['http:', 'https:'].includes(url.protocol))) {
      return null
    }
    if (url.origin !== resolveTrustedSupabaseOrigin(trustedSupabaseUrl)) return null
    if (url.username || url.password || url.search || url.hash) return null
    const pathname = url.pathname.replace(/\/+$/, '')
    if (pathname !== MOBILE_API_PATH) return null
    return `${url.origin}${pathname}`
  } catch {
    return null
  }
}

export async function edgeAdminFetch<T>(
  apiBase: string,
  bearerToken: string,
  path: string,
  options: EdgeAdminFetchOptions = {},
): Promise<T> {
  const base = resolveTrustedMobileApiBase(apiBase, options.trustedSupabaseUrl)
  if (!base) throw new Error('Cấu hình mobile-api không hợp lệ.')
  if (!isAllowedAdminLearningPath(path)) {
    throw new Error('Đường dẫn quản trị không hợp lệ.')
  }
  const token = bearerToken.trim()
  if (!token || token.length > MAX_BEARER_TOKEN_LENGTH || UNSAFE_DISPLAY_TEXT.test(token)) {
    throw new Error('Cần token phiên admin hợp lệ.')
  }

  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await (options.fetchImpl ?? fetch)(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'error',
      signal: controller.signal,
    })
    const text = await readResponseTextBounded(response, MAX_RESPONSE_BYTES)
    const json = safeJson(text)
    if (!response.ok) {
      throw new Error(safeServerError(json?.error, response.status))
    }
    const validated = json && validateSuccessfulAdminResponse(path, json)
    if (!validated) throw new Error('Phản hồi mobile-api không hợp lệ.')
    return validated as T
  } catch (error) {
    if (error instanceof ResponseBodyTooLargeError) {
      throw new Error('Phản hồi mobile-api quá lớn.')
    }
    if (error instanceof ResponseBodyInvalidEncodingError) {
      throw new Error('Phản hồi mobile-api không hợp lệ.')
    }
    if (controller.signal.aborted) {
      throw new Error('Quá thời gian kết nối mobile-api.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function isAllowedAdminLearningPath(path: string) {
  return path === ADMIN_LEARNING_CANDIDATES_PATH ||
    path === `${ADMIN_LEARNING_CANDIDATES_PATH}?state=manual_review` ||
    ADMIN_LEARNING_ACTION_PATH.test(path)
}

function resolveTrustedSupabaseOrigin(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  try {
    const url = new URL(raw.trim())
    const isLocal = LOCAL_HOSTS.has(url.hostname)
    const isHostedProject = url.protocol === 'https:' && url.port === '' &&
      /^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
    if ((!isLocal && !isHostedProject) || (isLocal && !['http:', 'https:'].includes(url.protocol))) {
      return null
    }
    if (url.username || url.password || url.search || url.hash) return null
    if (url.pathname.replace(/\/+$/, '')) return null
    return url.origin
  } catch {
    return null
  }
}

function safeServerError(value: unknown, status: number) {
  if (typeof value !== 'string') return `HTTP ${status}`
  const message = value.trim()
  if (!message || message.length > MAX_ERROR_MESSAGE_LENGTH || UNSAFE_DISPLAY_TEXT.test(message)) {
    return `HTTP ${status}`
  }
  return message
}

function validateSuccessfulAdminResponse(
  path: string,
  value: Record<string, unknown>,
): Record<string, unknown> | null {
  if (path === ADMIN_LEARNING_CANDIDATES_PATH || path === `${ADMIN_LEARNING_CANDIDATES_PATH}?state=manual_review`) {
    return isCandidateListResponse(value) ? value : null
  }
  return ADMIN_LEARNING_ACTION_PATH.test(path) && isCandidateReviewResponse(value)
    ? value
    : null
}

function isCandidateListResponse(value: Record<string, unknown>): value is { candidates: AdminLearningCandidate[] } {
  return Array.isArray(value.candidates) &&
    value.candidates.length <= MAX_CANDIDATE_COUNT &&
    value.candidates.every(isAdminLearningCandidate)
}

function isAdminLearningCandidate(value: unknown): value is AdminLearningCandidate {
  if (!isRecord(value)) return false
  const service = value.affected_service
  const evidenceSnapshot = value.evidence_snapshot
  return isUuid(value.id) &&
    isSafeText(value.candidate_type, MAX_IDENTIFIER_LENGTH) &&
    (service === null || ADMIN_LEARNING_SERVICES.has(service as AdminLearningService)) &&
    isNullableSafeText(value.affected_problem) &&
    isNullableSafeText(value.affected_district) &&
    typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    Number.isSafeInteger(value.evidence_count) &&
    (value.evidence_count as number) >= 0 &&
    typeof value.status === 'string' &&
    ADMIN_LEARNING_STATUSES.has(value.status) &&
    isNullableSafeText(value.audit_reason) &&
    isIsoTimestamp(value.created_at) &&
    isRecord(value.suggested_payload) &&
    isSafeOptionalPayloadSkill(value.suggested_payload.skill_id) &&
    (evidenceSnapshot === null || isRecord(evidenceSnapshot))
}

function isCandidateReviewResponse(value: Record<string, unknown>) {
  return value.ok === true &&
    isUuid(value.candidate_id) &&
    typeof value.status === 'string' &&
    ADMIN_LEARNING_STATUSES.has(value.status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isSafeText(value: unknown, maxLength = MAX_VISIBLE_TEXT_LENGTH): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !UNSAFE_DISPLAY_TEXT.test(value)
}

function isNullableSafeText(value: unknown): value is string | null {
  return value === null || isSafeText(value)
}

function isIsoTimestamp(value: unknown): value is string {
  return isSafeText(value, MAX_IDENTIFIER_LENGTH) && Number.isFinite(Date.parse(value))
}

function isSafeOptionalPayloadSkill(value: unknown) {
  return value === undefined || isSafeText(value, MAX_IDENTIFIER_LENGTH)
}

export function serviceLabel(service: AdminLearningService | null) {
  if (service === 'electrical') return 'Sửa điện'
  if (service === 'plumbing') return 'Sửa nước'
  if (service === 'cleaning') return 'Vệ sinh nhà'
  if (service === 'hvac') return 'Điều hòa / không khí trong nhà'
  if (service === 'upholstery') return 'Sofa, nệm, rèm và thảm'
  if (service === 'handyman') return 'Sửa vặt / lắp đặt nhỏ'
  return 'Toàn hệ thống'
}

function safeJson(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null
  try {
    const parsed = JSON.parse(text) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}
