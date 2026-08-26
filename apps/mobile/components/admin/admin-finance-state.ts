import type {
  AdminFinanceOverviewResponse,
  AdminFinanceRange,
  AdminFinanceSummaryResponse,
  AdminPaymentReconciliationDetailResponse,
  AdminPaymentReconciliationSummary,
} from '@/lib/api-types/admin'

import type { FinanceView } from './admin-finance-controls'

export type FinanceState = {
  activeView: FinanceView
  actualAmount: string
  assignmentReason: string
  bankReference: string
  customEditorOpen: boolean
  customFrom: string
  customMode: boolean
  customTo: string
  detailError: string | null
  detailLoading: boolean
  error: string | null
  loading: boolean
  notice: string | null
  observedBalance: string
  overview: AdminFinanceOverviewResponse | null
  pendingAction: string | null
  range: AdminFinanceRange
  reason: string
  reconciliations: AdminPaymentReconciliationSummary[]
  selected: AdminPaymentReconciliationSummary | null
  selectedDetail: AdminPaymentReconciliationDetailResponse | null
  summary: AdminFinanceSummaryResponse | null
}

export type ReconciliationControlsState = {
  assignment: 'all' | 'mine' | 'unassigned'
  debouncedQuery: string
  method: 'all' | 'platform_bank_manual' | 'direct_worker'
  nextCursor: string | null
  query: string
  total: { amount: number | null; count: number | null }
}

type FinanceAction = { type: 'patch'; value: Partial<FinanceState> }

export const initialFinanceState: FinanceState = {
  activeView: 'overview',
  actualAmount: '',
  assignmentReason: '',
  bankReference: '',
  customEditorOpen: false,
  customFrom: '',
  customMode: false,
  customTo: '',
  detailError: null,
  detailLoading: false,
  error: null,
  loading: true,
  notice: null,
  observedBalance: '',
  overview: null,
  pendingAction: null,
  range: 'month',
  reason: '',
  reconciliations: [],
  selected: null,
  selectedDetail: null,
  summary: null,
}

export const initialReconciliationControlsState: ReconciliationControlsState = {
  assignment: 'all',
  debouncedQuery: '',
  method: 'all',
  nextCursor: null,
  query: '',
  total: { amount: null, count: null },
}

export function financeReducer(state: FinanceState, action: FinanceAction): FinanceState {
  return { ...state, ...action.value }
}

export function reconciliationControlsReducer(current: ReconciliationControlsState, next: Partial<ReconciliationControlsState>) {
  return { ...current, ...next }
}
