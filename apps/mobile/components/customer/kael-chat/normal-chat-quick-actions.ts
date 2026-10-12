import { kaelNextActionsSchema, type CustomerServiceId, type KaelNextAction, type ServiceType } from '@nestscout/shared'

import type { CustomerKaelConversationTurn } from '@/lib/api-types/customer'

export type ComposerQuickAction = {
  id: string
  label: string
  primary?: boolean
  onPress: () => void
}

// Booking reads the customer-facing service id from the route, not the production service type.
const BOOKING_SERVICE_ID: Record<ServiceType, CustomerServiceId> = {
  cleaning: 'home_cleaning',
  electrical: 'electrical',
  handyman: 'handyman_minor_installation',
  hvac: 'hvac_basic_maintenance',
  plumbing: 'plumbing',
  upholstery: 'upholstery_care',
}

export function bookingRouteForService(serviceType: ServiceType) {
  return `/(customer)/booking?service=${BOOKING_SERVICE_ID[serviceType]}`
}

// Only the newest Kael reply may offer to start a service; an older offer is stale once the
// customer has written again.
export function normalChatStartCaseActions(turns: readonly CustomerKaelConversationTurn[]): KaelNextAction[] {
  const last = turns[turns.length - 1]
  if (!last || last.role !== 'kael') return []
  const parsed = kaelNextActionsSchema.safeParse(last.next_actions ?? [])
  return parsed.success
    ? parsed.data.filter((action) => action.kind === 'start_case' && action.service_type)
    : []
}
