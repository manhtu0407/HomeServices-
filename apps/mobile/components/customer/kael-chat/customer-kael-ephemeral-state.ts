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
const composerStateMemory = new Map<string, CustomerKaelComposerState>()
const assistantTurnsMemory = new Map<string, CustomerAssistantLocalTurn[]>()
const mediaDraftsMemory = new Map<string, LocalMediaUploadDraft[]>()
const preAgenticStateMemory = new Map<string, CustomerKaelPreAgenticState>()

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
