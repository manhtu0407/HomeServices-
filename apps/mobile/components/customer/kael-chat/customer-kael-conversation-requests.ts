import { customerKaelConversationService } from '@/lib/services'

const responseLoadMemory = new Map<string, Promise<CustomerConversationFetchResult | null>>()
const COMMITTED_TURN_RECOVERY_DELAYS_MS = [0, 400, 900] as const

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
