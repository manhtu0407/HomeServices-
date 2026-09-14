import AsyncStorage from '@react-native-async-storage/async-storage'
import type { CustomerAssistantLocalTurn } from './use-customer-kael-conversation-state'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

export type CustomerKaelComposerState = {
  draft: string
  voiceTranscript: string
}

export type CustomerKaelPreAgenticState = {
  message: string
  ownerKey: string
  stage: 'clarification' | 'confirmation'
}

export type CustomerKaelSessionEphemeralSummary = {
  hasUnsentDraft: boolean
  localPreview: string | null
  localTurnCount: number
}

const MAX_REMEMBERED_SCOPES = 24
const CUSTOMER_KAEL_COMPOSER_STORAGE_VERSION = 1
const CUSTOMER_KAEL_COMPOSER_MAX_LENGTH = 5_000
export const CUSTOMER_KAEL_COMPOSER_STORAGE_PREFIX = 'nestscout.customer.kael-composer.v1'
const composerStateMemory = new Map<string, CustomerKaelComposerState>()
const assistantTurnsMemory = new Map<string, CustomerAssistantLocalTurn[]>()
const mediaDraftsMemory = new Map<string, LocalMediaUploadDraft[]>()
const preAgenticStateMemory = new Map<string, CustomerKaelPreAgenticState>()
let composerStorageLane: Promise<void> = Promise.resolve()

type StoredCustomerKaelComposerState = {
  state: CustomerKaelComposerState
  version: typeof CUSTOMER_KAEL_COMPOSER_STORAGE_VERSION
}

function customerKaelComposerStorageKey(scopeKey: string) {
  return `${CUSTOMER_KAEL_COMPOSER_STORAGE_PREFIX}.${encodeURIComponent(scopeKey)}`
}

function enqueueComposerStorageOperation<T>(operation: () => Promise<T>) {
  const queued = composerStorageLane.then(operation, operation)
  composerStorageLane = queued.then(() => undefined, () => undefined)
  return queued
}

function parseStoredCustomerKaelComposerState(raw: string | null): CustomerKaelComposerState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCustomerKaelComposerState>
    const state = parsed.state
    if (
      parsed.version !== CUSTOMER_KAEL_COMPOSER_STORAGE_VERSION ||
      !state ||
      typeof state.draft !== 'string' ||
      typeof state.voiceTranscript !== 'string' ||
      state.draft.length > CUSTOMER_KAEL_COMPOSER_MAX_LENGTH ||
      state.voiceTranscript.length > CUSTOMER_KAEL_COMPOSER_MAX_LENGTH
    ) return null
    return { draft: state.draft, voiceTranscript: state.voiceTranscript }
  } catch {
    return null
  }
}

export function persistCustomerKaelComposerState(
  scopeKey: string,
  state: CustomerKaelComposerState,
) {
  return enqueueComposerStorageOperation(async () => {
    const key = customerKaelComposerStorageKey(scopeKey)
    if (
      (!state.draft && !state.voiceTranscript) ||
      state.draft.length > CUSTOMER_KAEL_COMPOSER_MAX_LENGTH ||
      state.voiceTranscript.length > CUSTOMER_KAEL_COMPOSER_MAX_LENGTH
    ) {
      await AsyncStorage.removeItem(key).catch(() => undefined)
      return
    }
    const envelope: StoredCustomerKaelComposerState = {
      state: { draft: state.draft, voiceTranscript: state.voiceTranscript },
      version: CUSTOMER_KAEL_COMPOSER_STORAGE_VERSION,
    }
    await AsyncStorage.setItem(key, JSON.stringify(envelope)).catch(() => undefined)
  })
}

export function readPersistedCustomerKaelComposerState(scopeKey: string) {
  return enqueueComposerStorageOperation(async () => {
    const key = customerKaelComposerStorageKey(scopeKey)
    const raw = await AsyncStorage.getItem(key).catch(() => null)
    const state = parseStoredCustomerKaelComposerState(raw)
    if (raw !== null && !state) await AsyncStorage.removeItem(key).catch(() => undefined)
    return state
  })
}

export function flushCustomerKaelComposerStorage() {
  return composerStorageLane
}

function trimMemory<T>(memory: Map<string, T>) {
  while (memory.size > MAX_REMEMBERED_SCOPES) {
    const oldestKey = memory.keys().next().value
    if (oldestKey === undefined) return
    memory.delete(oldestKey)
  }
}

export function readCustomerKaelComposerState(scopeKey: string): CustomerKaelComposerState {
  const remembered = composerStateMemory.get(scopeKey)
  return remembered ? { ...remembered } : { draft: '', voiceTranscript: '' }
}

export function rememberCustomerKaelComposerState(
  scopeKey: string,
  state: CustomerKaelComposerState,
) {
  if (!state.draft && !state.voiceTranscript) {
    composerStateMemory.delete(scopeKey)
    return
  }
  composerStateMemory.delete(scopeKey)
  composerStateMemory.set(scopeKey, { ...state })
  trimMemory(composerStateMemory)
}

export function readCustomerKaelAssistantTurns(scopeKey: string): CustomerAssistantLocalTurn[] {
  return (assistantTurnsMemory.get(scopeKey) ?? []).map((turn) => ({ ...turn }))
}

export function rememberCustomerKaelAssistantTurns(
  scopeKey: string,
  turns: CustomerAssistantLocalTurn[],
) {
  if (turns.length === 0) {
    assistantTurnsMemory.delete(scopeKey)
    return
  }
  assistantTurnsMemory.delete(scopeKey)
  assistantTurnsMemory.set(scopeKey, turns.map((turn) => ({ ...turn })))
  trimMemory(assistantTurnsMemory)
}

export function readCustomerKaelMediaDrafts(scopeKey: string): LocalMediaUploadDraft[] {
  return (mediaDraftsMemory.get(scopeKey) ?? []).map((draft) => ({ ...draft }))
}

export function rememberCustomerKaelMediaDrafts(
  scopeKey: string,
  drafts: LocalMediaUploadDraft[],
) {
  if (drafts.length === 0) {
    mediaDraftsMemory.delete(scopeKey)
    return
  }
  mediaDraftsMemory.delete(scopeKey)
  mediaDraftsMemory.set(scopeKey, drafts.map((draft) => ({ ...draft })))
  trimMemory(mediaDraftsMemory)
}

export function readCustomerKaelPreAgenticState(
  ownerKey: string,
): CustomerKaelPreAgenticState | null {
  const remembered = preAgenticStateMemory.get(ownerKey)
  return remembered ? { ...remembered } : null
}

export function rememberCustomerKaelPreAgenticState(
  ownerKey: string,
  state: CustomerKaelPreAgenticState | null,
) {
  if (!state) {
    preAgenticStateMemory.delete(ownerKey)
    return
  }
  preAgenticStateMemory.delete(ownerKey)
  preAgenticStateMemory.set(ownerKey, { ...state })
  trimMemory(preAgenticStateMemory)
}

export function clearCustomerKaelPreAgenticState(ownerKey: string) {
  preAgenticStateMemory.delete(ownerKey)
}

export function customerKaelSessionEphemeralScopeKey(
  stateScopeKey: string,
  sessionId: string | null,
) {
  return `${stateScopeKey}:session:${sessionId ?? 'blank'}`
}

export function summarizeCustomerKaelEphemeralSession(input: {
  composer: CustomerKaelComposerState
  mediaDrafts: LocalMediaUploadDraft[]
  turns: CustomerAssistantLocalTurn[]
}): CustomerKaelSessionEphemeralSummary {
  const localPreview = input.turns.find((turn) => turn.role === 'customer')?.text_content.trim() ||
    input.composer.draft.trim() ||
    input.composer.voiceTranscript.trim() ||
    null
  return {
    hasUnsentDraft: Boolean(
      input.composer.draft.trim() || input.composer.voiceTranscript.trim() || input.mediaDrafts.length,
    ),
    localPreview,
    localTurnCount: input.turns.length,
  }
}

export function readCustomerKaelSessionEphemeralSummary(
  stateScopeKey: string,
  sessionId: string | null,
): CustomerKaelSessionEphemeralSummary {
  const sessionScopeKey = customerKaelSessionEphemeralScopeKey(stateScopeKey, sessionId)
  return summarizeCustomerKaelEphemeralSession({
    composer: readCustomerKaelComposerState(sessionScopeKey),
    mediaDrafts: readCustomerKaelMediaDrafts(sessionScopeKey),
    turns: readCustomerKaelAssistantTurns(sessionScopeKey),
  })
}

export function clearCustomerKaelSessionEphemeralState(
  stateScopeKey: string,
  sessionId: string | null,
) {
  const sessionScopeKey = customerKaelSessionEphemeralScopeKey(stateScopeKey, sessionId)
  clearCustomerKaelEphemeralState(sessionScopeKey)
}

export function clearCustomerKaelEphemeralState(scopeKey: string) {
  composerStateMemory.delete(scopeKey)
  assistantTurnsMemory.delete(scopeKey)
  mediaDraftsMemory.delete(scopeKey)
  clearCustomerKaelPreAgenticState(scopeKey)
}
