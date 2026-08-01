const VERIFIED_RESPONSE_MAX_DELTAS = 40
const VERIFIED_RESPONSE_MIN_DELTA_CHARS = 5
const VERIFIED_RESPONSE_WORD_CADENCE_MS = 110
const VERIFIED_RESPONSE_CLAUSE_CADENCE_MS = 175
const VERIFIED_RESPONSE_SENTENCE_CADENCE_MS = 260
const VERIFIED_RESPONSE_PARAGRAPH_CADENCE_MS = 320

type VerifiedResponseDelta = {
  type: 'response_delta'
  turnId: string
  delta: string
}

export function splitVerifiedResponseDeltas(text: string) {
  if (!text) return []
  const segments = text.match(/\S+\s*|\s+/gu) ?? [text]
  const targetChars = Math.max(
    VERIFIED_RESPONSE_MIN_DELTA_CHARS,
    Math.ceil(text.length / VERIFIED_RESPONSE_MAX_DELTAS),
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
  text,
  turnId,
  wait = waitForCadence,
}: {
  isCurrent: () => boolean
  onDelta: (event: VerifiedResponseDelta) => void
  text: string
  turnId: string
  wait?: (milliseconds: number) => Promise<void>
}) {
  const deltas = splitVerifiedResponseDeltas(text)
  for (let index = 0; index < deltas.length; index += 1) {
    if (!isCurrent()) return false
    onDelta({
      type: 'response_delta',
      turnId,
      delta: deltas[index],
    })
    if (!isCurrent()) return false
    if (index < deltas.length - 1) {
      await wait(verifiedResponseCadenceMs(deltas[index]))
    }
  }
  return isCurrent()
}

function waitForCadence(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}
