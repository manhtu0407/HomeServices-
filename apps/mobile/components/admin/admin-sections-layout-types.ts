import type { AdminViewActor, AdminViewOverviewDetailKey, AdminViewTransactionSummary, AdminViewWorkerApplicationDecisionInput, AdminViewWorkerApplicationSummary } from '@/lib/api-types/admin'
import type { AdminSectionsCopy } from './admin-sections-copy'
import type { AdminOverviewOpenTarget } from './admin-overview-dashboard'
import type { AdminProductionCapability } from './admin-sections-production-copy'
import type { AdminSectionsState, AdminSectionTab } from './admin-sections-state'
export type AdminSectionsLayoutProps = {
  actions: {
    closeTransaction: () => void
    commitDecision: (worker: AdminViewWorkerApplicationSummary, decision: AdminViewWorkerApplicationDecisionInput['decision'], reason?: string) => Promise<void>
    commitWorkerAccess: (worker: AdminViewWorkerApplicationSummary, action: 'suspend' | 'reinstate', reason: string) => Promise<void>
    completeSignOut: () => Promise<void>
    handleSessionMissing: () => void
    loadData: (options?: { force?: boolean; refreshActor?: boolean }) => Promise<void>
    openCapability: (capability: AdminProductionCapability) => void
    openOverviewTarget: (target: AdminOverviewOpenTarget) => void
    openSection: (section: AdminSectionTab) => void
    openTransaction: (transaction: AdminViewTransactionSummary) => Promise<void>
    patch: (next: Partial<AdminSectionsState>) => void
  }
  copy: AdminSectionsCopy
  financeView: string
  formatters: {
    disputeStatusLabel: (value: string | null) => string
    formatCurrency: (value: number | null) => string
    formatDate: (value: string | null | undefined) => string
    jobStatusLabel: (value: AdminViewTransactionSummary['status']) => string
    paymentProviderLabel: (value: string | null) => string
    serviceLabel: (value: AdminViewTransactionSummary['service_type']) => string
    statusLabel: (value: string | null) => string
  }
  language: 'vi' | 'en'
  payoutInitialTab: 'accounts' | 'withdrawals'
  reduceMotion: boolean
  reduceTransparency: boolean
  state: AdminSectionsState
}
