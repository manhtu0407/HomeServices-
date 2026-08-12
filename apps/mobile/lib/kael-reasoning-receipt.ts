export const KAEL_REASONING_SCHEMA_VERSION = 'kael_reasoning.v1' as const

export const KAEL_REASONING_STAGES = [
  'intent',
  'context',
  'retrieval',
  'safety',
  'compose',
] as const

export type KaelReasoningStage = (typeof KAEL_REASONING_STAGES)[number]
export type KaelReasoningStepStatus = 'running' | 'completed' | 'failed'
export type KaelReasoningReceiptStatus = 'idle' | 'running' | 'complete' | 'failed'

export type KaelReasoningStep = {
  detail: string | null
  id: string
  label: string
  sequence: number
  stage: KaelReasoningStage
  status: KaelReasoningStepStatus
}

export type KaelReasoningStreamEvent =
  | {
      receiptId: string
      schemaVersion: typeof KAEL_REASONING_SCHEMA_VERSION
      startedAt: string
      type: 'reasoning.started'
    }
  | {
      elapsedMs: number
      receiptId: string
      schemaVersion: typeof KAEL_REASONING_SCHEMA_VERSION
      step: KaelReasoningStep
      type: 'reasoning.step'
    }
  | {
      elapsedMs: number
      fallbackUsed: boolean
      receiptId: string
      schemaVersion: typeof KAEL_REASONING_SCHEMA_VERSION
      summary: string[]
      type: 'reasoning.completed'
    }
  | {
      elapsedMs: number | null
      publicMessage: string
      receiptId: string
      recoverable: boolean
      schemaVersion: typeof KAEL_REASONING_SCHEMA_VERSION
      type: 'reasoning.failed'
    }

export type KaelReasoningReceiptState = {
  elapsedMs: number
  expanded: boolean
  failureMessage: string | null
  fallbackUsed: boolean
  receiptId: string | null
  startedAt: string | null
  status: KaelReasoningReceiptStatus
  steps: KaelReasoningStep[]
  summary: string[]
}

export type KaelReasoningReceiptAction =
  | { type: 'begin' }
  | { event: KaelReasoningStreamEvent; type: 'event' }
  | { message: string; type: 'fail' }
  | { type: 'reset' }
  | { expanded?: boolean; type: 'toggle' }

const MAX_RECEIPT_ID = 160
const MAX_STEP_ID = 80
const MAX_LABEL = 96
const MAX_DETAIL = 180
const MAX_SUMMARY_ITEM = 220
const MAX_FAILURE_MESSAGE = 280
const MAX_ELAPSED_MS = 2 * 60_000
const FORBIDDEN_PUBLIC_TEXT = /(?:\b(?:provider|model|prompt|token|cost|authorization|raw|deepseek|anthropic|perplexity|openai|chatgpt|claude|gemini|grok|mistral|qwen|llama)\b|api(?:[_\s-]?key)|chain\s*of\s*thought|(?:nhà|nha)\s*cung\s*cấp|mô\s*hình|lời\s*nhắc|chuỗi\s*suy\s*nghĩ|chuoi\s*suy\s*nghi|khóa\s*api|khoa\s*api|chỉ\s*dẫn\s*hệ\s*thống|chi\s*phí)/iu
const SECRET_LIKE_VALUE = /\b(?:sk|pplx|sbp|eyJ)[A-Za-z0-9._-]{16,}\b/
const PII_LIKE_VALUE = /(?<!\d)(?:\+?84|0)[\s().-]*(?:\d[\s().-]*){8,10}(?!\d)|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{8,}\b/i

export const initialKaelReasoningReceiptState: KaelReasoningReceiptState = {
  elapsedMs: 0,
  expanded: true,
  failureMessage: null,
  fallbackUsed: false,
  receiptId: null,
  startedAt: null,
  status: 'idle',
  steps: [],
  summary: [],
}

export function isKaelReasoningStreamEvent(value: unknown): value is KaelReasoningStreamEvent {
  return Boolean(value && typeof value === 'object' && 'type' in value && (
    (value as { type?: unknown }).type === 'reasoning.started'
    || (value as { type?: unknown }).type === 'reasoning.step'
    || (value as { type?: unknown }).type === 'reasoning.completed'
    || (value as { type?: unknown }).type === 'reasoning.failed'
  ))
}

export function parseKaelReasoningSseEvent(
  eventName: string,
  value: unknown,
): KaelReasoningStreamEvent | null {
  if (
    eventName !== 'reasoning.started'
    && eventName !== 'reasoning.step'
    && eventName !== 'reasoning.completed'
    && eventName !== 'reasoning.failed'
  ) return null

  const data = asRecord(value)
  if (!data || data.schema_version !== KAEL_REASONING_SCHEMA_VERSION) return null
  const receiptId = receiptIdentifier(data.receipt_id)
  if (!receiptId) return null

  if (eventName === 'reasoning.started') {
    const startedAt = publicText(data.started_at, 64)
    return startedAt && Number.isFinite(Date.parse(startedAt))
      ? {
          receiptId,
          schemaVersion: KAEL_REASONING_SCHEMA_VERSION,
          startedAt,
          type: 'reasoning.started',
        }
      : null
  }

  if (eventName === 'reasoning.step') {
    const elapsedMs = boundedElapsed(data.elapsed_ms)
    const step = parseStep(data.step)
    return elapsedMs !== null && step
      ? {
          elapsedMs,
          receiptId,
          schemaVersion: KAEL_REASONING_SCHEMA_VERSION,
          step,
          type: 'reasoning.step',
        }
      : null
  }

  if (eventName === 'reasoning.completed') {
    const elapsedMs = boundedElapsed(data.elapsed_ms)
    const summary = publicTextArray(data.summary, 4, MAX_SUMMARY_ITEM)
    return elapsedMs !== null && summary !== null && typeof data.fallback_used === 'boolean'
      ? {
          elapsedMs,
          fallbackUsed: data.fallback_used,
          receiptId,
          schemaVersion: KAEL_REASONING_SCHEMA_VERSION,
          summary,
          type: 'reasoning.completed',
        }
      : null
  }

  const elapsedMs = data.elapsed_ms === null ? null : boundedElapsed(data.elapsed_ms)
  const publicMessage = publicText(data.public_message, MAX_FAILURE_MESSAGE)
  return publicMessage && (data.elapsed_ms === null || elapsedMs !== null) && typeof data.recoverable === 'boolean'
    ? {
        elapsedMs,
        publicMessage,
        receiptId,
        recoverable: data.recoverable,
        schemaVersion: KAEL_REASONING_SCHEMA_VERSION,
        type: 'reasoning.failed',
      }
    : null
}

export function kaelReasoningReceiptReducer(
  state: KaelReasoningReceiptState,
  action: KaelReasoningReceiptAction,
): KaelReasoningReceiptState {
  if (action.type === 'reset') return initialKaelReasoningReceiptState
  if (action.type === 'begin') {
    return {
      ...initialKaelReasoningReceiptState,
      status: 'running',
    }
  }
  if (action.type === 'toggle') {
    return { ...state, expanded: action.expanded ?? !state.expanded }
  }
  if (action.type === 'fail') {
    const failureMessage = publicText(action.message, MAX_FAILURE_MESSAGE)
    if (!failureMessage || state.status === 'idle' || state.status === 'complete' || state.status === 'failed') {
      return state
    }
    return {
      ...state,
      expanded: false,
      failureMessage,
      status: 'failed',
      summary: [],
    }
  }

  const event = action.event
  if (event.type === 'reasoning.started') {
    return {
      ...initialKaelReasoningReceiptState,
      receiptId: event.receiptId,
      startedAt: event.startedAt,
      status: 'running',
    }
  }
  if (state.receiptId !== event.receiptId) return state
  if (state.status === 'complete' || state.status === 'failed') return state

  if (event.type === 'reasoning.step') {
    const status = event.step.status === 'failed' ? 'failed' : 'running'
    return {
      ...state,
      elapsedMs: Math.max(state.elapsedMs, event.elapsedMs),
      expanded: status === 'failed' ? false : state.expanded,
      failureMessage: null,
      status,
      steps: upsertStep(state.steps, event.step),
    }
  }
  if (event.type === 'reasoning.completed') {
    return {
      ...state,
      elapsedMs: Math.max(state.elapsedMs, event.elapsedMs),
      expanded: false,
      failureMessage: null,
      fallbackUsed: event.fallbackUsed,
      status: 'complete',
      summary: event.summary,
    }
  }
  return {
    ...state,
    elapsedMs: event.elapsedMs === null ? state.elapsedMs : Math.max(state.elapsedMs, event.elapsedMs),
    expanded: false,
    failureMessage: event.publicMessage,
    status: 'failed',
    summary: [],
  }
}

function parseStep(value: unknown): KaelReasoningStep | null {
  const step = asRecord(value)
  if (!step) return null
  const id = identifier(step.id, MAX_STEP_ID)
  const label = publicText(step.label, MAX_LABEL)
  const detail = step.detail === null ? null : publicText(step.detail, MAX_DETAIL)
  const stage = KAEL_REASONING_STAGES.includes(step.stage as KaelReasoningStage)
    ? step.stage as KaelReasoningStage
    : null
  const status = step.status === 'running' || step.status === 'completed' || step.status === 'failed'
    ? step.status
    : null
  const sequence = Number.isSafeInteger(step.sequence)
    && typeof step.sequence === 'number'
    && step.sequence >= 0
    && step.sequence <= 12
    ? step.sequence
    : null
  if (!id || !label || (step.detail !== null && !detail) || !stage || !status || sequence === null) return null
  return { detail, id, label, sequence, stage, status }
}

function receiptIdentifier(value: unknown) {
  const normalized = identifier(value, MAX_RECEIPT_ID, /^(?:[A-Za-z0-9:_-]+)$/u)
  return normalized && !SECRET_LIKE_VALUE.test(normalized) ? normalized : null
}

function identifier(value: unknown, maxLength: number, pattern = /^[a-z][a-z0-9_-]*$/u) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return pattern.test(normalized) && normalized.length <= maxLength ? normalized : null
}

function publicText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/gu, ' ').trim()
  return normalized
    && normalized.length <= maxLength
    && !FORBIDDEN_PUBLIC_TEXT.test(normalized)
    && !SECRET_LIKE_VALUE.test(normalized)
    && !PII_LIKE_VALUE.test(normalized)
    ? normalized
    : null
}

function publicTextArray(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null
  const normalized = value.map((item) => publicText(item, maxLength))
  return normalized.every((item): item is string => typeof item === 'string') ? normalized : null
}

function boundedElapsed(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_ELAPSED_MS
    ? value
    : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function upsertStep(steps: readonly KaelReasoningStep[], incoming: KaelReasoningStep) {
  const next = steps.filter((step) => step.id !== incoming.id)
  next.push(incoming)
  return next.sort((left, right) => left.sequence - right.sequence)
}
