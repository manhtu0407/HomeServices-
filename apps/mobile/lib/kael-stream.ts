import type { KaelChatProgress, KaelChatResponse, WorkerKaelChatResponse } from './api-types'
import {
  type ApiResult,
  getMobileApiAuthHeaders,
  mobileApiConfigError,
  mobileApiUrl,
} from './api'
import type { KaelChatTurnInput, WorkerKaelChatTurnInput } from '@home-services/shared'

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
      return events
    },
  }
}

export async function streamKaelChatTurn(
  sessionId: string,
  input: KaelChatTurnInput,
  handlers: KaelChatStreamHandlers = {},
): Promise<ApiResult<KaelChatResponse>> {
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

  try {
    const { fetch: expoFetch } = await import('expo/fetch')
    const response = await expoFetch(mobileApiUrl(`/kael/chat/${sessionId}/stream`), {
      method: 'POST',
      headers: await getMobileApiAuthHeaders(),
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      const errorBody = await response.text()
      const parsed = safeParseObject(errorBody)
      return {
        success: false,
        error: typeof parsed.error === 'string' ? parsed.error : 'Kael streaming failed.',
        code: typeof parsed.code === 'string' ? parsed.code : `HTTP_${response.status}`,
        status: response.status,
      }
    }

    const reader = response.body?.getReader()
    if (!reader) {
      return {
        success: false,
        error: 'Kael streaming is not readable on this device.',
        code: 'STREAM_BODY_UNREADABLE',
        status: response.status,
      }
    }

    const decoder = new TextDecoder()
    const parser = createKaelSseParser()
    let finalResult: KaelChatResponse | null = null

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const event of parser.push(chunk)) {
        if (event.type === 'stage') handlers.onStage?.(event)
        if (event.type === 'token') handlers.onToken?.(event)
        if (event.type === 'error') {
          handlers.onError?.(event)
          return { success: false, error: event.message, code: event.code, status: response.status }
        }
        if (event.type === 'result') {
          handlers.onResult?.(event)
          finalResult = event.data
        }
      }
    }

    if (finalResult) return { success: true, data: finalResult, status: response.status }
    return {
      success: false,
      error: 'Kael stream ended before a result.',
      code: 'STREAM_ENDED',
      status: response.status,
    }
  } catch {
    return {
      success: false,
      error: 'Kael streaming connection failed.',
      code: 'STREAM_NETWORK',
      status: 0,
    }
  }
}

export async function streamWorkerKaelChatTurn(
  sessionId: string,
  input: WorkerKaelChatTurnInput,
  handlers: WorkerKaelChatStreamHandlers = {},
): Promise<ApiResult<WorkerKaelChatResponse>> {
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

  try {
    const { fetch: expoFetch } = await import('expo/fetch')
    const response = await expoFetch(mobileApiUrl(`/workers/me/kael/chat/${sessionId}/stream`), {
      method: 'POST',
      headers: await getMobileApiAuthHeaders(),
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      const errorBody = await response.text()
      const parsed = safeParseObject(errorBody)
      return {
        success: false,
        error: typeof parsed.message === 'string' ? parsed.message : 'Kael stream failed.',
        code: typeof parsed.code === 'string' ? parsed.code : 'STREAM_HTTP',
        status: response.status,
      }
    }

    const reader = response.body?.getReader()
    if (!reader) {
      return {
        success: false,
        error: 'Kael streaming is not readable on this device.',
        code: 'STREAM_BODY_UNREADABLE',
        status: response.status,
      }
    }

    const decoder = new TextDecoder()
    const parser = createKaelSseParser()
    let finalResult: WorkerKaelChatResponse | null = null

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const event of parser.push(chunk)) {
        if (event.type === 'stage') handlers.onStage?.(event)
        if (event.type === 'token') handlers.onToken?.(event)
        if (event.type === 'error') {
          handlers.onError?.(event)
          return { success: false, error: event.message, code: event.code, status: response.status }
        }
        if (event.type === 'result') {
          const result = event.data as unknown as WorkerKaelChatResponse
          handlers.onResult?.({ type: 'result', data: result })
          finalResult = result
        }
      }
    }

    if (finalResult) return { success: true, data: finalResult, status: response.status }
    return {
      success: false,
      error: 'Kael stream ended before a result.',
      code: 'STREAM_ENDED',
      status: response.status,
    }
  } catch {
    return {
      success: false,
      error: 'Kael streaming connection failed.',
      code: 'STREAM_NETWORK',
      status: 0,
    }
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
    if ((field === 'clarification' || field === 'advisory' || field === 'worker_assist') && typeof delta === 'string') {
      return { type: 'token', field, delta }
    }
    return null
  }
  if (eventName === 'result') {
    return { type: 'result', data: data as unknown as KaelChatResponse }
  }
  if (eventName === 'error') {
    return {
      type: 'error',
      code: typeof data.code === 'string' ? data.code : 'STREAM_ERROR',
      message: typeof data.message === 'string' ? data.message : 'Kael stream failed.',
    }
  }
  return null
}

function stageEventToProgress(data: Record<string, unknown>): KaelChatProgress | null {
  const stage = data.stage
  const status = data.status
  const progress = data.progress
  const updatedAt = data.updated_at
  if (typeof stage !== 'string' || typeof status !== 'string' || typeof progress !== 'number') return null
  if (!isKaelProgressStatus(status)) return null
  return {
    current_stage: stage as KaelChatProgress['current_stage'],
    status,
    progress,
    failure_reason: typeof data.failure_reason === 'string' ? data.failure_reason : null,
    updated_at: typeof updatedAt === 'string' ? updatedAt : new Date().toISOString(),
  }
}

function isKaelProgressStatus(status: string): status is KaelChatProgress['status'] {
  return status === 'queued' || status === 'running' || status === 'completed' || status === 'failed'
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
