import { api } from '../api'
import type {
  AdminFinanceBalanceSnapshotInput,
  AdminFinanceBalanceSnapshotListResponse,
  AdminFinanceBalanceSnapshotResponse,
  AdminFinanceCsvExportResponse,
  AdminFinanceOverviewResponse,
  AdminFinancePeriodInput,
  AdminFinanceRange,
  AdminFinanceSummaryResponse,
  AdminFinanceTaxPolicy,
  AdminFinanceTaxPolicyApproveInput,
  AdminFinanceTaxPolicyDraftInput,
  AdminFinanceTaxPolicyListResponse,
  AdminFinanceTaxPolicyRetireInput,
  AdminFinanceTransactionFilters,
  AdminFinanceTransactionListResponse,
  AdminFinanceTransactionDetailResponse,
  AdminViewAiCostListResponse,
  AdminViewActor,
  AdminViewDisputeListResponse,
  AdminViewGovernanceListInput,
  AdminViewLearningRuleListResponse,
  AdminViewManagerNominationCancellationResponse,
  AdminViewManagerNominationResponse,
  AdminViewOperationsResponse,
  AdminViewEvidenceAccessInput,
  AdminViewEvidenceAccessResponse,
  AdminViewOverviewDetailKey,
  AdminViewOverviewDetailsResponse,
  AdminViewOperatorProvisionInput,
  AdminViewOperatorProvisionResponse,
  AdminViewOperatorResetPasswordResponse,
  AdminViewPayoutMethodDecisionInput,
  AdminViewPayoutMethodDecisionResponse,
  AdminViewPayoutMethodDetailResponse,
  AdminViewPayoutMethodListResponse,
  AdminViewSensitivePayoutAccessInput,
  AdminViewSensitivePayoutAccessResponse,
  AdminViewPriceBaselineListResponse,
  AdminViewSubAdminAccessInput,
  AdminViewSubAdminAccessResponse,
  AdminViewSubAdminAccountSearchResponse,
  AdminViewSubAdminListInput,
  AdminViewSubAdminListResponse,
  AdminViewScopeChangeDetailResponse,
  AdminViewScopeChangeListInput,
  AdminViewScopeChangeListResponse,
  AdminViewSupportCaseDetailResponse,
  AdminViewSupportCaseListInput,
  AdminViewSupportCaseListResponse,
  AdminViewSupportCaseSource,
  AdminViewSupportPreparation,
  AdminViewSupportPreparationInput,
  AdminViewTransactionDetailResponse,
  AdminViewTransactionListResponse,
  AdminViewWithdrawalRequestClaimResponse,
  AdminViewWithdrawalRequestClaimInput,
  AdminViewWithdrawalRequestDetailResponse,
  AdminViewWithdrawalRequestListResponse,
  AdminViewWithdrawalRequestResolveInput,
  AdminViewWithdrawalRequestResolveResponse,
  AdminViewWithdrawalRequestReleaseInput,
  AdminViewWithdrawalRequestReleaseResponse,
  AdminViewWorkerAccessInput,
  AdminViewWorkerAccessResponse,
  AdminViewWorkerApplicationDecisionInput,
  AdminViewWorkerApplicationDecisionResponse,
  AdminViewWorkerApplicationListResponse,
  AdminViewWorkerApplicationSummary,
  AdminViewWorkerProfileDecisionInput,
  AdminViewWorkerProfileDecisionResponse,
  AdminViewWorkerReviewDetail,
  AdminViewWorkerReviewStage,
  AdminWorkerFinanceSnapshotResponse,
  AdminPaymentReconciliationDecisionInput,
  AdminPaymentReconciliationDecisionResponse,
  AdminPaymentReconciliationListResponse,
  AdminPaymentReconciliationListInput,
  AdminPaymentReconciliationDetailResponse,
  AdminPaymentReconciliationClaimInput,
  AdminPaymentReconciliationReleaseInput,
  AdminPaymentReconciliationAssignmentResponse,
} from '../api-types/admin'
import type {
  AdminSystemEvidencePackage,
  AdminSystemLearningActionInput,
  AdminSystemLearningDetailResponse,
  AdminSystemLearningListResponse,
  AdminSystemLearningPreviewResponse,
  AdminSystemListInput,
  AdminSystemModelHealthDetailResponse,
  AdminSystemModelHealthResponse,
  AdminSystemMutationInput,
  AdminSystemPriceDetailResponse,
  AdminSystemPriceListResponse,
  AdminSystemPriceMutationInput,
  AdminSystemPriceValidationResponse,
  AdminSystemReceipt,
  AdminSystemTaxonomyDetailResponse,
  AdminSystemTaxonomyListResponse,
  AdminSystemTaxonomyMutationInput,
  AdminSystemTaxonomyValidationResponse,
} from '../api-types/admin-system'

function adminGovernancePath(path: string, params: AdminViewGovernanceListInput) {
  const searchParams = new URLSearchParams()
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
  const query = searchParams.toString()
  return `${path}${query ? `?${query}` : ''}`
}

function adminFinancePath(path: string, params: AdminFinanceTransactionFilters | AdminFinancePeriodInput) {
  const searchParams = new URLSearchParams()
  if (params.range) searchParams.set('range', params.range)
  if (params.anchor) searchParams.set('anchor', params.anchor)
  if (params.from) searchParams.set('from', params.from)
  if (params.to) searchParams.set('to', params.to)
  if ('cursor' in params && params.cursor) searchParams.set('cursor', params.cursor)
  if ('limit' in params && params.limit !== undefined) searchParams.set('limit', String(params.limit))
  if ('payment_method' in params && params.payment_method) searchParams.set('payment_method', params.payment_method)
  if ('service_type' in params && params.service_type) searchParams.set('service_type', params.service_type)
  if ('status' in params && params.status) searchParams.set('status', params.status)
  const query = searchParams.toString()
  return `${path}${query ? `?${query}` : ''}`
}

function adminOperationsPath(path: string, params: AdminViewScopeChangeListInput | AdminViewSupportCaseListInput) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  }
  const query = searchParams.toString()
  return `${path}${query ? `?${query}` : ''}`
}

function adminSystemPath(path: string, params: AdminSystemListInput = {}) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value))
  }
  const query = searchParams.toString()
  return `${path}${query ? `?${query}` : ''}`
}

export const adminControlService = {
  getActor() {
    return api.get<AdminViewActor>('/admin/actor')
  },

  getOperations() {
    return api.get<AdminViewOperationsResponse>('/admin/operations')
  },

  listScopeChanges(params: AdminViewScopeChangeListInput = {}) {
    return api.get<AdminViewScopeChangeListResponse>(adminOperationsPath('/admin/operations/scope-changes', params))
  },

  getScopeChange(scopeChangeId: string) {
    return api.get<AdminViewScopeChangeDetailResponse>(
      `/admin/operations/scope-changes/${encodeURIComponent(scopeChangeId)}`,
    )
  },

  createScopeChangeEvidenceAccess(scopeChangeId: string, input: AdminViewEvidenceAccessInput) {
    return api.post<AdminViewEvidenceAccessResponse>(
      `/admin/operations/scope-changes/${encodeURIComponent(scopeChangeId)}/evidence-access`,
      input,
    )
  },

  listSupportCases(params: AdminViewSupportCaseListInput = {}) {
    return api.get<AdminViewSupportCaseListResponse>(adminOperationsPath('/admin/operations/support-cases', params))
  },

  getSupportCase(source: AdminViewSupportCaseSource, caseId: string) {
    return api.get<AdminViewSupportCaseDetailResponse>(
      `/admin/operations/support-cases/${encodeURIComponent(source)}/${encodeURIComponent(caseId)}`,
    )
  },

  updateSupportCasePreparation(
    source: AdminViewSupportCaseSource,
    caseId: string,
    input: AdminViewSupportPreparationInput,
  ) {
    return api.put<AdminViewSupportPreparation>(
      `/admin/operations/support-cases/${encodeURIComponent(source)}/${encodeURIComponent(caseId)}/preparation`,
      input,
    )
  },

  createSupportCaseEvidenceAccess(
    source: AdminViewSupportCaseSource,
    caseId: string,
    input: AdminViewEvidenceAccessInput,
  ) {
    return api.post<AdminViewEvidenceAccessResponse>(
      `/admin/operations/support-cases/${encodeURIComponent(source)}/${encodeURIComponent(caseId)}/evidence-access`,
      input,
    )
  },

  getOverviewDetails(params: { key: AdminViewOverviewDetailKey; limit?: number; cursor?: string }) {
    const searchParams = new URLSearchParams({
      key: params.key,
      limit: String(params.limit ?? 5),
    })
    if (params.cursor) searchParams.set('cursor', params.cursor)
    return api.get<AdminViewOverviewDetailsResponse>(`/admin/overview/details?${searchParams.toString()}`)
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

  listSystemPriceBaselines(params: AdminSystemListInput = {}) {
    return api.get<AdminSystemPriceListResponse>(adminSystemPath('/admin/system/price-baselines', params))
  },

  getSystemPriceBaseline(baselineId: string) {
    return api.get<AdminSystemPriceDetailResponse>(`/admin/system/price-baselines/${encodeURIComponent(baselineId)}`)
  },

  listSystemEvidencePackages(params: AdminSystemListInput = {}) {
    return api.get<{ generated_at: string; records: AdminSystemEvidencePackage[] }>(adminSystemPath('/admin/system/price-evidence-packages', params))
  },

  validateSystemPriceBaseline(input: AdminSystemPriceMutationInput) {
    return api.post<AdminSystemPriceValidationResponse>('/admin/system/price-baselines/validate', input)
  },

  publishSystemPriceBaseline(input: AdminSystemPriceMutationInput) {
    return api.post<AdminSystemReceipt>('/admin/system/price-baselines/versions', input)
  },

  retireSystemPriceBaseline(baselineId: string, input: AdminSystemMutationInput) {
    return api.post<AdminSystemReceipt>(`/admin/system/price-baselines/${encodeURIComponent(baselineId)}/retire`, input)
  },

  getSystemTaxonomy(params: AdminSystemListInput = {}) {
    return api.get<AdminSystemTaxonomyListResponse>(adminSystemPath('/admin/system/taxonomy', params))
  },

  getSystemTaxonomyDetail(serviceType: string) {
    return api.get<AdminSystemTaxonomyDetailResponse>(`/admin/system/taxonomy/${encodeURIComponent(serviceType)}`)
  },

  validateSystemTaxonomy(serviceType: string, input: AdminSystemTaxonomyMutationInput) {
    return api.post<AdminSystemTaxonomyValidationResponse>(`/admin/system/taxonomy/${encodeURIComponent(serviceType)}/validate`, input)
  },

  updateSystemTaxonomy(serviceType: string, input: AdminSystemTaxonomyMutationInput) {
    return api.put<AdminSystemReceipt>(`/admin/system/taxonomy/${encodeURIComponent(serviceType)}`, input)
  },

  listSystemLearningRules(params: AdminSystemListInput = {}) {
    return api.get<AdminSystemLearningListResponse>(adminSystemPath('/admin/system/learning-rules', params))
  },

  getSystemLearningRule(ruleId: string) {
    return api.get<AdminSystemLearningDetailResponse>(`/admin/system/learning-rules/${encodeURIComponent(ruleId)}`)
  },

  previewSystemLearningAction(ruleId: string, action: 'rollback' | 'revoke', input: AdminSystemLearningActionInput) {
    return api.post<AdminSystemLearningPreviewResponse>(`/admin/system/learning-rules/${encodeURIComponent(ruleId)}/${action}-preview`, input)
  },

  applySystemLearningAction(ruleId: string, action: 'rollback' | 'revoke', input: AdminSystemLearningActionInput) {
    return api.post<AdminSystemReceipt>(`/admin/system/learning-rules/${encodeURIComponent(ruleId)}/${action}`, input)
  },

  listSystemModelHealth(params: AdminSystemListInput = {}) {
    return api.get<AdminSystemModelHealthResponse>(adminSystemPath('/admin/system/model-health', params))
  },

  getSystemModelHealthDetail(detailKey: string) {
    return api.get<AdminSystemModelHealthDetailResponse>(`/admin/system/model-health/details?key=${encodeURIComponent(detailKey)}`)
  },

  listWorkerApplications(params: {
    status?: 'open' | 'acknowledged' | 'resolved' | 'cancelled' | 'all'
    query?: string
    limit?: number
    offset?: number
    cursor?: string
    stage?: AdminViewWorkerReviewStage | 'all'
  } = {}) {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.query) searchParams.set('query', params.query)
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
    if (params.cursor) searchParams.set('cursor', params.cursor)
    if (params.stage) searchParams.set('stage', params.stage)
    const query = searchParams.toString()
    return api.get<AdminViewWorkerApplicationListResponse>(`/admin/worker-applications${query ? `?${query}` : ''}`)
  },

  getWorkerApplication(applicationId: string) {
    return api.get<AdminViewWorkerApplicationSummary>(`/admin/worker-applications/${encodeURIComponent(applicationId)}`)
  },

  getWorkerReviewDetail(applicationId: string) {
    return api.get<AdminViewWorkerReviewDetail>(
      `/admin/worker-applications/${encodeURIComponent(applicationId)}/review-detail`,
    )
  },

  decideWorkerProfile(applicationId: string, input: AdminViewWorkerProfileDecisionInput) {
    return api.post<AdminViewWorkerProfileDecisionResponse>(
      `/admin/worker-applications/${encodeURIComponent(applicationId)}/profile-decision`,
      input,
    )
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

  getWorkerFinanceSnapshot(workerId: string, params: { from?: string; to?: string } = {}) {
    const searchParams = new URLSearchParams()
    if (params.from) searchParams.set('from', params.from)
    if (params.to) searchParams.set('to', params.to)
    const query = searchParams.toString()
    return api.get<AdminWorkerFinanceSnapshotResponse>(
      `/admin/workers/${encodeURIComponent(workerId)}/finance-snapshot${query ? `?${query}` : ''}`,
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

  listPaymentReconciliations(params: AdminPaymentReconciliationListInput = {}) {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.cursor) searchParams.set('cursor', params.cursor)
    if (params.payment_method) searchParams.set('payment_method', params.payment_method)
    if (params.assignment) searchParams.set('assignment', params.assignment)
    if (params.query) searchParams.set('query', params.query)
    const query = searchParams.toString()
    return api.get<AdminPaymentReconciliationListResponse>(`/admin/payment-reconciliations${query ? `?${query}` : ''}`)
  },

  getPaymentReconciliation(paymentOrderId: string) {
    return api.get<AdminPaymentReconciliationDetailResponse>(
      `/admin/payment-reconciliations/${encodeURIComponent(paymentOrderId)}`,
    )
  },

  claimPaymentReconciliation(paymentOrderId: string, input: AdminPaymentReconciliationClaimInput) {
    return api.post<AdminPaymentReconciliationAssignmentResponse>(
      `/admin/payment-reconciliations/${encodeURIComponent(paymentOrderId)}/claim`,
      input,
    )
  },

  releasePaymentReconciliation(paymentOrderId: string, input: AdminPaymentReconciliationReleaseInput) {
    return api.post<AdminPaymentReconciliationAssignmentResponse>(
      `/admin/payment-reconciliations/${encodeURIComponent(paymentOrderId)}/release`,
      input,
    )
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

  getFinanceOverview(params: AdminFinancePeriodInput = { range: 'month' }) {
    return api.get<AdminFinanceOverviewResponse>(adminFinancePath('/admin/finance/overview', params))
  },

  listFinanceTransactions(params: AdminFinanceTransactionFilters) {
    return api.get<AdminFinanceTransactionListResponse>(adminFinancePath('/admin/finance/transactions', params))
  },

  getFinanceTransaction(jobId: string) {
    return api.get<AdminFinanceTransactionDetailResponse>(`/admin/finance/transactions/${encodeURIComponent(jobId)}`)
  },

  exportFinanceCsv(params: AdminFinanceTransactionFilters) {
    return api.get<AdminFinanceCsvExportResponse>(adminFinancePath('/admin/finance/export.csv', params))
  },

  listFinanceTaxPolicies() {
    return api.get<AdminFinanceTaxPolicyListResponse>('/admin/finance/tax-policies')
  },

  getFinanceTaxPolicy(policyId: string) {
    return api.get<AdminFinanceTaxPolicy>(`/admin/finance/tax-policies/${encodeURIComponent(policyId)}`)
  },

  createFinanceTaxPolicyDraft(input: AdminFinanceTaxPolicyDraftInput) {
    return api.post<AdminFinanceTaxPolicy>('/admin/finance/tax-policies/drafts', input)
  },

  updateFinanceTaxPolicyDraft(policyId: string, input: AdminFinanceTaxPolicyDraftInput) {
    return api.patch<AdminFinanceTaxPolicy>(`/admin/finance/tax-policies/${encodeURIComponent(policyId)}/draft`, input)
  },

  approveFinanceTaxPolicy(policyId: string, input: AdminFinanceTaxPolicyApproveInput) {
    return api.post<AdminFinanceTaxPolicy>(`/admin/finance/tax-policies/${encodeURIComponent(policyId)}/approve`, input)
  },

  retireFinanceTaxPolicy(policyId: string, input: AdminFinanceTaxPolicyRetireInput) {
    return api.post<AdminFinanceTaxPolicy>(`/admin/finance/tax-policies/${encodeURIComponent(policyId)}/retire`, input)
  },

  recordFinanceBalanceSnapshot(input: AdminFinanceBalanceSnapshotInput) {
    return api.post<AdminFinanceBalanceSnapshotResponse>('/admin/finance/balance-snapshots', input)
  },

  listFinanceBalanceSnapshots() {
    return api.get<AdminFinanceBalanceSnapshotListResponse>('/admin/finance/balance-snapshots')
  },

  listPayoutMethods(params: {
    status?: 'pending_verification' | 'verified' | 'rejected' | 'all'
    limit?: number
    cursor?: string
    query?: string
  } = {}) {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.cursor) searchParams.set('cursor', params.cursor)
    if (params.query) searchParams.set('query', params.query)
    const query = searchParams.toString()
    return api.get<AdminViewPayoutMethodListResponse>(`/admin/payout-methods${query ? `?${query}` : ''}`)
  },

  getPayoutMethod(payoutMethodId: string) {
    return api.get<AdminViewPayoutMethodDetailResponse>(`/admin/payout-methods/${encodeURIComponent(payoutMethodId)}`)
  },

  accessPayoutMethodSensitive(payoutMethodId: string, input: AdminViewSensitivePayoutAccessInput) {
    return api.post<AdminViewSensitivePayoutAccessResponse>(
      `/admin/payout-methods/${encodeURIComponent(payoutMethodId)}/sensitive-access`,
      input,
    )
  },

  decidePayoutMethod(payoutMethodId: string, input: AdminViewPayoutMethodDecisionInput) {
    return api.post<AdminViewPayoutMethodDecisionResponse>(
      `/admin/payout-methods/${encodeURIComponent(payoutMethodId)}/decision`,
      input,
    )
  },

  listWithdrawalRequests(params: {
    assignment?: 'all' | 'mine' | 'unassigned'
    status?: 'pending' | 'processing' | 'paid' | 'rejected' | 'failed' | 'all'
    limit?: number
    cursor?: string
    query?: string
  } = {}) {
    const searchParams = new URLSearchParams()
    if (params.assignment) searchParams.set('assignment', params.assignment)
    if (params.status) searchParams.set('status', params.status)
    if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
    if (params.cursor) searchParams.set('cursor', params.cursor)
    if (params.query) searchParams.set('query', params.query)
    const query = searchParams.toString()
    return api.get<AdminViewWithdrawalRequestListResponse>(`/admin/withdrawal-requests${query ? `?${query}` : ''}`)
  },

  getWithdrawalRequest(withdrawalRequestId: string) {
    return api.get<AdminViewWithdrawalRequestDetailResponse>(
      `/admin/withdrawal-requests/${encodeURIComponent(withdrawalRequestId)}`,
    )
  },

  accessWithdrawalSensitive(withdrawalRequestId: string, input: AdminViewSensitivePayoutAccessInput) {
    return api.post<AdminViewSensitivePayoutAccessResponse>(
      `/admin/withdrawal-requests/${encodeURIComponent(withdrawalRequestId)}/sensitive-access`,
      input,
    )
  },

  claimWithdrawalRequest(withdrawalRequestId: string, input: AdminViewWithdrawalRequestClaimInput) {
    return api.post<AdminViewWithdrawalRequestClaimResponse>(
      `/admin/withdrawal-requests/${encodeURIComponent(withdrawalRequestId)}/claim`,
      input,
    )
  },

  releaseWithdrawalRequest(withdrawalRequestId: string, input: AdminViewWithdrawalRequestReleaseInput) {
    return api.post<AdminViewWithdrawalRequestReleaseResponse>(
      `/admin/withdrawal-requests/${encodeURIComponent(withdrawalRequestId)}/release`,
      input,
    )
  },

  resolveWithdrawalRequest(withdrawalRequestId: string, input: AdminViewWithdrawalRequestResolveInput) {
    return api.post<AdminViewWithdrawalRequestResolveResponse>(
      `/admin/withdrawal-requests/${encodeURIComponent(withdrawalRequestId)}/resolve`,
      input,
    )
  },

  listSubAdmins(input: AdminViewSubAdminListInput = {}) {
    const searchParams = new URLSearchParams()
    if (input.limit !== undefined) searchParams.set('limit', String(input.limit))
    if (input.cursor) searchParams.set('cursor', input.cursor)
    const query = searchParams.toString()
    return api.get<AdminViewSubAdminListResponse>(`/admin/sub-admins${query ? `?${query}` : ''}`)
  },

  provisionOperator(input: AdminViewOperatorProvisionInput) {
    return api.post<AdminViewOperatorProvisionResponse>('/admin/sub-admins/provision', input)
  },

  resetPendingOperatorPassword(provisioningId: string, initialPassword: string) {
    return api.post<AdminViewOperatorResetPasswordResponse>(
      `/admin/sub-admins/provision/${encodeURIComponent(provisioningId)}/reset-password`,
      { initial_password: initialPassword },
    )
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
