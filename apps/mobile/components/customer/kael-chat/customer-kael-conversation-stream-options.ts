import type { KaelStreamResponseDeltaEvent } from '@/lib/kael-stream'
import type { KaelResponseStreamEvent } from '@/lib/kael-response-stream'
import type { KaelReasoningStreamEvent } from '@/lib/kael-reasoning-receipt'

export type CustomerKaelTurnStreamOptions = {
  mediaRefs?: readonly string[]
  signal?: AbortSignal
  onReasoning?: (event: KaelReasoningStreamEvent) => void
  onResponseCommitted?: () => void
  /** No turn is returned, yet the server may have committed it (or did, for a superseded request). */
  onOutcomeUncertain?: () => void
  onResponseDelta?: (event: KaelStreamResponseDeltaEvent) => void
  onResponseEvent?: (event: KaelResponseStreamEvent) => void
}

export function forwardCustomerKaelStreamEvent<T>(
  event: T,
  isCurrent: () => boolean,
  onEvent?: (event: T) => void,
) {
  if (!isCurrent()) return
  onEvent?.(event)
}
