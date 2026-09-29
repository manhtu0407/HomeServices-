import {
  type CustomerKaelConversationTurnInput,
  type KaelChatEvidenceInput,
  type KaelChatTurnInput,
  type WorkerKaelChatTurnInput,
} from '@nestscout/shared'

import type {
  CustomerKaelConversationResponse,
  KaelChatProgress,
  KaelChatResponse,
  WorkerKaelChatResponse,
} from './api-types'
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
import {
  isKaelResponseStreamEvent,
  type KaelResponseBlockKind,
  type KaelResponseStreamEvent,
} from './kael-response-stream'
import {
  isKaelReasoningStreamEvent,
  parseKaelReasoningSseEvent,
  type KaelReasoningStreamEvent,
} from './kael-reasoning-receipt'
import {
  isBoundedString,
  isCustomerKaelConversationStreamResult,
  isCustomerKaelStreamResult,
  isKaelProgressStage,
  isKaelProgressStatus,
  isWorkerKaelStreamResult,
  safeParseObject,
} from './kael-stream-validation'

export {
  isCustomerKaelConversationStreamResult,
  isCustomerKaelStreamResult,
  isWorkerKaelStreamResult,
} from './kael-stream-validation'

const STREAM_CONNECT_TIMEOUT_MS = 20_000
const STREAM_TOTAL_TIMEOUT_MS = 90_000
const STREAM_MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const STREAM_MAX_ERROR_BYTES = 128 * 1024
const STREAM_MAX_FRAME_BUFFER_CHARS = 256 * 1024

type KaelStreamStageEvent = {
  type: 'stage'
  progress: KaelChatProgress
}

type KaelStreamTokenEvent = {
  type: 'token'
  field: 'clarification' | 'advisory' | 'worker_assist'
  delta: string
}

export type KaelStreamResponseDeltaEvent = {
  type: 'response_delta'
  turnId: string
  delta: string
}

type KaelStreamResultEvent = {
  type: 'result'
  data: KaelChatResponse
}

type KaelStreamErrorEvent = {
  type: 'error'
  code: string
  message: string
}

type KaelStreamHeartbeatEvent = {
  type: 'heartbeat'
}

type KaelStreamEvent =
  | KaelStreamStageEvent
  | KaelStreamTokenEvent
  | KaelStreamResponseDeltaEvent
  | KaelStreamResultEvent
  | KaelStreamErrorEvent
  | KaelStreamHeartbeatEvent
  | KaelReasoningStreamEvent
  | KaelResponseStreamEvent

export type KaelChatStreamHandlers = {
  onError?: (event: KaelStreamErrorEvent) => void
  onResponseDelta?: (event: KaelStreamResponseDeltaEvent) => void
  onResponseEvent?: (event: KaelResponseStreamEvent) => void
  onReasoning?: (event: KaelReasoningStreamEvent) => void
  onResult?: (event: KaelStreamResultEvent) => void
  onStage?: (event: KaelStreamStageEvent) => void
  onToken?: (event: KaelStreamTokenEvent) => void
}

export type CustomerKaelConversationStreamHandlers = {
  onError?: (event: KaelStreamErrorEvent) => void
  onResponseDelta?: (event: KaelStreamResponseDeltaEvent) => void
  onResponseEvent?: (event: KaelResponseStreamEvent) => void
  onReasoning?: (event: KaelReasoningStreamEvent) => void
  onResult?: (event: { type: 'result'; data: CustomerKaelConversationResponse }) => void
  onStage?: (event: KaelStreamStageEvent) => void
  onToken?: (event: KaelStreamTokenEvent) => void
}

type WorkerKaelStreamResultEvent = {
  type: 'result'
  data: WorkerKaelChatResponse
}

export type WorkerKaelChatStreamHandlers = {
  onError?: (event: KaelStreamErrorEvent) => void
  onResponseDelta?: (event: KaelStreamResponseDeltaEvent) => void
  onResponseEvent?: (event: KaelResponseStreamEvent) => void
  onReasoning?: (event: KaelReasoningStreamEvent) => void
  onResult?: (event: WorkerKaelStreamResultEvent) => void
  onStage?: (event: KaelStreamStageEvent) => void
  onToken?: (event: KaelStreamTokenEvent) => void
}

function supportsKaelChatSseStream() {
  return typeof ReadableStream !== 'undefined' && typeof TextDecoder !== 'undefined'
}

export function createKaelSseParser() {
  let buffer = ''
  let universalResponseId: string | null = null

  return {
    push(chunk: string): KaelStreamEvent[] {
      buffer += chunk
      const events: KaelStreamEvent[] = []
      let boundary = frameBoundaryIndex(buffer)
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + frameBoundaryLength(buffer, boundary))
        const event = parseKaelSseFrame(frame)
        if (event?.type === 'response.started') {
          if (universalResponseId !== null) {
            boundary = frameBoundaryIndex(buffer)
            continue
          }
          universalResponseId = event.responseId
        }
        if (
          event &&
          !(event.type === 'response_delta' && universalResponseId === event.turnId)
        ) events.push(event)
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
  signal?: AbortSignal,
): Promise<ApiResult<KaelChatResponse>> {
  return streamKaelTurn(`/kael/chat/${encodeURIComponent(sessionId)}/stream`, input, handlers, {
    httpErrorField: 'error',
    httpFallbackCode: (status) => `HTTP_${status}`,
    httpFallbackMessage: 'Kael streaming failed.',
  }, isCustomerKaelStreamResult, signal)
}

export async function streamCustomerKaelConversationTurn(
  conversationId: string,
  input: CustomerKaelConversationTurnInput,
  handlers: CustomerKaelConversationStreamHandlers = {},
  signal?: AbortSignal,
  streamFetch?: typeof fetch,
): Promise<ApiResult<CustomerKaelConversationResponse>> {
  return streamKaelTurn(
    `/me/kael/conversations/${encodeURIComponent(conversationId)}/stream`,
    input,
    handlers,
    {
      httpErrorField: 'error',
      httpFallbackCode: (status) => `HTTP_${status}`,
      httpFallbackMessage: 'Kael conversation streaming failed.',
    },
    isCustomerKaelConversationStreamResult,
    signal,
    streamFetch,
  )
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
  signal?: AbortSignal,
): Promise<ApiResult<WorkerKaelChatResponse>> {
  return streamKaelTurn(`/workers/me/kael/chat/${encodeURIComponent(sessionId)}/stream`, input, handlers, {
    httpErrorField: 'message',
    httpFallbackCode: () => 'STREAM_HTTP',
    httpFallbackMessage: 'Kael stream failed.',
  }, isWorkerKaelStreamResult, signal)
}

type StreamHandlers<T> = {
  onError?: (event: KaelStreamErrorEvent) => void
  onResponseDelta?: (event: KaelStreamResponseDeltaEvent) => void
  onResponseEvent?: (event: KaelResponseStreamEvent) => void
  onReasoning?: (event: KaelReasoningStreamEvent) => void
  onResult?: (event: { type: 'result'; data: T }) => void
  onStage?: (event: KaelStreamStageEvent) => void
  onToken?: (event: KaelStreamTokenEvent) => void
}

async function streamKaelTurn<T>(
  path: string,
  input:
    | CustomerKaelConversationTurnInput
    | KaelChatEvidenceInput
    | KaelChatTurnInput
    | WorkerKaelChatTurnInput,
  handlers: StreamHandlers<T>,
  httpError: {
    httpErrorField: 'error' | 'message'
    httpFallbackCode: (status: number) => string
    httpFallbackMessage: string
  },
  resultGuard: (value: unknown) => value is T,
  signal?: AbortSignal,
  streamFetch?: typeof fetch,
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

  const lifetime = createStreamLifetime(signal)
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  try {
    const fetchStream = streamFetch ?? (await import('expo/fetch')).fetch
    const response = await waitForStreamConnection(fetchStream(mobileApiUrl(path), {
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
        if (event.type === 'response_delta') handlers.onResponseDelta?.(event)
        if (isKaelResponseStreamEvent(event)) handlers.onResponseEvent?.(event)
        if (isKaelReasoningStreamEvent(event)) handlers.onReasoning?.(event)
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
    if (signal?.aborted) {
      return {
        success: false,
        error: 'Kael response stopped.',
        code: 'REQUEST_CANCELLED',
        status: 0,
      }
    }
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

function createStreamLifetime(externalSignal?: AbortSignal) {
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(externalSignal?.reason)
  externalSignal?.addEventListener('abort', forwardAbort, { once: true })
  if (externalSignal?.aborted) forwardAbort()
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
      externalSignal?.removeEventListener('abort', forwardAbort)
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

  const reasoningEvent = parseKaelReasoningSseEvent(eventName, data)
  if (reasoningEvent) return reasoningEvent

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
  if (eventName === 'response_delta') {
    const turnId = data.turn_id
    const delta = data.delta
    if (
      isBoundedString(turnId, 160) &&
      typeof delta === 'string' &&
      delta.length > 0 &&
      delta.length <= 32_768
    ) {
      return { type: 'response_delta', turnId, delta }
    }
    return null
  }
  if (eventName === 'response.started') {
    const responseId = data.response_id
    if (
      isBoundedString(responseId, 160) &&
      (data.mode === 'fast' || data.mode === 'standard')
    ) {
      return { mode: data.mode, responseId, type: 'response.started' }
    }
    return null
  }
  if (eventName === 'block.started') {
    const blockId = data.block_id
    const kind = data.kind
    if (isBoundedString(blockId, 220) && isKaelResponseBlockKind(kind)) {
      return { blockId, kind, type: 'block.started' }
    }
    return null
  }
  if (eventName === 'block.text.delta') {
    const blockId = data.block_id
    const delta = data.delta
    if (
      isBoundedString(blockId, 220) &&
      typeof delta === 'string' && delta.length > 0 && delta.length <= 32_768
    ) {
      return { blockId, delta, type: 'block.text.delta' }
    }
    return null
  }
  if (eventName === 'block.completed') {
    const blockId = data.block_id
    return isBoundedString(blockId, 220) ? { blockId, type: 'block.completed' } : null
  }
  if (eventName === 'response.completed') {
    const responseId = data.response_id
    const elapsedMs = data.elapsed_ms
    if (
      isBoundedString(responseId, 160) && typeof elapsedMs === 'number' &&
      Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= STREAM_TOTAL_TIMEOUT_MS
    ) {
      return { elapsedMs, responseId, type: 'response.completed' }
    }
    return null
  }
  if (eventName === 'response.failed') {
    const responseId = data.response_id
    const message = data.message
    const recoverable = data.recoverable
    if (
      isBoundedString(responseId, 160) && isBoundedString(message, 2_000) &&
      typeof recoverable === 'boolean'
    ) {
      return {
        message: safeServerError(message, 'Kael stream failed.'),
        recoverable,
        responseId,
        type: 'response.failed',
      }
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

function isKaelResponseBlockKind(value: unknown): value is KaelResponseBlockKind {
  return value === 'paragraph' || value === 'heading' || value === 'list' || value === 'callout'
}
