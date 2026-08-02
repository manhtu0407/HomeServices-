import type { ApiResult } from '@/lib/api'
import type { KaelChatResponse } from '@/lib/api-types'
import { customerKaelConversationService, kaelChatService } from '@/lib/services'

const responseLoadMemory = new Map<string, Promise<CustomerConversationFetchResult | null>>()
const COMMITTED_TURN_RECOVERY_DELAYS_MS = [0, 400, 900] as const
const RECONCILABLE_KAEL_STREAM_FAILURES = new Set([
  'STREAM_BODY_UNREADABLE',
  'STREAM_ENDED',
  'STREAM_INVALID_ENCODING',
  'STREAM_NETWORK',
  'STREAM_RESPONSE_TOO_LARGE',
  'STREAM_RESULT_INVALID',
  'STREAM_TIMEOUT',
])

type CustomerConversationFetchResult = Awaited<ReturnType<typeof customerKaelConversationService.get>>

export function isAmbiguousConversationTurnFailure(
  result: { success: false; code: string },
) {
  return result.code === 'TIMEOUT' ||
    result.code === 'NETWORK_ERROR' ||
    result.code === 'STREAM_BODY_UNREADABLE' ||
    result.code === 'STREAM_ENDED' ||
    result.code === 'STREAM_INVALID_ENCODING' ||
    result.code === 'STREAM_NETWORK' ||
    result.code === 'STREAM_RESPONSE_TOO_LARGE' ||
    result.code === 'STREAM_RESULT_INVALID' ||
    result.code === 'STREAM_TIMEOUT'
}

export async function recoverCommittedConversationTurn(
  conversationId: string,
  clientRequestId: string,
) {
  for (const delayMs of COMMITTED_TURN_RECOVERY_DELAYS_MS) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const loaded = await customerKaelConversationService.get(conversationId)
    if (
      loaded.success
      && loaded.data.turns.some((turn) => turn.client_request_id === clientRequestId)
    ) {
      return loaded.data
    }
  }
  return null
}

export function fetchCustomerConversation(sessionId: string) {
  const inFlight = responseLoadMemory.get(sessionId)
  if (inFlight) return inFlight
  const request = customerKaelConversationService.get(sessionId)
    .catch(() => null)
    .finally(() => {
      if (responseLoadMemory.get(sessionId) === request) responseLoadMemory.delete(sessionId)
    })
  responseLoadMemory.set(sessionId, request)
  return request
}

export async function reconcileCommittedKaelTurn(
  previous: KaelChatResponse,
  streamed: ApiResult<KaelChatResponse>,
): Promise<ApiResult<KaelChatResponse>> {
  if (streamed.success || !RECONCILABLE_KAEL_STREAM_FAILURES.has(streamed.code)) return streamed
  try {
    const recovered = await kaelChatService.get(previous.session.id)
    if (!recovered.success) return streamed
    const previousTurnIndex = previous.session.total_turns
    const newTurns = recovered.data.turns.filter((turn) => turn.turn_index > previousTurnIndex)
    const completed = newTurns.some((turn) => turn.role === 'customer') &&
      newTurns.some((turn) => turn.role === 'kael')
    return completed ? recovered : streamed
  } catch {
    return streamed
  }
}
