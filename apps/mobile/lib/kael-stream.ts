import {
  SERVICE_TYPES as CANONICAL_SERVICE_TYPES,
  type KaelChatEvidenceInput,
  type KaelChatTurnInput,
  type WorkerKaelChatTurnInput,
} from '@nestscout/shared'

import type { KaelChatProgress, KaelChatResponse, WorkerKaelChatResponse } from './api-types'
import {
  type ApiResult,
  getMobileApiAuthHeaders,
  mobileApiConfigError,
  mobileApiUrl,
  safeServerError,
  safeServerErrorCode,
} from './api'
import {
  readResponseTextBounded,
  ResponseBodyInvalidEncodingError,
  ResponseBodyTooLargeError,
} from './response-guard'

const STREAM_CONNECT_TIMEOUT_MS = 20_000
const STREAM_TOTAL_TIMEOUT_MS = 90_000
const STREAM_MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const STREAM_MAX_ERROR_BYTES = 128 * 1024
const STREAM_MAX_FRAME_BUFFER_CHARS = 256 * 1024

export type KaelStreamStageEvent = {
  type: 'stage'
  progress: KaelChatProgress
}

export type KaelStreamTokenEvent = {
  type: 'token'
  field: 'clarification' | 'advisory' | 'worker_assist'
  delta: string
}

export type KaelStreamResultEvent = {
  type: 'result'
  data: KaelChatResponse
}

export type KaelStreamErrorEvent = {
  type: 'error'
  code: string
  message: string
}

export type KaelStreamHeartbeatEvent = {
  type: 'heartbeat'
}

export type KaelStreamEvent =
  | KaelStreamStageEvent
  | KaelStreamTokenEvent
  | KaelStreamResultEvent
  | KaelStreamErrorEvent
  | KaelStreamHeartbeatEvent

export type KaelChatStreamHandlers = {
  onError?: (event: KaelStreamErrorEvent) => void
  onResult?: (event: KaelStreamResultEvent) => void
  onStage?: (event: KaelStreamStageEvent) => void
  onToken?: (event: KaelStreamTokenEvent) => void
}

export type WorkerKaelStreamResultEvent = {
  type: 'result'
  data: WorkerKaelChatResponse
}

export type WorkerKaelChatStreamHandlers = {
  onError?: (event: KaelStreamErrorEvent) => void
  onResult?: (event: WorkerKaelStreamResultEvent) => void
  onStage?: (event: KaelStreamStageEvent) => void
  onToken?: (event: KaelStreamTokenEvent) => void
}

export function supportsKaelChatSseStream() {
  return typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined'
}

export function createKaelSseParser() {
  let buffer = ''

  return {
    push(chunk: string): KaelStreamEvent[] {
      buffer += chunk
      const events: KaelStreamEvent[] = []
      let boundary = frameBoundaryIndex(buffer)
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + frameBoundaryLength(buffer, boundary))
        const event = parseKaelSseFrame(frame)
        if (event) events.push(event)
        boundary = frameBoundaryIndex(buffer)
      }
      if (buffer.length > STREAM_MAX_FRAME_BUFFER_CHARS) {
        throw new Error('STREAM_FRAME_TOO_LARGE')
      }
      return events
    },
  }
}

export async function streamKaelChatTurn(
  sessionId: string,
  input: KaelChatTurnInput,
  handlers: KaelChatStreamHandlers = {},
): Promise<ApiResult<KaelChatResponse>> {
  return streamKaelTurn(`/kael/chat/${encodeURIComponent(sessionId)}/stream`, input, handlers, {
    httpErrorField: 'error',
    httpFallbackCode: (status) => `HTTP_${status}`,
    httpFallbackMessage: 'Kael streaming failed.',
  }, isCustomerKaelStreamResult)
}

export async function streamKaelChatEvidence(
  sessionId: string,
  input: KaelChatEvidenceInput,
  handlers: KaelChatStreamHandlers = {},
): Promise<ApiResult<KaelChatResponse>> {
  return streamKaelTurn(`/kael/chat/${encodeURIComponent(sessionId)}/evidence-stream`, input, handlers, {
    httpErrorField: 'error',
    httpFallbackCode: (status) => `HTTP_${status}`,
    httpFallbackMessage: 'Kael evidence streaming failed.',
  }, isCustomerKaelStreamResult)
}

export function createKaelStreamUtf8Decoder() {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  return {
    push(bytes?: Uint8Array, final = false) {
      try {
        return decoder.decode(bytes, { stream: !final })
      } catch {
        throw new StreamInvalidEncodingError()
      }
    },
  }
}

export async function streamWorkerKaelChatTurn(
  sessionId: string,
  input: WorkerKaelChatTurnInput,
  handlers: WorkerKaelChatStreamHandlers = {},
): Promise<ApiResult<WorkerKaelChatResponse>> {
  return streamKaelTurn(`/workers/me/kael/chat/${encodeURIComponent(sessionId)}/stream`, input, handlers, {
    httpErrorField: 'message',
    httpFallbackCode: () => 'STREAM_HTTP',
    httpFallbackMessage: 'Kael stream failed.',
  }, isWorkerKaelStreamResult)
}

type StreamHandlers<T> = {
  onError?: (event: KaelStreamErrorEvent) => void
  onResult?: (event: { type: 'result'; data: T }) => void
  onStage?: (event: KaelStreamStageEvent) => void
  onToken?: (event: KaelStreamTokenEvent) => void
}

async function streamKaelTurn<T>(
  path: string,
  input: KaelChatEvidenceInput | KaelChatTurnInput | WorkerKaelChatTurnInput,
  handlers: StreamHandlers<T>,
  httpError: {
    httpErrorField: 'error' | 'message'
    httpFallbackCode: (status: number) => string
    httpFallbackMessage: string
  },
  resultGuard: (value: unknown) => value is T,
): Promise<ApiResult<T>> {
  const configError = mobileApiConfigError()
  if (configError) return configError
  if (!supportsKaelChatSseStream()) {
    return {
      success: false,
      error: 'Kael streaming is not available on this device.',
      code: 'STREAM_UNSUPPORTED',
      status: 0,
    }
  }

  const lifetime = createStreamLifetime()
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  try {
    const { fetch: expoFetch } = await import('expo/fetch')
    const response = await waitForStreamConnection(expoFetch(mobileApiUrl(path), {
      method: 'POST',
      headers: await getMobileApiAuthHeaders(),
      body: JSON.stringify(input),
      redirect: 'error',
      signal: lifetime.signal,
    }), lifetime)
    if (!response.ok) {
      const errorBody = await lifetime.wait(
        readResponseTextBounded(response, STREAM_MAX_ERROR_BYTES),
      )
      const parsed = safeParseObject(errorBody)
      const safeCode = safeServerErrorCode(parsed.code, response.status)
      return {
        success: false,
        error: safeServerError(parsed[httpError.httpErrorField], httpError.httpFallbackMessage),
        code: safeCode === `HTTP_${response.status}`
          ? httpError.httpFallbackCode(response.status)
          : safeCode,
        status: response.status,
      }
    }

    reader = response.body?.getReader() ?? null
    if (!reader) {
      return {
        success: false,
        error: 'Kael streaming is not readable on this device.',
        code: 'STREAM_BODY_UNREADABLE',
        status: response.status,
      }
    }

    const decoder = createKaelStreamUtf8Decoder()
    const parser = createKaelSseParser()
    let finalResult: T | null = null
    let responseBytes = 0

    for (;;) {
      const { done, value } = await lifetime.wait(reader.read())
      let chunk: string
      if (done) {
        chunk = decoder.push(undefined, true)
      } else {
        responseBytes += value.byteLength
        if (responseBytes > STREAM_MAX_RESPONSE_BYTES) {
          throw new Error('STREAM_RESPONSE_TOO_LARGE')
        }
        chunk = decoder.push(value)
      }
      for (const event of parser.push(chunk)) {
        if (event.type === 'stage') handlers.onStage?.(event)
        if (event.type === 'token') handlers.onToken?.(event)
        if (event.type === 'error') {
          handlers.onError?.(event)
          return { success: false, error: event.message, code: event.code, status: response.status }
        }
        if (event.type === 'result') {
          if (!resultGuard(event.data)) {
            const invalidResult = {
              type: 'error' as const,
              code: 'STREAM_RESULT_INVALID',
              message: 'Kael returned an invalid stream result.',
            }
            handlers.onError?.(invalidResult)
            return { success: false, error: invalidResult.message, code: invalidResult.code, status: response.status }
          }
          const result = event.data
          handlers.onResult?.({ type: 'result', data: result })
          finalResult = result
        }
      }
      if (done) break
    }

    if (finalResult) return { success: true, data: finalResult, status: response.status }
    return {
      success: false,
      error: 'Kael stream ended before a result.',
      code: 'STREAM_ENDED',
      status: response.status,
    }
  } catch (error) {
    const code = streamFailureCode(error)
    return {
      success: false,
      error: code === 'STREAM_TIMEOUT'
        ? 'Kael streaming timed out.'
        : code === 'STREAM_RESPONSE_TOO_LARGE'
        ? 'Kael streaming response was too large.'
        : code === 'STREAM_INVALID_ENCODING'
        ? 'Kael streaming returned invalid text encoding.'
        : 'Kael streaming connection failed.',
      code,
      status: 0,
    }
  } finally {
    lifetime.dispose()
    await reader?.cancel().catch(() => undefined)
  }
}

type StreamLifetime = ReturnType<typeof createStreamLifetime>

function createStreamLifetime() {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new StreamTimeoutError())
    }, STREAM_TOTAL_TIMEOUT_MS)
  })
  return {
    signal: controller.signal,
    wait<T>(promise: Promise<T>) {
      return Promise.race([promise, timeout])
    },
    abort() {
      controller.abort()
    },
    dispose() {
      if (timer !== undefined) clearTimeout(timer)
    },
  }
}

async function waitForStreamConnection<T>(promise: Promise<T>, lifetime: StreamLifetime) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      lifetime.abort()
      reject(new StreamTimeoutError())
    }, STREAM_CONNECT_TIMEOUT_MS)
  })
  try {
    return await Promise.race([lifetime.wait(promise), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function streamFailureCode(error: unknown) {
  if (error instanceof StreamTimeoutError) return 'STREAM_TIMEOUT'
  if (
      error instanceof ResponseBodyTooLargeError ||
    (error instanceof Error && /STREAM_(?:FRAME|RESPONSE)_TOO_LARGE/.test(error.message))
  ) {
    return 'STREAM_RESPONSE_TOO_LARGE'
  }
  if (
    error instanceof ResponseBodyInvalidEncodingError ||
    error instanceof StreamInvalidEncodingError
  ) {
    return 'STREAM_INVALID_ENCODING'
  }
  return 'STREAM_NETWORK'
}

class StreamTimeoutError extends Error {
  constructor() {
    super('STREAM_TIMEOUT')
    this.name = 'StreamTimeoutError'
  }
}

class StreamInvalidEncodingError extends Error {
  constructor() {
    super('STREAM_INVALID_ENCODING')
    this.name = 'StreamInvalidEncodingError'
  }
}

function frameBoundaryIndex(buffer: string) {
  const lf = buffer.indexOf('\n\n')
  const crlf = buffer.indexOf('\r\n\r\n')
  if (lf < 0) return crlf
  if (crlf < 0) return lf
  return Math.min(lf, crlf)
}

function frameBoundaryLength(buffer: string, index: number) {
  return buffer.slice(index, index + 4) === '\r\n\r\n' ? 4 : 2
}

function parseKaelSseFrame(frame: string): KaelStreamEvent | null {
  const lines = frame.replace(/\r\n/g, '\n').split('\n')
  let eventName = 'message'
  const dataLines: string[] = []
  let commentOnly = true

  for (const line of lines) {
    if (!line) continue
    if (line.startsWith(':')) continue
    commentOnly = false
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (commentOnly) return { type: 'heartbeat' }
  const data = dataLines.length > 0 ? safeParseObject(dataLines.join('\n')) : {}

  if (eventName === 'stage') {
    const progress = stageEventToProgress(data)
    return progress ? { type: 'stage', progress } : null
  }
  if (eventName === 'token') {
    const field = data.field
    const delta = data.delta
    if (
      (field === 'clarification' || field === 'advisory' || field === 'worker_assist') &&
      typeof delta === 'string' && delta.length <= 32_768
    ) {
      return { type: 'token', field, delta }
    }
    return null
  }
  if (eventName === 'result') {
    return { type: 'result', data: data as unknown as KaelChatResponse }
  }
  if (eventName === 'error') {
    const code = safeServerErrorCode(data.code, 0)
    return {
      type: 'error',
      code: code === 'HTTP_0' ? 'STREAM_ERROR' : code,
      message: safeServerError(data.message, 'Kael stream failed.'),
    }
  }
  return null
}

function stageEventToProgress(data: Record<string, unknown>): KaelChatProgress | null {
  const stage = data.stage
  const status = data.status
  const progress = data.progress
  const updatedAt = data.updated_at
  if (
    typeof stage !== 'string' || !isKaelProgressStage(stage) ||
    typeof status !== 'string' || typeof progress !== 'number' ||
    !Number.isFinite(progress) || progress < 0 || progress > 1 ||
    typeof updatedAt !== 'string' || !isBoundedString(updatedAt, 64)
  ) return null
  if (!isKaelProgressStatus(status)) return null
  return {
    current_stage: stage as KaelChatProgress['current_stage'],
    status,
    progress,
    failure_reason: typeof data.failure_reason === 'string' ? data.failure_reason : null,
    updated_at: updatedAt,
  }
}

function isKaelProgressStatus(status: string): status is KaelChatProgress['status'] {
  return status === 'queued' || status === 'running' || status === 'completed' || status === 'failed'
}

function isKaelProgressStage(stage: string): stage is KaelChatProgress['current_stage'] {
  return (KAEL_PROGRESS_STAGES as ReadonlySet<string>).has(stage)
}

function safeParseObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

const KAEL_PROGRESS_STAGES = new Set<KaelChatProgress['current_stage']>([
  'intent_classification',
  'vision_analysis',
  'clarification',
  'problem_synthesis',
  'market_lookup',
  'price_synthesis',
  'advisory_generation',
  'worker_brief',
  'worker_assist',
  'scope_change',
  'scope_reviewing',
  'scope_estimating',
  'post_job_learning',
  'educational_response',
])

const SERVICE_TYPES = new Set<string>(CANONICAL_SERVICE_TYPES)
const CUSTOMER_SESSION_STATUSES = new Set(['active', 'collecting_evidence', 'estimate_ready', 'confirmed', 'abandoned', 'unsupported'])
const CUSTOMER_CASE_PHASES = new Set([
  'analysis', 'offer_review', 'matching', 'worker_candidate_review', 'worker_en_route',
  'service_execution', 'scope_change_review', 'completion_review', 'payment', 'review', 'closed',
])
const CUSTOMER_NEXT_ACTIONS = new Set([
  'await_input', 'collect_evidence', 'ask_photo', 'ask_video', 'estimate_ready',
  'unsupported', 'budget_exceeded', 'confirmed', 'ask_question', 'request_evidence',
])
const CUSTOMER_TURN_ROLES = new Set(['customer', 'kael', 'system'])
const CUSTOMER_TURN_TYPES = new Set([
  'text', 'photo_request', 'video_request', 'photo_attached', 'video_attached',
  'clarification', 'analysis', 'estimate', 'error',
])
const WORKER_SESSION_STATUSES = new Set(['active', 'closed', 'escalated', 'error'])
const WORKER_TURN_ROLES = new Set(['worker', 'kael', 'system'])
const WORKER_TURN_TYPES = new Set(['text', 'clarification', 'guidance', 'photo_request', 'photo_attached', 'error'])
const COMPLEXITY_LEVELS = new Set(['small', 'medium', 'large'])

export function isCustomerKaelStreamResult(value: unknown): value is KaelChatResponse {
  const response = asRecord(value)
  const session = asRecord(response?.session)
  const turns = response?.turns
  if (!response || !session || !Array.isArray(turns) || turns.length > 500) return false
  if (
    !isBoundedString(session.id, 160) || !isNullableBoundedString(session.job_id, 160) ||
    !isBoundedString(session.customer_id, 160) || !isEnumString(session.service_type, SERVICE_TYPES) ||
    !isEnumString(session.status, CUSTOMER_SESSION_STATUSES) ||
    !isEnumString(session.case_phase, CUSTOMER_CASE_PHASES) ||
    !isNullableRecord(session.diagnosis_scope) || !isNullableBoundedString(session.scheduled_at, 64) ||
    !isNullableEstimate(session.estimate) || !isBoundedString(session.started_at, 64) ||
    !isNullableBoundedString(session.estimate_ready_at, 64) || !isNonNegativeInteger(session.total_turns) ||
    !isFiniteRange(session.total_cost_usd, 0, Number.MAX_SAFE_INTEGER) ||
    !isEnumString(session.next_action, CUSTOMER_NEXT_ACTIONS)
  ) return false
  return turns.every(isCustomerTurn)
}

export function isWorkerKaelStreamResult(value: unknown): value is WorkerKaelChatResponse {
  const response = asRecord(value)
  const session = asRecord(response?.session)
  const turns = response?.turns
  if (!response || !session || !Array.isArray(turns) || turns.length > 500) return false
  if (
    !isBoundedString(session.id, 160) || !isBoundedString(session.job_id, 160) ||
    !isBoundedString(session.worker_id, 160) || !isEnumString(session.status, WORKER_SESSION_STATUSES) ||
    !isBoundedString(session.started_at, 64) || !isNullableBoundedString(session.closed_at, 64) ||
    !isNonNegativeInteger(session.total_turns) || !isNullableProgress(session.progress)
  ) return false
  return turns.every(isWorkerTurn)
}

function isCustomerTurn(value: unknown): boolean {
  const turn = asRecord(value)
  if (!turn) return false
  const clarification = turn.clarification
  return isBoundedString(turn.id, 160) && isBoundedString(turn.session_id, 160) &&
    isNonNegativeInteger(turn.turn_index) && isEnumString(turn.role, CUSTOMER_TURN_ROLES) &&
    isEnumString(turn.content_type, CUSTOMER_TURN_TYPES) && isNullableBoundedString(turn.text_content, 12_000) &&
    isBoundedStringArray(turn.media_refs, 16, 1_000) && isNullableEstimate(turn.estimate) &&
    (clarification === undefined || clarification === null || isClarification(clarification)) &&
    isBoundedString(turn.created_at, 64)
}

function isWorkerTurn(value: unknown): boolean {
  const turn = asRecord(value)
  return Boolean(turn) && isBoundedString(turn?.id, 160) && isBoundedString(turn?.session_id, 160) &&
    isNonNegativeInteger(turn?.turn_index) && isEnumString(turn?.role, WORKER_TURN_ROLES) &&
    isEnumString(turn?.content_type, WORKER_TURN_TYPES) && isNullableBoundedString(turn?.text_content, 12_000) &&
    isBoundedStringArray(turn?.media_refs, 16, 1_000) && isBoundedStringArray(turn?.safety_notes, 32, 1_000) &&
    isBoundedString(turn?.created_at, 64)
}

function isClarification(value: unknown): boolean {
  const clarification = asRecord(value)
  return Boolean(clarification) && isNullableBoundedString(clarification?.question, 2_000) &&
    isBoundedStringArray(clarification?.missing_slots, 64, 160)
}

function isNullableEstimate(value: unknown): boolean {
  if (value === null) return true
  const estimate = asRecord(value)
  if (!estimate) return false
  return isEnumString(estimate.service_type, SERVICE_TYPES) &&
    isBoundedString(estimate.problem_category, 160) && isBoundedString(estimate.problem_summary, 2_000) &&
    isEnumString(estimate.complexity, COMPLEXITY_LEVELS) &&
    isFiniteRange(estimate.price_min, 0, Number.MAX_SAFE_INTEGER) &&
    isFiniteRange(estimate.price_max, Number(estimate.price_min), Number.MAX_SAFE_INTEGER) &&
    isFiniteRange(estimate.confidence, 0, 1) && isNullableBoundedString(estimate.advisory, 4_000) &&
    isBoundedString(estimate.disclaimer, 2_000) &&
    (estimate.needs_inspection === undefined || typeof estimate.needs_inspection === 'boolean') &&
    (estimate.price_source === undefined || isNullableBoundedString(estimate.price_source, 160)) &&
    (estimate.needs_inspection_reason === undefined || isNullableBoundedString(estimate.needs_inspection_reason, 2_000)) &&
    (estimate.market_signals === undefined || isNullableBoundedString(estimate.market_signals, 2_000))
}

function isNullableProgress(value: unknown): boolean {
  if (value === null) return true
  const progress = asRecord(value)
  return Boolean(progress) && isEnumString(progress?.current_stage, KAEL_PROGRESS_STAGES) &&
    typeof progress?.status === 'string' && isKaelProgressStatus(progress.status) &&
    isFiniteRange(progress?.progress, 0, 1) && isOptionalNullableBoundedString(progress?.failure_reason, 2_000) &&
    isBoundedString(progress?.updated_at, 64)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function isNullableBoundedString(value: unknown, maxLength: number): boolean {
  return value === null || isBoundedString(value, maxLength)
}

function isOptionalNullableBoundedString(value: unknown, maxLength: number): boolean {
  return value === undefined || isNullableBoundedString(value, maxLength)
}

function isBoundedStringArray(value: unknown, maxItems: number, maxItemLength: number): boolean {
  return Array.isArray(value) && value.length <= maxItems &&
    value.every((item) => isBoundedString(item, maxItemLength))
}

function isNullableRecord(value: unknown): boolean {
  return value === null || asRecord(value) !== null
}

function isEnumString(value: unknown, values: ReadonlySet<string>): value is string {
  return typeof value === 'string' && values.has(value)
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isFiniteRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}
