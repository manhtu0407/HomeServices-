import { api } from '../api'
import type {
  AdminFinanceBalanceSnapshotInput,
  AdminFinanceBalanceSnapshotResponse,
  AdminFinanceRange,
  AdminFinanceSummaryResponse,
  AdminViewAiCostListResponse,
  AdminViewDisputeListResponse,
  AdminViewGovernanceListInput,
  AdminViewLearningRuleListResponse,
  AdminViewManagerNominationCancellationResponse,
  AdminViewManagerNominationResponse,
  AdminViewOperationsResponse,
  AdminViewPayoutMethodDecisionInput,
  AdminViewPayoutMethodDecisionResponse,
  AdminViewPayoutMethodDetailResponse,
  AdminViewPayoutMethodListResponse,
  AdminViewPriceBaselineListResponse,
  AdminViewSubAdminAccessInput,
  AdminViewSubAdminAccessResponse,
  AdminViewSubAdminAccountSearchResponse,
  AdminViewSubAdminListResponse,
  AdminViewTransactionDetailResponse,
  AdminViewTransactionListResponse,
  AdminViewWithdrawalRequestClaimResponse,
  AdminViewWithdrawalRequestDetailResponse,
  AdminViewWithdrawalRequestListResponse,
  AdminViewWithdrawalRequestResolveInput,
  AdminViewWithdrawalRequestResolveResponse,
  AdminViewWorkerAccessInput,
  AdminViewWorkerAccessResponse,
  AdminViewWorkerApplicationDecisionInput,
  AdminViewWorkerApplicationDecisionResponse,
  AdminViewWorkerApplicationListResponse,
  AdminViewWorkerApplicationSummary,
  AdminPaymentReconciliationDecisionInput,
  AdminPaymentReconciliationDecisionResponse,
  AdminPaymentReconciliationListResponse,
  AdminPaymentReconciliationStatus,
} from '../api-types/admin'

function adminGovernancePath(path: string, params: AdminViewGovernanceListInput) {
  const searchParams = new URLSearchParams()
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
  const query = searchParams.toString()
  return `${path}${query ? `?${query}` : ''}`
}

export const adminControlService = {
  getOperations() {
    return api.get<AdminViewOperationsResponse>('/admin/operations')
  },

  listDisputes(params: AdminViewGovernanceListInput = {}) {
    return api.get<AdminViewDisputeListResponse>(adminGovernancePath('/admin/governance/disputes', params))
  },

  listPriceBaselines(params: AdminViewGovernanceListInput = {}) {
    return api.get<AdminViewPriceBaselineListResponse>(adminGovernancePath('/admin/governance/price-baselines', params))
  },

  listAiCosts(params: AdminViewGovernanceListInput = {}) {
    return api.get<AdminViewAiCostListResponse>(adminGovernancePath('/admin/governance/ai-costs', params))
  },

  listLearningRules(params: AdminViewGovernanceListInput = {}) {
    return api.get<AdminViewLearningRuleListResponse>(adminGovernancePath('/admin/governance/learning-rules', params))
  },

  listWorkerApplications(params: {
    status?: 'open' | 'acknowledged' | 'resolved' | 'cancelled' | 'all'
    query?: string
    limit?: number
    offset?: number
  } = {}) {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.query) searchParams.set('query', params.query)
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
    const query = searchParams.toString()
    return api.get<AdminViewWorkerApplicationListResponse>(`/admin/worker-applications${query ? `?${query}` : ''}`)
  },

  getWorkerApplication(applicationId: string) {
    return api.get<AdminViewWorkerApplicationSummary>(`/admin/worker-applications/${encodeURIComponent(applicationId)}`)
  },

  decideWorkerApplication(applicationId: string, input: AdminViewWorkerApplicationDecisionInput) {
    return api.post<AdminViewWorkerApplicationDecisionResponse>(
      `/admin/worker-applications/${encodeURIComponent(applicationId)}/decision`,
      input,
    )
  },

  setWorkerAccess(workerId: string, input: AdminViewWorkerAccessInput) {
    return api.post<AdminViewWorkerAccessResponse>(
      `/admin/workers/${encodeURIComponent(workerId)}/access`,
      input,
    )
  },

  listTransactions(params: {
    payment_status?: string
    query?: string
    limit?: number
    offset?: number
  } = {}) {
    const searchParams = new URLSearchParams()
    if (params.payment_status) searchParams.set('payment_status', params.payment_status)
    if (params.query) searchParams.set('query', params.query)
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
    const query = searchParams.toString()
    return api.get<AdminViewTransactionListResponse>(`/admin/transactions${query ? `?${query}` : ''}`)
  },

  getTransaction(jobId: string) {
    return api.get<AdminViewTransactionDetailResponse>(`/admin/transactions/${encodeURIComponent(jobId)}`)
  },

  listPaymentReconciliations(params: {
    status?: AdminPaymentReconciliationStatus
    limit?: number
    offset?: number
  } = {}) {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
    const query = searchParams.toString()
    return api.get<AdminPaymentReconciliationListResponse>(`/admin/payment-reconciliations${query ? `?${query}` : ''}`)
  },

  decidePaymentReconciliation(paymentOrderId: string, input: AdminPaymentReconciliationDecisionInput) {
    return api.post<AdminPaymentReconciliationDecisionResponse>(
      `/admin/payment-reconciliations/${encodeURIComponent(paymentOrderId)}/decision`,
      input,
    )
  },

  getFinanceSummary(params: { range: AdminFinanceRange; anchor?: string }) {
    const searchParams = new URLSearchParams({ range: params.range })
    if (params.anchor) searchParams.set('anchor', params.anchor)
    return api.get<AdminFinanceSummaryResponse>(`/admin/finance/summary?${searchParams.toString()}`)
  },

  recordFinanceBalanceSnapshot(input: AdminFinanceBalanceSnapshotInput) {
    return api.post<AdminFinanceBalanceSnapshotResponse>('/admin/finance/balance-snapshots', input)
  },

  listPayoutMethods(params: {
    status?: 'pending_verification' | 'verified' | 'rejected' | 'all'
    limit?: number
    offset?: number
  } = {}) {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
    const query = searchParams.toString()
    return api.get<AdminViewPayoutMethodListResponse>(`/admin/payout-methods${query ? `?${query}` : ''}`)
  },

  getPayoutMethod(payoutMethodId: string) {
    return api.get<AdminViewPayoutMethodDetailResponse>(`/admin/payout-methods/${encodeURIComponent(payoutMethodId)}`)
  },

  decidePayoutMethod(payoutMethodId: string, input: AdminViewPayoutMethodDecisionInput) {
    return api.post<AdminViewPayoutMethodDecisionResponse>(
      `/admin/payout-methods/${encodeURIComponent(payoutMethodId)}/decision`,
      input,
    )
  },

  listWithdrawalRequests(params: {
    status?: 'pending' | 'processing' | 'paid' | 'rejected' | 'failed' | 'all'
    limit?: number
    offset?: number
  } = {}) {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
    const query = searchParams.toString()
    return api.get<AdminViewWithdrawalRequestListResponse>(`/admin/withdrawal-requests${query ? `?${query}` : ''}`)
  },

  getWithdrawalRequest(withdrawalRequestId: string) {
    return api.get<AdminViewWithdrawalRequestDetailResponse>(
      `/admin/withdrawal-requests/${encodeURIComponent(withdrawalRequestId)}`,
    )
  },

  claimWithdrawalRequest(withdrawalRequestId: string) {
    return api.post<AdminViewWithdrawalRequestClaimResponse>(
      `/admin/withdrawal-requests/${encodeURIComponent(withdrawalRequestId)}/claim`,
    )
  },

  resolveWithdrawalRequest(withdrawalRequestId: string, input: AdminViewWithdrawalRequestResolveInput) {
    return api.post<AdminViewWithdrawalRequestResolveResponse>(
      `/admin/withdrawal-requests/${encodeURIComponent(withdrawalRequestId)}/resolve`,
      input,
    )
  },

  listSubAdmins() {
    return api.get<AdminViewSubAdminListResponse>('/admin/sub-admins')
  },

  searchSubAdminAccounts(query: string) {
    const searchParams = new URLSearchParams({ query })
    return api.get<AdminViewSubAdminAccountSearchResponse>(`/admin/sub-admins/accounts?${searchParams.toString()}`)
  },

  nominateManager(userId: string) {
    return api.post<AdminViewManagerNominationResponse>(
      `/admin/manager-nominations/${encodeURIComponent(userId)}`,
    )
  },

  cancelManagerNomination(nominationId: string) {
    return api.post<AdminViewManagerNominationCancellationResponse>(
      `/admin/manager-nominations/${encodeURIComponent(nominationId)}/cancel`,
    )
  },

  setSubAdminAccess(userId: string, input: AdminViewSubAdminAccessInput) {
    return api.post<AdminViewSubAdminAccessResponse>(
      `/admin/sub-admins/${encodeURIComponent(userId)}/access`,
      input,
    )
  },
}
