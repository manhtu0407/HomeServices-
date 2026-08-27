import type { AdminCapability } from '@nestscout/shared'

import type { AdminViewActor } from '@/lib/api-types/admin'

import type { AdminProductionCapabilityId } from './admin-sections-production-copy'

export type AdminProductionSectionId =
  | 'overview'
  | 'operations'
  | 'workers'
  | 'finance'
  | 'team'
  | 'system'

export type AdminFinanceWorkspace = 'reports' | 'payouts'
export type AdminPayoutTab = 'accounts' | 'withdrawals'

type AdminProductionSectionDefinition = {
  capabilities?: readonly AdminCapability[]
  id: AdminProductionSectionId
  modulePath: string
  ownerOnly?: boolean
}

export type AdminProductionRouteParams = {
  ns_admin_capability?: string | string[]
  ns_admin_section?: string | string[]
  ns_finance_view?: string | string[]
  panel?: string | string[]
}

export type ResolvedAdminProductionRoute = {
  financeWorkspace: AdminFinanceWorkspace
  payoutTab: AdminPayoutTab
  section: AdminProductionSectionId
}

export const ADMIN_PRODUCTION_SECTIONS = [
  { capabilities: ['operations.read'], id: 'overview', modulePath: 'admin-operations-and-team' },
  { capabilities: ['transactions.read'], id: 'operations', modulePath: 'admin-sections' },
  { capabilities: ['workers.read'], id: 'workers', modulePath: 'admin-sections' },
  { capabilities: ['finance.read', 'finance.reconcile', 'payouts.read', 'payouts.process'], id: 'finance', modulePath: 'admin-finance' },
  { capabilities: ['team.read'], id: 'team', modulePath: 'admin-operations-and-team' },
  { capabilities: ['finance.read'], id: 'system', modulePath: 'admin-governance' },
] as const satisfies readonly AdminProductionSectionDefinition[]

function firstRouteValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export function resolveAdminProductionRoute(params: AdminProductionRouteParams): ResolvedAdminProductionRoute {
  const requested = firstRouteValue(params.ns_admin_section) ?? firstRouteValue(params.panel)

  if (requested === 'overview') {
    return { financeWorkspace: 'reports', payoutTab: 'accounts', section: 'overview' }
  }
  if (requested === 'operations') {
    return { financeWorkspace: 'reports', payoutTab: 'accounts', section: 'operations' }
  }
  if (requested === 'transactions') {
    return { financeWorkspace: 'reports', payoutTab: 'accounts', section: 'operations' }
  }
  if (requested === 'withdrawals') {
    return { financeWorkspace: 'payouts', payoutTab: 'withdrawals', section: 'finance' }
  }
  if (requested === 'workers') {
    return { financeWorkspace: 'reports', payoutTab: 'accounts', section: 'workers' }
  }
  if (requested === 'finance') {
    return { financeWorkspace: 'reports', payoutTab: 'accounts', section: 'finance' }
  }
  if (requested === 'team') {
    return { financeWorkspace: 'reports', payoutTab: 'accounts', section: 'team' }
  }
  if (requested === 'governance' || requested === 'system') {
    return { financeWorkspace: 'reports', payoutTab: 'accounts', section: 'system' }
  }
  return { financeWorkspace: 'reports', payoutTab: 'accounts', section: 'overview' }
}

export function resolveAdminProductionCapability(params: AdminProductionRouteParams): AdminProductionCapabilityId | null {
  const explicitCapability = firstRouteValue(params.ns_admin_capability)
  const requestedSection = firstRouteValue(params.ns_admin_section)
  const legacyPanel = firstRouteValue(params.panel)
  const financeView = firstRouteValue(params.ns_finance_view)

  if (isAdminProductionCapabilityId(explicitCapability)) return explicitCapability
  if (requestedSection === 'transactions') return 'operations-service-transactions'
  if (requestedSection === 'withdrawals') return 'finance-payouts'
  if (requestedSection === 'governance') return 'system-price-baseline'
  if (requestedSection === 'finance') {
    if (financeView === 'cash' || financeView === 'commission') return 'finance-reconciliation'
    if (financeView === 'tax') return 'finance-tax'
    if (financeView === 'overview') return 'finance-overview'
  }

  if (requestedSection) return null

  if (legacyPanel === 'transactions') return 'operations-service-transactions'
  if (legacyPanel === 'withdrawals') return 'finance-payouts'
  if (legacyPanel === 'workers') return 'workers-applications'
  if (legacyPanel === 'finance') {
    if (financeView === 'cash' || financeView === 'commission') return 'finance-reconciliation'
    if (financeView === 'tax') return 'finance-tax'
    return 'finance-overview'
  }
  if (legacyPanel === 'team') return 'team-directory'
  if (legacyPanel === 'governance') return 'system-price-baseline'
  return null
}

const ADMIN_PRODUCTION_CAPABILITY_IDS: readonly AdminProductionCapabilityId[] = [
  'operations-job-monitor', 'operations-service-transactions', 'operations-scope-change', 'operations-disputes',
  'workers-applications', 'workers-profile-review', 'workers-access', 'workers-finance',
  'finance-overview', 'finance-reconciliation', 'finance-payouts', 'finance-tax',
  'team-directory', 'team-provisioning', 'team-capabilities', 'team-access-audit',
  'system-price-baseline', 'system-taxonomy', 'system-learning-rules', 'system-model-health',
]

function isAdminProductionCapabilityId(value: string | undefined): value is AdminProductionCapabilityId {
  return Boolean(value && ADMIN_PRODUCTION_CAPABILITY_IDS.includes(value as AdminProductionCapabilityId))
}

export function visibleAdminProductionSections(actor: AdminViewActor | null) {
  if (!actor) return []

  return ADMIN_PRODUCTION_SECTIONS.filter((section) => {
    if ('ownerOnly' in section && section.ownerOnly) return actor.access_level === 'owner'
    if (!('capabilities' in section)) return true
    return section.capabilities.some((capability: AdminCapability) => actor.capabilities.includes(capability))
  })
}
