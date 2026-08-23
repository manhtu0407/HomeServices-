import { api } from '../api'
import type {
  AdminFinanceBalanceSnapshotInput,
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
  AdminViewAiCostListResponse,
  AdminViewActor,
  AdminViewDisputeListResponse,
  AdminViewGovernanceListInput,
  AdminViewLearningRuleListResponse,
  AdminViewManagerNominationCancellationResponse,
  AdminViewManagerNominationResponse,
  AdminViewOperationsResponse,
  AdminViewOperatorProvisionInput,
  AdminViewOperatorProvisionResponse,
  AdminViewOperatorResetPasswordResponse,
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
  AdminViewWorkerProfileDecisionInput,
  AdminViewWorkerProfileDecisionResponse,
  AdminViewWorkerReviewDetail,
  AdminViewWorkerReviewStage,
  AdminWorkerFinanceSnapshotResponse,
  AdminPaymentReconciliationDecisionInput,
  AdminPaymentReconciliationDecisionResponse,
  AdminPaymentReconciliationListResponse,
  AdminPaymentReconciliationStatus,
} from '../api-types/admin'

export type AdminGovernanceActionInput = { expected_revision: number; reason: string }
export type AdminGovernanceCapabilities = { read: boolean; draft: boolean; approve: boolean; publish: boolean }
export type AdminPolicyEvidenceRequirements = {
  minimum_source_count: number
  minimum_high_trust_source_count: number
  requires_active_baseline: boolean
}
export type AdminIntakePolicy = {
  id: string
  service_problem_id: string
  service_type: string
  problem_slug: string
  version: number
  status: 'draft' | 'approved' | 'active' | 'retired'
  quote_mode: 'kael_auto_quote' | 'rfq' | 'inspection_only' | 'blocked'
  tier_a_fields: string[]
  tier_b_slots: { key: string; enabled: boolean; required_for_quote: boolean }[]
  question_overrides: Record<string, { vi: string; en: string }>
  safety_requirements: string[]
  capability_requirements: string[]
  evidence_requirements: AdminPolicyEvidenceRequirements
  service_intake_policy_heads: { revision: number; active_version: number | null }
}
export type AdminIntakePolicyListResponse = { capabilities: AdminGovernanceCapabilities; policies: AdminIntakePolicy[] }
export type AdminIntakePolicyPreview = {
  policy_id: string
  service_type: string
  problem_slug: string
  version: number
  revision: number
  quote_mode: AdminIntakePolicy['quote_mode']
  missing_tier_a: string[]
  missing_tier_b: string[]
  order_eligible: boolean
  quote_eligible: boolean
  safety_requirements: string[]
  capability_requirements: string[]
  evidence_requirements: AdminPolicyEvidenceRequirements
}
export type AdminIntakePolicyDraftInput = Omit<AdminIntakePolicy, 'id' | 'service_problem_id' | 'service_type' | 'problem_slug' | 'version' | 'status' | 'service_intake_policy_heads'> & {
  expected_revision: number
  problem_id: string
  reason: string
}
export type AdminPriceBaselineVersion = {
  id: string
  service_problem_id: string
  service_type: string
  district_code: string
  complexity: 'small' | 'medium' | 'large'
  version: number
  status: AdminIntakePolicy['status']
  price_min: number
  price_max: number
  source: string
  price_evidence: Record<string, unknown>
  price_baseline_governance_heads: { revision: number; active_version: number | null }
}
export type AdminPriceBaselineVersionListResponse = {
  baselines: AdminPriceBaselineVersion[]
  capabilities: AdminGovernanceCapabilities
  evidence_quorum: { minimum_distinct_domains: number; schema_version: string }
}
export type AdminPriceBaselineDraftInput = {
  problem_id: string
  district_code: string
  complexity: AdminPriceBaselineVersion['complexity']
  expected_revision: number
  price_min: number
  price_max: number
  source: string
  price_evidence: Record<string, unknown>
  reason: string
}

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

export const adminControlService = {
  getActor() {
    return api.get<AdminViewActor>('/admin/actor')
  },

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

  listIntakePolicies() {
    return api.get<AdminIntakePolicyListResponse>('/admin/governance/intake-policies')
  },

  previewIntakePolicy(input: { problem_id: string; version?: number; provided_fields: string[]; provided_slots: string[] }) {
    return api.post<AdminIntakePolicyPreview>('/admin/governance/intake-policies/preview', input)
  },

  createIntakePolicyDraft(input: AdminIntakePolicyDraftInput) {
    return api.post<AdminIntakePolicy>('/admin/governance/intake-policies/drafts', input)
  },

  transitionIntakePolicy(policyId: string, action: 'approve' | 'publish' | 'rollback', input: AdminGovernanceActionInput) {
    return api.post<AdminIntakePolicy>(`/admin/governance/intake-policies/${encodeURIComponent(policyId)}/${action}`, input)
  },

  listPriceBaselineVersions() {
    return api.get<AdminPriceBaselineVersionListResponse>('/admin/governance/price-baseline-versions')
  },

  createPriceBaselineDraft(input: AdminPriceBaselineDraftInput) {
    return api.post<AdminPriceBaselineVersion>('/admin/governance/price-baseline-versions/drafts', input)
  },

  transitionPriceBaseline(versionId: string, action: 'approve' | 'publish' | 'rollback', input: AdminGovernanceActionInput) {
    return api.post<AdminPriceBaselineVersion>(`/admin/governance/price-baseline-versions/${encodeURIComponent(versionId)}/${action}`, input)
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

  getFinanceOverview(params: AdminFinancePeriodInput = { range: 'month' }) {
    return api.get<AdminFinanceOverviewResponse>(adminFinancePath('/admin/finance/overview', params))
  },

  listFinanceTransactions(params: AdminFinanceTransactionFilters) {
    return api.get<AdminFinanceTransactionListResponse>(adminFinancePath('/admin/finance/transactions', params))
  },

  exportFinanceCsv(params: AdminFinanceTransactionFilters) {
    return api.get<AdminFinanceCsvExportResponse>(adminFinancePath('/admin/finance/export.csv', params))
  },

  listFinanceTaxPolicies() {
    return api.get<AdminFinanceTaxPolicyListResponse>('/admin/finance/tax-policies')
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
