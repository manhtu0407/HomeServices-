import type {
  CustomerKaelConversationMode,
  CustomerKaelConversationResponse,
} from '@/lib/api-types/customer'

export function createLocalVisualAuditConversation(
  customerId: string,
  mode: CustomerKaelConversationMode,
  clientRequestId: string,
): CustomerKaelConversationResponse {
  const timestamp = new Date().toISOString()
  return {
    session: {
      case_job_id: null,
      case_session_id: null,
      client_request_id: clientRequestId,
      customer_id: customerId,
      id: `local-visual-audit-${clientRequestId}`,
      mode,
      pinned_at: null,
      profile_id: null,
      service_type: null,
      started_at: timestamp,
      title: null,
      total_turns: 0,
      updated_at: timestamp,
    },
    turns: [],
  }
}
