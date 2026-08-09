import type { MobileApiContext } from "../contracts.ts";
import type {
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

export type AdminControlServices = {
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
  listAdminSubAdmins(ctx: MobileApiContext): Promise<AdminSubAdminListResponse>;
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
