import type { AdminViewActor } from '@/lib/api-types/admin'

import type { AdminProductionCapabilityId } from './admin-sections-production-copy'

export function canAccessProductionCapability(
  capabilityId: AdminProductionCapabilityId,
  actor: AdminViewActor | null,
) {
  if (!actor) return false
  if (capabilityId.startsWith('operations-')) {
    if (capabilityId === 'operations-service-transactions') return actor.capabilities.includes('transactions.read')
    return actor.capabilities.includes('operations.read')
  }
  if (capabilityId === 'finance-payouts') {
    return actor.capabilities.includes('payouts.read') || actor.capabilities.includes('payouts.process')
  }
  if (capabilityId === 'workers-discipline') return actor.capabilities.includes('workers.discipline.manage')
  if (capabilityId === 'workers-ambassador') return actor.capabilities.includes('workers.bonus.manage')
  if (capabilityId.startsWith('finance-')) {
    return actor.capabilities.includes('finance.read') || actor.capabilities.includes('finance.reconcile')
  }
  return true
}
