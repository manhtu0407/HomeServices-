export type KaelRespondStreamItem = {
  id: string
  text: string
}

export type KaelRespondStreamPresentationState = {
  streamId: string | null
  textById: Record<string, string>
}

export type KaelRespondStreamPresentationStep = {
  delayMs: number
  state: KaelRespondStreamPresentationState
}

const FAST_BACKLOG_DELAY_MS = 18
const NORMAL_DELAY_MS = 34
const SMALL_BACKLOG_DELAY_MS = 48

export function createKaelRespondStreamPresentationState(
  items: readonly KaelRespondStreamItem[],
  streamId: string | null,
  revealImmediately: boolean,
): KaelRespondStreamPresentationState {
  return {
    streamId,
    textById: Object.fromEntries(items.map((item) => [
      item.id,
      revealImmediately ? item.text : '',
    ])),
  }
}

export function reconcileKaelRespondStreamPresentation(
  state: KaelRespondStreamPresentationState,
  items: readonly KaelRespondStreamItem[],
  streamId: string | null,
): KaelRespondStreamPresentationState {
  if (state.streamId !== streamId) {
    return createKaelRespondStreamPresentationState(items, streamId, false)
  }
  return {
    streamId,
    textById: Object.fromEntries(items.map((item) => {
      const revealed = state.textById[item.id] ?? ''
      return [item.id, item.text.startsWith(revealed) ? revealed : '']
    })),
  }
}

export function nextKaelRespondStreamPresentationStep(
  state: KaelRespondStreamPresentationState,
  items: readonly KaelRespondStreamItem[],
): KaelRespondStreamPresentationStep | null {
  const pendingChars = totalPendingCharacters(state, items)
  for (const item of items) {
    const revealed = state.textById[item.id] ?? ''
    if (revealed === item.text) continue
    const safeRevealed = item.text.startsWith(revealed) ? revealed : ''
    const remaining = item.text.slice(safeRevealed.length)
    const chunk = nextSemanticChunk(remaining, pendingChars)
    if (!chunk) continue
    return {
      delayMs: presentationDelay(pendingChars),
      state: {
        ...state,
        textById: {
          ...state.textById,
          [item.id]: `${safeRevealed}${chunk}`,
        },
      },
    }
  }
  return null
}

export function isKaelRespondStreamPresentationSettled(
  state: KaelRespondStreamPresentationState,
  items: readonly KaelRespondStreamItem[],
  streamId: string | null,
) {
  return state.streamId === streamId && items.every(
    (item) => state.textById[item.id] === item.text,
  )
}

function totalPendingCharacters(
  state: KaelRespondStreamPresentationState,
  items: readonly KaelRespondStreamItem[],
) {
  return items.reduce((total, item) => {
    const revealed = state.textById[item.id] ?? ''
    return total + Math.max(0, item.text.length - revealed.length)
  }, 0)
}

function nextSemanticChunk(remaining: string, pendingChars: number) {
  const characters = Array.from(remaining)
  if (characters.length === 0) return ''
  const maxLength = pendingChars > 720 ? 72 : pendingChars > 260 ? 48 : 28
  const minimumLength = Math.min(10, maxLength)
  const limit = Math.min(characters.length, maxLength)
  for (let index = limit; index >= minimumLength; index -= 1) {
    const candidate = characters.slice(0, index).join('')
    if (/[\s.,;:!?…]$/u.test(candidate)) return candidate
  }
  return characters.slice(0, limit).join('')
}

function presentationDelay(pendingChars: number) {
  if (pendingChars > 720) return FAST_BACKLOG_DELAY_MS
  if (pendingChars > 260) return NORMAL_DELAY_MS
  return SMALL_BACKLOG_DELAY_MS
}
