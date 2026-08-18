import type { MobileApiContext } from "../contracts.ts";
import type {
  AdminActor,
  AdminOperationsResponse,
  AdminAiCostListResponse,
  AdminDisputeListResponse,
  AdminGovernanceListInput,
  AdminLearningRuleListResponse,
  AdminManagerNominationCancellationResponse,
  AdminManagerNominationResponse,
  AdminPriceBaselineListResponse,
  AdminSubAdminAccessInput,
  AdminSubAdminAccessResponse,
  AdminSubAdminAccountSearchInput,
  AdminSubAdminAccountSearchResponse,
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
  AdminWithdrawalRequestClaimResponse,
  AdminWithdrawalRequestDetailResponse,
  AdminWithdrawalRequestListInput,
  AdminWithdrawalRequestListResponse,
  AdminWithdrawalRequestResolveInput,
  AdminWithdrawalRequestResolveResponse,
} from "../../domains/contracts/admin-payout.ts";
import type { AdminFinanceContracts } from "../../domains/contracts/admin-finance.ts";

type AdminFinanceRange = AdminFinanceContracts["range"];
type AdminPaymentReconciliationListInput = AdminFinanceContracts["paymentReconciliationListInput"];
type AdminPaymentReconciliationDecisionInput = AdminFinanceContracts["paymentReconciliationDecisionInput"];
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
  listAdminDisputes(ctx: MobileApiContext, input: AdminGovernanceListInput): Promise<AdminDisputeListResponse>;
  listAdminPriceBaselines(ctx: MobileApiContext, input: AdminGovernanceListInput): Promise<AdminPriceBaselineListResponse>;
  listAdminAiCosts(ctx: MobileApiContext, input: AdminGovernanceListInput): Promise<AdminAiCostListResponse>;
  listAdminLearningRules(ctx: MobileApiContext, input: AdminGovernanceListInput): Promise<AdminLearningRuleListResponse>;
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
  claimAdminWithdrawalRequest(
    ctx: MobileApiContext,
    withdrawalRequestId: string,
  ): Promise<AdminWithdrawalRequestClaimResponse>;
  resolveAdminWithdrawalRequest(
    ctx: MobileApiContext,
    withdrawalRequestId: string,
    input: AdminWithdrawalRequestResolveInput,
  ): Promise<AdminWithdrawalRequestResolveResponse>;
  listAdminPaymentReconciliations(
    ctx: MobileApiContext,
    input: AdminPaymentReconciliationListInput,
  ): Promise<AdminPaymentReconciliationListResponse>;
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
  listAdminSubAdmins(ctx: MobileApiContext): Promise<AdminSubAdminListResponse>;
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
