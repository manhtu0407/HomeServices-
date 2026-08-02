import {
  segmentKaelResponseText,
  type KaelResponseStreamEvent,
} from './kael-response-stream'

const VERIFIED_RESPONSE_MAX_DELTAS = 72
const VERIFIED_RESPONSE_MIN_DELTA_CHARS = 3
const VERIFIED_RESPONSE_WORD_CADENCE_MS = 88
const VERIFIED_RESPONSE_CLAUSE_CADENCE_MS = 150
const VERIFIED_RESPONSE_SENTENCE_CADENCE_MS = 260
const VERIFIED_RESPONSE_PARAGRAPH_CADENCE_MS = 360

type VerifiedResponseDelta = {
  type: 'response_delta'
  turnId: string
  delta: string
}

export function verifiedResponseTargetChars(text: string) {
  return Math.max(
    VERIFIED_RESPONSE_MIN_DELTA_CHARS,
    Math.ceil(text.length / VERIFIED_RESPONSE_MAX_DELTAS),
  )
}

export function splitVerifiedResponseDeltas(
  text: string,
  minimumTargetChars = VERIFIED_RESPONSE_MIN_DELTA_CHARS,
) {
  if (!text) return []
  const segments = text.match(/\S+\s*|\s+/gu) ?? [text]
  const targetChars = Math.max(
    minimumTargetChars,
    verifiedResponseTargetChars(text),
  )
  const deltas: string[] = []
  let current = ''

  for (const segment of segments) {
    if (current && current.length + segment.length > targetChars) {
      deltas.push(current)
      current = segment
    } else {
      current += segment
    }
  }
  if (current) deltas.push(current)

  while (deltas.length > VERIFIED_RESPONSE_MAX_DELTAS) {
    const tail = deltas.pop() ?? ''
    deltas[deltas.length - 1] = `${deltas[deltas.length - 1] ?? ''}${tail}`
  }
  return deltas
}

export function verifiedResponseCadenceMs(delta: string) {
  const trimmed = delta.trimEnd()
  if (delta.includes('\n')) return VERIFIED_RESPONSE_PARAGRAPH_CADENCE_MS
  if (/[.!?\u2026]["')\]\u2019\u201d]*$/u.test(trimmed)) {
    return VERIFIED_RESPONSE_SENTENCE_CADENCE_MS
  }
  if (/[,;:]["')\]\u2019\u201d]*$/u.test(trimmed)) {
    return VERIFIED_RESPONSE_CLAUSE_CADENCE_MS
  }
  return VERIFIED_RESPONSE_WORD_CADENCE_MS
}

export async function revealVerifiedResponse({
  isCurrent,
  onDelta,
  onResponseEvent,
  text,
  turnId,
  wait = waitForCadence,
}: {
  isCurrent: () => boolean
  onDelta?: (event: VerifiedResponseDelta) => void
  onResponseEvent?: (event: KaelResponseStreamEvent) => void
  text: string
  turnId: string
  wait?: (milliseconds: number) => Promise<void>
}) {
  if (!onResponseEvent) {
    const deltas = splitVerifiedResponseDeltas(text)
    for (let index = 0; index < deltas.length; index += 1) {
      if (!isCurrent()) return false
      onDelta?.({ type: 'response_delta', turnId, delta: deltas[index] })
      if (!isCurrent()) return false
      if (index < deltas.length - 1) {
        await wait(verifiedResponseCadenceMs(deltas[index]))
      }
    }
    return isCurrent()
  }

  const startedAt = Date.now()
  const blocks = segmentKaelResponseText(text, turnId)
  const targetChars = verifiedResponseTargetChars(text)
  onResponseEvent({ mode: 'standard', responseId: turnId, type: 'response.started' })
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex]
    if (!isCurrent()) return false
    onResponseEvent({ blockId: block.id, kind: block.kind, type: 'block.started' })
    const deltas = splitVerifiedResponseDeltas(block.text, targetChars)
    for (let deltaIndex = 0; deltaIndex < deltas.length; deltaIndex += 1) {
      if (!isCurrent()) return false
      const delta = deltas[deltaIndex]
      onResponseEvent({ blockId: block.id, delta, type: 'block.text.delta' })
      onDelta?.({ delta, turnId, type: 'response_delta' })
      if (deltaIndex < deltas.length - 1) {
        await wait(verifiedResponseCadenceMs(delta))
      }
    }
    onResponseEvent({ blockId: block.id, type: 'block.completed' })
    if (blockIndex < blocks.length - 1) {
      await wait(VERIFIED_RESPONSE_PARAGRAPH_CADENCE_MS)
    }
  }
  onResponseEvent({
    elapsedMs: Date.now() - startedAt,
    responseId: turnId,
    type: 'response.completed',
  })
  return isCurrent()
}

function waitForCadence(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}
