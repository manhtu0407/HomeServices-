import type {
  AdminViewActor,
  AdminViewManagerNominationSummary,
  AdminViewOperationsResponse,
  AdminViewOperatorProvisioningSummary,
  AdminViewOverviewDetailKey,
  AdminViewSubAdminSummary,
  AdminViewTransactionDetailResponse,
  AdminViewTransactionSummary,
  AdminViewWorkerApplicationSummary,
  AdminViewWorkerReviewStage,
} from '@/lib/api-types/admin'

import type { AdminProductionCapabilityId } from './admin-sections-production-copy'
import {
  resolveAdminProductionRoute,
  type AdminProductionSectionId,
} from './admin-sections-production-registry'
import type { DecisionModal, WorkerAccessModal } from './admin-sections-support'

export type AdminSectionTab = AdminProductionSectionId
export type AdminTransactionView = 'services' | 'payouts'
export type WorkerFilter = AdminViewWorkerReviewStage | 'all'

export const TRANSACTIONS_PER_PAGE = 8
export const WORKERS_PER_PAGE = 8

export type AdminSectionsState = {
  activeTab: AdminSectionTab
  selectedCapabilityId: AdminProductionCapabilityId | null
  transactionView: AdminTransactionView
  transactionPage: number
  transactionsHasMore: boolean
  transactionsTotalCount: number | null
  workerPage: number
  workersHasMore: boolean
  workersTotalCount: number | null
  workerFilter: WorkerFilter
  searchQuery: string
  debouncedSearchQuery: string
  workers: AdminViewWorkerApplicationSummary[]
  transactions: AdminViewTransactionSummary[]
  operations: AdminViewOperationsResponse | null
  overviewDetailKey: AdminViewOverviewDetailKey | null
  subAdmins: AdminViewSubAdminSummary[]
  managerNominations: AdminViewManagerNominationSummary[]
  pendingAdminAccounts: AdminViewOperatorProvisioningSummary[]
  actor: AdminViewActor | null
  selectedWorker: AdminViewWorkerApplicationSummary | null
  selectedTransaction: AdminViewTransactionDetailResponse | null
  decisionModal: DecisionModal
  decisionReason: string
  workerAccessModal: WorkerAccessModal
  workerAccessReason: string
  notice: string | null
  error: string | null
  operationsError: string | null
  teamError: string | null
  loading: boolean
  refreshing: boolean
  actionPending: string | null
  detailLoading: boolean
  signOutConfirmationOpen: boolean
  signingOut: boolean
}

type AdminSectionsAction =
  | { type: 'patch'; patch: Partial<AdminSectionsState> }
  | { type: 'update_workers'; update: (workers: AdminViewWorkerApplicationSummary[]) => AdminViewWorkerApplicationSummary[] }

type AdminSectionsInitialState = {
  capability: AdminProductionCapabilityId | null
  route: ReturnType<typeof resolveAdminProductionRoute>
}

export function initialAdminSectionsState({ capability, route }: AdminSectionsInitialState): AdminSectionsState {
  return {
    activeTab: route.section,
    selectedCapabilityId: capability,
    transactionView: route.financeWorkspace === 'payouts' ? 'payouts' : 'services',
    transactionPage: 1,
    transactionsHasMore: false,
    transactionsTotalCount: null,
    workerPage: 1,
    workersHasMore: false,
    workersTotalCount: null,
    workerFilter: 'pending_access',
    searchQuery: '',
    debouncedSearchQuery: '',
    workers: [],
    transactions: [],
    operations: null,
    overviewDetailKey: null,
    subAdmins: [],
    managerNominations: [],
    pendingAdminAccounts: [],
    actor: null,
    selectedWorker: null,
    selectedTransaction: null,
    decisionModal: null,
    decisionReason: '',
    workerAccessModal: null,
    workerAccessReason: '',
    notice: null,
    error: null,
    operationsError: null,
    teamError: null,
    loading: true,
    refreshing: false,
    actionPending: null,
    detailLoading: false,
    signOutConfirmationOpen: false,
    signingOut: false,
  }
}

export function withFinanceReadBaseline(actor: AdminViewActor): AdminViewActor {
  if (actor.capabilities.includes('finance.read')) return actor
  return { ...actor, capabilities: ['finance.read', ...actor.capabilities] }
}

export function adminSectionsReducer(state: AdminSectionsState, action: AdminSectionsAction): AdminSectionsState {
  if (action.type === 'patch') return { ...state, ...action.patch }
  if (action.type === 'update_workers') return { ...state, workers: action.update(state.workers) }
  return state
}
