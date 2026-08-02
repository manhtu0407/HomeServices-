export type KaelResponseBlockKind = 'paragraph' | 'heading' | 'list' | 'callout'
export type KaelResponseBlockStatus = 'streaming' | 'completed' | 'failed'
export type KaelResponseStreamStatus = 'idle' | 'streaming' | 'completed' | 'failed'

export type KaelResponseBlock = {
  id: string
  kind: KaelResponseBlockKind
  status: KaelResponseBlockStatus
  text: string
}

export type KaelResponseStreamEvent =
  | { mode: 'fast' | 'standard'; responseId: string; type: 'response.started' }
  | { blockId: string; kind: KaelResponseBlockKind; type: 'block.started' }
  | { blockId: string; delta: string; type: 'block.text.delta' }
  | { blockId: string; type: 'block.completed' }
  | { elapsedMs: number; responseId: string; type: 'response.completed' }
  | { message: string; recoverable: boolean; responseId: string; type: 'response.failed' }

export type KaelResponseStreamState = {
  blockOrder: string[]
  blocks: Record<string, KaelResponseBlock>
  elapsedMs: number | null
  error: string | null
  responseId: string | null
  status: KaelResponseStreamStatus
  transport: 'universal' | 'legacy'
}

type LegacyResponseDelta = {
  delta: string
  turnId: string
  type: 'response_delta'
}

const MAX_RESPONSE_TEXT_CHARS = 12_000
const MAX_RESPONSE_BLOCKS = 32

export const initialKaelResponseStreamState: KaelResponseStreamState = {
  blockOrder: [],
  blocks: {},
  elapsedMs: null,
  error: null,
  responseId: null,
  status: 'idle',
  transport: 'universal',
}

export function kaelResponseStreamReducer(
  state: KaelResponseStreamState,
  event: KaelResponseStreamEvent,
): KaelResponseStreamState {
  switch (event.type) {
    case 'response.started':
      return {
        ...initialKaelResponseStreamState,
        responseId: event.responseId,
        status: 'streaming',
      }
    case 'block.started': {
      if (
        state.status !== 'streaming' ||
        !state.responseId ||
        !event.blockId.startsWith(`${state.responseId}:block:`) ||
        state.blocks[event.blockId] ||
        state.blockOrder.length >= MAX_RESPONSE_BLOCKS
      ) return state
      const block: KaelResponseBlock = {
        id: event.blockId,
        kind: event.kind,
        status: 'streaming',
        text: '',
      }
      return {
        ...state,
        blockOrder: [...state.blockOrder, event.blockId],
        blocks: { ...state.blocks, [event.blockId]: block },
      }
    }
    case 'block.text.delta': {
      if (state.status !== 'streaming') return state
      const block = state.blocks[event.blockId]
      if (!block || block.status !== 'streaming') return state
      const remaining = MAX_RESPONSE_TEXT_CHARS - responseTextLength(state)
      if (remaining <= 0) return state
      const delta = event.delta.slice(0, remaining)
      if (!delta) return state
      return {
        ...state,
        blocks: {
          ...state.blocks,
          [event.blockId]: { ...block, text: `${block.text}${delta}` },
        },
      }
    }
    case 'block.completed': {
      if (state.status !== 'streaming') return state
      const block = state.blocks[event.blockId]
      if (!block || block.status !== 'streaming') return state
      return {
        ...state,
        blocks: {
          ...state.blocks,
          [event.blockId]: { ...block, status: 'completed' },
        },
      }
    }
    case 'response.completed':
      if (state.status !== 'streaming' || state.responseId !== event.responseId) return state
      return {
        ...state,
        blocks: completeResponseBlocks(state.blocks),
        elapsedMs: event.elapsedMs,
        status: 'completed',
      }
    case 'response.failed':
      if (state.status !== 'streaming' || state.responseId !== event.responseId) return state
      return {
        ...state,
        blocks: failResponseBlocks(state.blocks),
        error: event.message,
        status: 'failed',
      }
  }
}

export function appendLegacyKaelResponseDelta(
  state: KaelResponseStreamState | null,
  event: LegacyResponseDelta,
): KaelResponseStreamState {
  if (state?.transport === 'universal' && state.responseId === event.turnId) return state
  const blockId = `${event.turnId}:block:0`
  const base = state?.transport === 'legacy' && state.responseId === event.turnId
    ? state
    : {
        ...initialKaelResponseStreamState,
        blockOrder: [blockId],
        blocks: {
          [blockId]: {
            id: blockId,
            kind: 'paragraph' as const,
            status: 'streaming' as const,
            text: '',
          },
        },
        responseId: event.turnId,
        status: 'streaming' as const,
        transport: 'legacy' as const,
      }
  const block = base.blocks[blockId]
  const remaining = MAX_RESPONSE_TEXT_CHARS - responseTextLength(base)
  const delta = event.delta.slice(0, Math.max(0, remaining))
  if (!block || !delta) return base
  return {
    ...base,
    blocks: {
      ...base.blocks,
      [blockId]: { ...block, text: `${block.text}${delta}` },
    },
  }
}

export function createCompletedKaelResponseState(
  text: string,
  responseId: string,
): KaelResponseStreamState {
  const responseBlocks = segmentKaelResponseText(text, responseId)
  return {
    blockOrder: responseBlocks.map((block) => block.id),
    blocks: Object.fromEntries(responseBlocks.map((block) => [
      block.id,
      { ...block, status: 'completed' as const },
    ])),
    elapsedMs: null,
    error: null,
    responseId,
    status: 'completed',
    transport: 'universal',
  }
}

export function segmentKaelResponseText(text: string, responseId: string) {
  const normalized = text.replace(/\r\n/gu, '\n')
  const sections = normalized.split(/(\n{2,})/u)
  const blocks: Omit<KaelResponseBlock, 'status'>[] = []

  for (let index = 0; index < sections.length; index += 2) {
    const section = sections[index]
    if (!section || section.trim().length === 0) continue
    blocks.push({
      id: `${responseId}:block:${blocks.length}`,
      kind: responseBlockKind(section),
      text: section,
    })
  }

  return capResponseBlocks(blocks, responseId)
}

export function activeKaelResponseBlockId(state: KaelResponseStreamState) {
  for (let index = state.blockOrder.length - 1; index >= 0; index -= 1) {
    const blockId = state.blockOrder[index]
    if (state.blocks[blockId]?.status === 'streaming') return blockId
  }
  return null
}

export function isKaelResponseStreamEvent(event: { type: string }): event is KaelResponseStreamEvent {
  return event.type === 'response.started' ||
    event.type === 'block.started' ||
    event.type === 'block.text.delta' ||
    event.type === 'block.completed' ||
    event.type === 'response.completed' ||
    event.type === 'response.failed'
}

function responseBlockKind(section: string): KaelResponseBlockKind {
  const lines = section.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length > 0 && lines.every((line) => /^\s*#{1,3}\s+\S/u.test(line))) return 'heading'
  if (lines.length > 0 && lines.every((line) => /^\s*(?:[-*\u2022]|\d+[.)])\s+\S/u.test(line))) return 'list'
  if (lines.length > 0 && lines.every((line) => /^\s*>\s*\S/u.test(line))) return 'callout'
  return 'paragraph'
}

function responseTextLength(state: KaelResponseStreamState) {
  return state.blockOrder.reduce((total, blockId) => total + (state.blocks[blockId]?.text.length ?? 0), 0)
}

function completeResponseBlocks(blocks: Record<string, KaelResponseBlock>) {
  return Object.fromEntries(Object.entries(blocks).map(([blockId, block]) => [
    blockId,
    block.status === 'streaming' ? { ...block, status: 'completed' as const } : block,
  ]))
}

function failResponseBlocks(blocks: Record<string, KaelResponseBlock>) {
  return Object.fromEntries(Object.entries(blocks).map(([blockId, block]) => [
    blockId,
    block.status === 'streaming' ? { ...block, status: 'failed' as const } : block,
  ]))
}

function capResponseBlocks(
  blocks: Omit<KaelResponseBlock, 'status'>[],
  responseId: string,
) {
  if (blocks.length <= MAX_RESPONSE_BLOCKS) return blocks
  const retained = blocks.slice(0, MAX_RESPONSE_BLOCKS - 1)
  retained.push({
    id: `${responseId}:block:${MAX_RESPONSE_BLOCKS - 1}`,
    kind: 'paragraph',
    text: blocks.slice(MAX_RESPONSE_BLOCKS - 1).map((block) => block.text).join('\n\n'),
  })
  return retained
}
