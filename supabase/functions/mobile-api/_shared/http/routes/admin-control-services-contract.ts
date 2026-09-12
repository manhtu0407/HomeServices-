import type { MobileApiContext } from "../contracts.ts";
import type {
  AdminActor,
  AdminOverviewDetailsInput,
  AdminOverviewDetailsResponse,
  AdminEvidenceAccessInput,
  AdminEvidenceAccessResponse,
  AdminOperationsResponse,
  AdminScopeChangeDetailResponse,
  AdminScopeChangeListInput,
  AdminScopeChangeListResponse,
  AdminSupportCaseDetailResponse,
  AdminSupportCaseListInput,
  AdminSupportCaseListResponse,
  AdminSupportCaseSource,
  AdminSupportPreparation,
  AdminSupportPreparationInput,
  AdminAiCostListResponse,
  AdminDisputeListResponse,
  AdminGovernanceListInput,
  AdminLearningRuleListResponse,
  AdminManagerNominationCancellationResponse,
  AdminManagerNominationResponse,
  AdminPriceBaselineListResponse,
  AdminServiceTaxonomyResponse,
  AdminSubAdminAccessInput,
  AdminSubAdminAccessResponse,
  AdminSubAdminAccountSearchInput,
  AdminSubAdminAccountSearchResponse,
  AdminSubAdminListInput,
  AdminSubAdminListResponse,
  AdminTransactionDetailResponse,
  AdminTransactionListInput,
  AdminTransactionListResponse,
  AdminWorkerAccessInput,
  AdminWorkerAccessResponse,
  AdminWorkerApplicationDecisionInput,
  AdminWorkerApplicationDecisionResponse,
  AdminWorkerApplicationListInput,
  AdminWorkerApplicationListResponse,
  AdminWorkerApplicationSummary,
  AdminWorkerReviewDetail,
  AdminWorkerProfileDecisionInput,
  AdminWorkerProfileDecisionResponse,
  AdminWorkflowRecoveryActionInput,
  AdminWorkflowRecoveryActionResponse,
  AdminWorkflowRecoveryDetailResponse,
  AdminWorkflowRecoveryListInput,
  AdminWorkflowRecoveryListResponse,
  EdgeAdminOperatorProvisionInput,
  AdminOperatorProvisionResponse,
  EdgeAdminOperatorResetPasswordInput,
  AdminOperatorResetPasswordResponse,
} from "../../domains/contracts/admin-control.ts";
import type {
  AdminPayoutMethodDecisionInput,
  AdminPayoutMethodDecisionResponse,
  AdminPayoutMethodDetailResponse,
  AdminPayoutMethodListInput,
  AdminPayoutMethodListResponse,
  AdminSensitivePayoutAccessInput,
  AdminSensitivePayoutAccessResponse,
  AdminWithdrawalRequestClaimInput,
  AdminWithdrawalRequestClaimResponse,
  AdminWithdrawalRequestDetailResponse,
  AdminWithdrawalRequestListInput,
  AdminWithdrawalRequestListResponse,
  AdminWithdrawalRequestResolveInput,
  AdminWithdrawalRequestResolveResponse,
  AdminWithdrawalRequestReleaseInput,
  AdminWithdrawalRequestReleaseResponse,
} from "../../domains/contracts/admin-payout.ts";
import type { AdminFinanceContracts } from "../../domains/contracts/admin-finance.ts";
import type { AdminSystemContracts } from "../../domains/contracts/admin-system.ts";

type AdminFinanceRange = AdminFinanceContracts["range"];
type AdminPaymentReconciliationListInput = AdminFinanceContracts["paymentReconciliationListInput"];
type AdminPaymentReconciliationDecisionInput = AdminFinanceContracts["paymentReconciliationDecisionInput"];
type AdminPaymentReconciliationDetailResponse = AdminFinanceContracts["paymentReconciliationDetailResponse"];
type AdminPaymentReconciliationClaimInput = AdminFinanceContracts["paymentReconciliationClaimInput"];
type AdminPaymentReconciliationReleaseInput = AdminFinanceContracts["paymentReconciliationReleaseInput"];
type AdminPaymentReconciliationAssignmentResponse = AdminFinanceContracts["paymentReconciliationAssignmentResponse"];
type AdminPaymentReconciliationListResponse = AdminFinanceContracts["paymentReconciliationListResponse"];
type AdminPaymentReconciliationDecisionResponse = AdminFinanceContracts["paymentReconciliationDecisionResponse"];
type AdminFinanceSummaryResponse = AdminFinanceContracts["financeSummaryResponse"];
type AdminFinanceBalanceSnapshotInput = AdminFinanceContracts["financeBalanceSnapshotInput"];
type AdminFinanceBalanceSnapshotResponse = AdminFinanceContracts["financeBalanceSnapshotResponse"];
type AdminWorkerFinanceSnapshotInput = AdminFinanceContracts["workerFinanceSnapshotInput"];
type AdminWorkerFinanceSnapshotResponse = AdminFinanceContracts["workerFinanceSnapshotResponse"];

export type AdminControlServices = {
  getAdminActor(ctx: MobileApiContext): Promise<AdminActor>;
  getAdminOperations(ctx: MobileApiContext): Promise<AdminOperationsResponse>;
  getAdminOverviewDetails(
    ctx: MobileApiContext,
    input: AdminOverviewDetailsInput,
  ): Promise<AdminOverviewDetailsResponse>;
  listAdminScopeChanges(
    ctx: MobileApiContext,
    input: AdminScopeChangeListInput,
  ): Promise<AdminScopeChangeListResponse>;
  getAdminScopeChange(
    ctx: MobileApiContext,
    scopeChangeId: string,
  ): Promise<AdminScopeChangeDetailResponse>;
  createAdminScopeEvidenceAccess(
    ctx: MobileApiContext,
    scopeChangeId: string,
    input: AdminEvidenceAccessInput,
  ): Promise<AdminEvidenceAccessResponse>;
  listAdminSupportCases(
    ctx: MobileApiContext,
    input: AdminSupportCaseListInput,
  ): Promise<AdminSupportCaseListResponse>;
  getAdminSupportCase(
    ctx: MobileApiContext,
    source: AdminSupportCaseSource,
    caseId: string,
  ): Promise<AdminSupportCaseDetailResponse>;
  updateAdminSupportCasePreparation(
    ctx: MobileApiContext,
    source: AdminSupportCaseSource,
    caseId: string,
    input: AdminSupportPreparationInput,
  ): Promise<AdminSupportPreparation>;
  createAdminSupportEvidenceAccess(
    ctx: MobileApiContext,
    source: AdminSupportCaseSource,
    caseId: string,
    input: AdminEvidenceAccessInput,
  ): Promise<AdminEvidenceAccessResponse>;
  listAdminWorkflowRecoveryCases(
    ctx: MobileApiContext,
    input: AdminWorkflowRecoveryListInput,
  ): Promise<AdminWorkflowRecoveryListResponse>;
  getAdminWorkflowRecoveryCase(
    ctx: MobileApiContext,
    recoveryCaseId: string,
  ): Promise<AdminWorkflowRecoveryDetailResponse>;
  applyAdminWorkflowRecoveryAction(
    ctx: MobileApiContext,
    recoveryCaseId: string,
    input: AdminWorkflowRecoveryActionInput,
  ): Promise<AdminWorkflowRecoveryActionResponse>;
  listAdminDisputes(ctx: MobileApiContext, input: AdminGovernanceListInput): Promise<AdminDisputeListResponse>;
  listAdminPriceBaselines(ctx: MobileApiContext, input: AdminGovernanceListInput): Promise<AdminPriceBaselineListResponse>;
  listAdminAiCosts(ctx: MobileApiContext, input: AdminGovernanceListInput): Promise<AdminAiCostListResponse>;
  listAdminLearningRules(ctx: MobileApiContext, input: AdminGovernanceListInput): Promise<AdminLearningRuleListResponse>;
  listAdminServiceTaxonomy(ctx: MobileApiContext): Promise<AdminServiceTaxonomyResponse>;
  listAdminSystemPriceBaselines(ctx: MobileApiContext, input: AdminSystemContracts["priceListInput"]): Promise<AdminSystemContracts["priceListResponse"]>;
  getAdminSystemPriceBaseline(ctx: MobileApiContext, baselineId: string): Promise<AdminSystemContracts["priceDetailResponse"]>;
  listAdminSystemEvidencePackages(ctx: MobileApiContext, input: AdminSystemContracts["priceListInput"]): Promise<{ generated_at: string; records: AdminSystemContracts["evidencePackage"][] }>;
  validateAdminSystemPriceBaseline(ctx: MobileApiContext, input: AdminSystemContracts["priceMutationInput"]): Promise<AdminSystemContracts["priceValidationResponse"]>;
  publishAdminSystemPriceBaseline(ctx: MobileApiContext, input: AdminSystemContracts["priceMutationInput"]): Promise<AdminSystemContracts["receipt"]>;
  retireAdminSystemPriceBaseline(ctx: MobileApiContext, baselineId: string, input: AdminSystemContracts["mutationInput"]): Promise<AdminSystemContracts["receipt"]>;
  listAdminSystemTaxonomy(ctx: MobileApiContext, input: AdminSystemContracts["taxonomyListInput"]): Promise<AdminSystemContracts["taxonomyListResponse"]>;
  getAdminSystemTaxonomy(ctx: MobileApiContext, serviceType: string): Promise<AdminSystemContracts["taxonomyDetailResponse"]>;
  validateAdminSystemTaxonomy(ctx: MobileApiContext, serviceType: string, input: AdminSystemContracts["taxonomyMutationInput"]): Promise<AdminSystemContracts["taxonomyValidationResponse"]>;
  updateAdminSystemTaxonomy(ctx: MobileApiContext, serviceType: string, input: AdminSystemContracts["taxonomyMutationInput"]): Promise<AdminSystemContracts["receipt"]>;
  listAdminSystemLearningRules(ctx: MobileApiContext, input: AdminSystemContracts["learningListInput"]): Promise<AdminSystemContracts["learningListResponse"]>;
  getAdminSystemLearningRule(ctx: MobileApiContext, ruleId: string): Promise<AdminSystemContracts["learningDetailResponse"]>;
  previewAdminSystemLearningAction(ctx: MobileApiContext, ruleId: string, action: "rollback" | "revoke", input: AdminSystemContracts["learningActionInput"]): Promise<AdminSystemContracts["learningPreviewResponse"]>;
  applyAdminSystemLearningAction(ctx: MobileApiContext, ruleId: string, action: "rollback" | "revoke", input: AdminSystemContracts["learningActionInput"]): Promise<AdminSystemContracts["receipt"]>;
  listAdminSystemModelHealth(ctx: MobileApiContext, input: AdminSystemContracts["modelHealthInput"]): Promise<AdminSystemContracts["modelHealthResponse"]>;
  getAdminSystemModelHealthDetail(ctx: MobileApiContext, detailKey: string): Promise<AdminSystemContracts["modelHealthDetailResponse"]>;
  listAdminWorkerApplications(
    ctx: MobileApiContext,
    input: AdminWorkerApplicationListInput,
  ): Promise<AdminWorkerApplicationListResponse>;
  getAdminWorkerApplication(
    ctx: MobileApiContext,
    applicationId: string,
  ): Promise<AdminWorkerApplicationSummary>;
  getAdminWorkerReviewDetail(
    ctx: MobileApiContext,
    applicationId: string,
  ): Promise<AdminWorkerReviewDetail>;
  decideAdminWorkerProfile(
    ctx: MobileApiContext,
    applicationId: string,
    input: AdminWorkerProfileDecisionInput,
  ): Promise<AdminWorkerProfileDecisionResponse>;
  decideAdminWorkerApplication(
    ctx: MobileApiContext,
    applicationId: string,
    input: AdminWorkerApplicationDecisionInput,
  ): Promise<AdminWorkerApplicationDecisionResponse>;
  setAdminWorkerAccess(
    ctx: MobileApiContext,
    workerId: string,
    input: AdminWorkerAccessInput,
  ): Promise<AdminWorkerAccessResponse>;
  getAdminWorkerFinanceSnapshot(
    ctx: MobileApiContext,
    workerId: string,
    input: AdminWorkerFinanceSnapshotInput,
  ): Promise<AdminWorkerFinanceSnapshotResponse>;
  listAdminTransactions(
    ctx: MobileApiContext,
    input: AdminTransactionListInput,
  ): Promise<AdminTransactionListResponse>;
  getAdminTransaction(
    ctx: MobileApiContext,
    jobId: string,
  ): Promise<AdminTransactionDetailResponse>;
  listAdminPayoutMethods(
    ctx: MobileApiContext,
    input: AdminPayoutMethodListInput,
  ): Promise<AdminPayoutMethodListResponse>;
  getAdminPayoutMethod(
    ctx: MobileApiContext,
    payoutMethodId: string,
  ): Promise<AdminPayoutMethodDetailResponse>;
  createAdminPayoutMethodSensitiveAccess(
    ctx: MobileApiContext,
    payoutMethodId: string,
    input: AdminSensitivePayoutAccessInput,
  ): Promise<AdminSensitivePayoutAccessResponse>;
  decideAdminPayoutMethod(
    ctx: MobileApiContext,
    payoutMethodId: string,
    input: AdminPayoutMethodDecisionInput,
  ): Promise<AdminPayoutMethodDecisionResponse>;
  listAdminWithdrawalRequests(
    ctx: MobileApiContext,
    input: AdminWithdrawalRequestListInput,
  ): Promise<AdminWithdrawalRequestListResponse>;
  getAdminWithdrawalRequest(
    ctx: MobileApiContext,
    withdrawalRequestId: string,
  ): Promise<AdminWithdrawalRequestDetailResponse>;
  createAdminWithdrawalSensitiveAccess(
    ctx: MobileApiContext,
    withdrawalRequestId: string,
    input: AdminSensitivePayoutAccessInput,
  ): Promise<AdminSensitivePayoutAccessResponse>;
  claimAdminWithdrawalRequest(
    ctx: MobileApiContext,
    withdrawalRequestId: string,
    input: AdminWithdrawalRequestClaimInput,
  ): Promise<AdminWithdrawalRequestClaimResponse>;
  releaseAdminWithdrawalRequest(
    ctx: MobileApiContext,
    withdrawalRequestId: string,
    input: AdminWithdrawalRequestReleaseInput,
  ): Promise<AdminWithdrawalRequestReleaseResponse>;
  resolveAdminWithdrawalRequest(
    ctx: MobileApiContext,
    withdrawalRequestId: string,
    input: AdminWithdrawalRequestResolveInput,
  ): Promise<AdminWithdrawalRequestResolveResponse>;
  listAdminPaymentReconciliations(
    ctx: MobileApiContext,
    input: AdminPaymentReconciliationListInput,
  ): Promise<AdminPaymentReconciliationListResponse>;
  getAdminPaymentReconciliation(
    ctx: MobileApiContext,
    paymentOrderId: string,
  ): Promise<AdminPaymentReconciliationDetailResponse>;
  claimAdminPaymentReconciliation(
    ctx: MobileApiContext,
    paymentOrderId: string,
    input: AdminPaymentReconciliationClaimInput,
  ): Promise<AdminPaymentReconciliationAssignmentResponse>;
  releaseAdminPaymentReconciliation(
    ctx: MobileApiContext,
    paymentOrderId: string,
    input: AdminPaymentReconciliationReleaseInput,
  ): Promise<AdminPaymentReconciliationAssignmentResponse>;
  decideAdminPaymentReconciliation(
    ctx: MobileApiContext,
    paymentOrderId: string,
    input: AdminPaymentReconciliationDecisionInput,
  ): Promise<AdminPaymentReconciliationDecisionResponse>;
  getAdminFinanceSummary(
    ctx: MobileApiContext,
    input: { anchor?: string; range: AdminFinanceRange },
  ): Promise<AdminFinanceSummaryResponse>;
  recordAdminFinanceBalanceSnapshot(
    ctx: MobileApiContext,
    input: AdminFinanceBalanceSnapshotInput,
  ): Promise<AdminFinanceBalanceSnapshotResponse>;
  listAdminSubAdmins(ctx: MobileApiContext, input: AdminSubAdminListInput): Promise<AdminSubAdminListResponse>;
  provisionAdminOperator(
    ctx: MobileApiContext,
    input: EdgeAdminOperatorProvisionInput,
  ): Promise<AdminOperatorProvisionResponse>;
  resetPendingAdminOperatorPassword(
    ctx: MobileApiContext,
    provisioningId: string,
    input: EdgeAdminOperatorResetPasswordInput,
  ): Promise<AdminOperatorResetPasswordResponse>;
  searchAdminSubAdminAccounts(
    ctx: MobileApiContext,
    input: AdminSubAdminAccountSearchInput,
  ): Promise<AdminSubAdminAccountSearchResponse>;
  nominateAdminManager(
    ctx: MobileApiContext,
    userId: string,
  ): Promise<AdminManagerNominationResponse>;
  cancelAdminManagerNomination(
    ctx: MobileApiContext,
    nominationId: string,
  ): Promise<AdminManagerNominationCancellationResponse>;
  setAdminSubAdminAccess(
    ctx: MobileApiContext,
    userId: string,
    input: AdminSubAdminAccessInput,
  ): Promise<AdminSubAdminAccessResponse>;
};
