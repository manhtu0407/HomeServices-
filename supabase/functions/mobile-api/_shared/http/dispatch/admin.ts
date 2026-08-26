import { priceSynthesisAbCaseSchema } from "../../platform/kael-contracts.ts";
import {
  adminOperatorProvisionSchema,
  adminOperatorResetPasswordSchema,
} from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { readJson } from "../read-json.ts";
import {
  adminEvidenceAccessSchema,
  adminSubAdminAccessSchema,
  adminSupportPreparationSchema,
  adminWorkerAccessSchema,
  adminWorkerApplicationDecisionSchema,
  adminWorkerProfileDecisionSchema,
  parseAdminGovernanceListQuery,
  parseAdminOverviewDetailsQuery,
  parseAdminScopeChangeListQuery,
  parseAdminSupportCaseListQuery,
  parseAdminSubAdminAccountSearchQuery,
  parseAdminSubAdminListQuery,
  parseAdminTransactionListQuery,
  parseAdminWorkerApplicationListQuery,
} from "../routes/admin-control-contract.ts";
import {
  adminSystemLearningActionSchema,
  adminSystemMutationSchema,
  adminSystemPricePublishSchema,
  adminSystemPriceValidateSchema,
  adminSystemTaxonomyValidateSchema,
  parseAdminSystemLearningListQuery,
  parseAdminSystemModelHealthQuery,
  parseAdminSystemPriceListQuery,
  parseAdminSystemTaxonomyListQuery,
} from "../routes/admin-system-contract.ts";
import {
  adminPayoutMethodDecisionSchema,
  adminPayoutSensitiveAccessSchema,
  adminWithdrawalRequestClaimSchema,
  adminWithdrawalRequestReleaseSchema,
  adminWithdrawalRequestResolveSchema,
  parseAdminPayoutMethodListQuery,
  parseAdminWithdrawalRequestListQuery,
} from "../routes/admin-payout-contract.ts";
import {
  adminFinanceTaxPolicyApproveSchema,
  adminFinanceTaxPolicyDraftSchema,
  adminFinanceTaxPolicyRetireSchema,
  adminFinanceBalanceSnapshotSchema,
  adminPaymentReconciliationDecisionSchema,
  adminPaymentReconciliationClaimSchema,
  adminPaymentReconciliationReleaseSchema,
  parseAdminFinanceExportQuery,
  parseAdminFinanceOverviewQuery,
  parseAdminFinanceSummaryQuery,
  parseAdminFinanceTransactionListQuery,
  parseAdminWorkerFinanceSnapshotQuery,
  parseAdminPaymentReconciliationListQuery,
} from "../routes/admin-finance-contract.ts";
import {
  approveAdminFinanceTaxPolicy,
  createAdminFinanceTaxPolicyDraft,
  exportAdminFinanceCsv,
  getAdminFinanceOverview,
  getAdminFinanceTaxPolicy,
  getAdminFinanceTransaction,
  listAdminFinanceBalanceSnapshots,
  listAdminFinanceTaxPolicies,
  listAdminFinanceTransactions,
  retireAdminFinanceTaxPolicy,
  updateAdminFinanceTaxPolicyDraft,
} from "../../domains/admin/finance.ts";
import {
  kaelBatchResultsProcessInput,
  kaelLearningCandidateListInput,
  kaelLearningCandidateReviewInput,
  kaelLearningMonitorInput,
  kaelLearningQueueProcessInput,
  marketCacheInvalidateInput,
} from "../dto/admin.ts";
import type { MobileApiContext, MobileApiServices } from "../contracts.ts";
import {
  listKaelAdminQueue,
  parseKaelAdminQueueListInput,
  parseKaelAdminQueueResolveInput,
  resolveKaelAdminQueue,
} from "../../domains/admin/queue.ts";
import { getKaelModelHealth } from "../../domains/admin/model-health.ts";
import { listKaelEstimateAccuracy, parseKaelEstimateAccuracyInput } from "../../domains/admin/estimate-accuracy.ts";
import { assertNever, type AdminDispatchRoute } from "./kinds.ts";

type AdminControlDispatchRoute = Extract<
  AdminDispatchRoute,
  {
    kind:
      | "admin.actor.get"
      | "admin.operations.get"
      | "admin.overview.details"
      | `admin.operations.scopeChanges.${string}`
      | `admin.operations.supportCases.${string}`
      | `admin.governance.${string}`
      | `admin.system.${string}`
      | `admin.workerApplications.${string}`
      | `admin.workers.${string}`
      | `admin.transactions.${string}`
      | `admin.paymentReconciliations.${string}`
      | `admin.finance.${string}`
      | `admin.payoutMethods.${string}`
      | `admin.withdrawalRequests.${string}`
      | `admin.subAdmins.${string}`
      | `admin.managerNominations.${string}`;
  }
>;
type AdminWorkerTeamUpgradeRoute = Extract<AdminControlDispatchRoute, {
  kind:
    | "admin.workerApplications.reviewDetail"
    | "admin.workerApplications.profileDecision"
    | "admin.subAdmins.provision"
    | "admin.subAdmins.resetPassword";
}>;

function isAdminControlRoute(route: AdminDispatchRoute): route is AdminControlDispatchRoute {
  return route.kind === "admin.actor.get"
    || route.kind === "admin.operations.get"
    || route.kind === "admin.overview.details"
    || route.kind.startsWith("admin.operations.scopeChanges.")
    || route.kind.startsWith("admin.operations.supportCases.")
    || route.kind.startsWith("admin.governance.")
    || route.kind.startsWith("admin.system.")
    || route.kind.startsWith("admin.workerApplications.")
    || route.kind.startsWith("admin.workers.")
    || route.kind.startsWith("admin.transactions.")
    || route.kind.startsWith("admin.paymentReconciliations.")
    || route.kind.startsWith("admin.finance.")
    || route.kind.startsWith("admin.payoutMethods.")
    || route.kind.startsWith("admin.withdrawalRequests.")
    || route.kind.startsWith("admin.subAdmins.")
    || route.kind.startsWith("admin.managerNominations.");
}

export async function dispatchAdminRoute(
  route: AdminDispatchRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  if (isAdminControlRoute(route)) {
    return dispatchAdminControlRoute(route, request, ctx, services);
  }

  switch (route.kind) {
    case "admin.marketCache.invalidate":
      return services.invalidateMarketCache(ctx, marketCacheInvalidateInput(await readJson(request)));
    case "admin.kaelAb.priceSynthesis": {
      const input = priceSynthesisAbCaseSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu A/B không hợp lệ", 400);
      return services.evaluatePriceSynthesisAbCase(ctx, input.data);
    }
    case "admin.kaelLearning.processQueue":
      return services.processKaelLearningQueue(ctx, kaelLearningQueueProcessInput(await readJson(request)));
    case "admin.kaelLearning.processBatchResults":
      return services.processKaelBatchResults(ctx, kaelBatchResultsProcessInput(await readJson(request)));
    case "admin.kaelLearning.monitorRules":
      return services.monitorKaelLearningRules(ctx, kaelLearningMonitorInput(await readJson(request)));
    case "admin.kaelLearning.candidates.list":
      return services.listKaelLearningCandidates(ctx, kaelLearningCandidateListInput(new URL(request.url)));
    case "admin.kaelLearning.candidates.approve":
      return services.approveKaelLearningCandidate(ctx, route.candidateId, kaelLearningCandidateReviewInput(await readJson(request), "approve"));
    case "admin.kaelLearning.candidates.reject":
      return services.rejectKaelLearningCandidate(ctx, route.candidateId, kaelLearningCandidateReviewInput(await readJson(request), "reject"));
    case "admin.kaelModelHealth.get":
      return getKaelModelHealth(ctx);
    case "admin.kaelEstimateAccuracy.list":
      return listKaelEstimateAccuracy(ctx, parseKaelEstimateAccuracyInput(new URL(request.url)));
    case "admin.kaelQueue.list":
      return listKaelAdminQueue(ctx, parseKaelAdminQueueListInput(new URL(request.url)));
    case "admin.kaelQueue.resolve":
      return resolveKaelAdminQueue(ctx, route.queueId, parseKaelAdminQueueResolveInput(await readJson(request)));
  }
  return assertNever(route);
}

async function dispatchAdminControlRoute(
  route: AdminControlDispatchRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  if (isAdminWorkerTeamUpgradeRoute(route)) {
    return dispatchAdminWorkerTeamUpgrade(route, request, ctx, services);
  }
  switch (route.kind) {
    case "admin.actor.get":
      return services.getAdminActor(ctx);
    case "admin.operations.get":
      return services.getAdminOperations(ctx);
    case "admin.overview.details": {
      const input = parseAdminOverviewDetailsQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc chi tiết Tổng quan không hợp lệ", 400);
      return services.getAdminOverviewDetails(ctx, input.data);
    }
    case "admin.operations.scopeChanges.list": {
      const input = parseAdminScopeChangeListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc đổi phạm vi không hợp lệ", 400);
      return services.listAdminScopeChanges(ctx, input.data);
    }
    case "admin.operations.scopeChanges.detail":
      return services.getAdminScopeChange(ctx, route.scopeChangeId);
    case "admin.operations.scopeChanges.evidenceAccess": {
      const input = adminEvidenceAccessSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu mở evidence không hợp lệ", 400);
      return services.createAdminScopeEvidenceAccess(ctx, route.scopeChangeId, input.data);
    }
    case "admin.operations.supportCases.list": {
      const input = parseAdminSupportCaseListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc ca hỗ trợ không hợp lệ", 400);
      return services.listAdminSupportCases(ctx, input.data);
    }
    case "admin.operations.supportCases.detail":
      return services.getAdminSupportCase(ctx, route.source, route.caseId);
    case "admin.operations.supportCases.preparation": {
      const input = adminSupportPreparationSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Hồ sơ chuẩn bị không hợp lệ", 400);
      return services.updateAdminSupportCasePreparation(ctx, route.source, route.caseId, input.data);
    }
    case "admin.operations.supportCases.evidenceAccess": {
      const input = adminEvidenceAccessSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu mở evidence không hợp lệ", 400);
      return services.createAdminSupportEvidenceAccess(ctx, route.source, route.caseId, input.data);
    }
    case "admin.governance.disputes":
      return dispatchAdminGovernance(ctx, services.listAdminDisputes, request, "Phân trang tranh chấp không hợp lệ");
    case "admin.governance.priceBaselines":
      return dispatchAdminGovernance(ctx, services.listAdminPriceBaselines, request, "Phân trang nền tảng giá không hợp lệ");
    case "admin.governance.aiCosts":
      return dispatchAdminGovernance(ctx, services.listAdminAiCosts, request, "Phân trang chi phí Kael không hợp lệ");
    case "admin.governance.learningRules":
      return dispatchAdminGovernance(ctx, services.listAdminLearningRules, request, "Phân trang quy tắc học Kael không hợp lệ");
    case "admin.system.priceBaselines.list": {
      const input = parseAdminSystemPriceListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc giá tham chiếu không hợp lệ", 400);
      return services.listAdminSystemPriceBaselines(ctx, input.data);
    }
    case "admin.system.priceBaselines.detail":
      return services.getAdminSystemPriceBaseline(ctx, route.baselineId);
    case "admin.system.priceBaselines.evidencePackages": {
      const input = parseAdminSystemPriceListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc gói bằng chứng giá không hợp lệ", 400);
      return services.listAdminSystemEvidencePackages(ctx, input.data);
    }
    case "admin.system.priceBaselines.validate": {
      const input = adminSystemPriceValidateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu kiểm tra giá không hợp lệ", 400);
      return services.validateAdminSystemPriceBaseline(ctx, input.data);
    }
    case "admin.system.priceBaselines.publish": {
      const input = adminSystemPricePublishSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu xuất bản giá không hợp lệ", 400);
      return services.publishAdminSystemPriceBaseline(ctx, input.data);
    }
    case "admin.system.priceBaselines.retire": {
      const input = adminSystemMutationSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu ngừng giá không hợp lệ", 400);
      return services.retireAdminSystemPriceBaseline(ctx, route.baselineId, input.data);
    }
    case "admin.system.taxonomy.list": {
      const input = parseAdminSystemTaxonomyListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc cấu trúc dịch vụ không hợp lệ", 400);
      return services.listAdminSystemTaxonomy(ctx, input.data);
    }
    case "admin.system.taxonomy.detail":
      return services.getAdminSystemTaxonomy(ctx, route.serviceType);
    case "admin.system.taxonomy.validate": {
      const input = adminSystemTaxonomyValidateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Thay đổi cấu trúc dịch vụ không hợp lệ", 400);
      return services.validateAdminSystemTaxonomy(ctx, route.serviceType, input.data);
    }
    case "admin.system.taxonomy.update": {
      const input = adminSystemTaxonomyValidateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Thay đổi cấu trúc dịch vụ không hợp lệ", 400);
      return services.updateAdminSystemTaxonomy(ctx, route.serviceType, input.data);
    }
    case "admin.system.learningRules.list": {
      const input = parseAdminSystemLearningListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc quy tắc học không hợp lệ", 400);
      return services.listAdminSystemLearningRules(ctx, input.data);
    }
    case "admin.system.learningRules.detail":
      return services.getAdminSystemLearningRule(ctx, route.ruleId);
    case "admin.system.learningRules.rollbackPreview":
    case "admin.system.learningRules.revokePreview": {
      const input = adminSystemLearningActionSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu rà soát quy tắc không hợp lệ", 400);
      return services.previewAdminSystemLearningAction(ctx, route.ruleId, route.kind.endsWith("rollbackPreview") ? "rollback" : "revoke", input.data);
    }
    case "admin.system.learningRules.rollback":
    case "admin.system.learningRules.revoke": {
      const input = adminSystemLearningActionSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu thay đổi quy tắc không hợp lệ", 400);
      return services.applyAdminSystemLearningAction(ctx, route.ruleId, route.kind.endsWith("rollback") ? "rollback" : "revoke", input.data);
    }
    case "admin.system.modelHealth.list": {
      const input = parseAdminSystemModelHealthQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc tình trạng mô hình không hợp lệ", 400);
      return services.listAdminSystemModelHealth(ctx, input.data);
    }
    case "admin.system.modelHealth.detail": {
      const detailKey = new URL(request.url).searchParams.get("key");
      if (!detailKey || !/^[0-9a-f]{64}$/.test(detailKey)) apiFailure("VALIDATION", "Khóa chi tiết mô hình không hợp lệ", 400);
      return services.getAdminSystemModelHealthDetail(ctx, detailKey);
    }
    case "admin.workerApplications.list": {
      const input = parseAdminWorkerApplicationListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc hồ sơ thợ không hợp lệ", 400);
      return services.listAdminWorkerApplications(ctx, input.data);
    }
    case "admin.workerApplications.detail":
      return services.getAdminWorkerApplication(ctx, route.applicationId);
    case "admin.workerApplications.decision": {
      const input = adminWorkerApplicationDecisionSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Quyết định hồ sơ thợ không hợp lệ", 400);
      return services.decideAdminWorkerApplication(ctx, route.applicationId, input.data);
    }
    case "admin.workers.access": {
      const input = adminWorkerAccessSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Thay đổi quyền truy cập của thợ không hợp lệ", 400);
      return services.setAdminWorkerAccess(ctx, route.workerId, input.data);
    }
    case "admin.workers.financeSnapshot": {
      const input = parseAdminWorkerFinanceSnapshotQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Khoảng thời gian tài chính của thợ không hợp lệ", 400);
      return services.getAdminWorkerFinanceSnapshot(ctx, route.workerId, input.data);
    }
    case "admin.transactions.list": {
      const input = parseAdminTransactionListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc giao dịch không hợp lệ", 400);
      return services.listAdminTransactions(ctx, input.data);
    }
    case "admin.transactions.detail":
      return services.getAdminTransaction(ctx, route.jobId);
    case "admin.paymentReconciliations.list": {
      const input = parseAdminPaymentReconciliationListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc đối soát thanh toán không hợp lệ", 400);
      return services.listAdminPaymentReconciliations(ctx, input.data);
    }
    case "admin.paymentReconciliations.detail":
      return services.getAdminPaymentReconciliation(ctx, route.paymentOrderId);
    case "admin.paymentReconciliations.claim": {
      const input = adminPaymentReconciliationClaimSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu nhận xử lý đối soát không hợp lệ", 400);
      return services.claimAdminPaymentReconciliation(ctx, route.paymentOrderId, input.data);
    }
    case "admin.paymentReconciliations.release": {
      const input = adminPaymentReconciliationReleaseSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu bỏ nhận đối soát không hợp lệ", 400);
      return services.releaseAdminPaymentReconciliation(ctx, route.paymentOrderId, input.data);
    }
    case "admin.paymentReconciliations.decision": {
      const input = adminPaymentReconciliationDecisionSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Quyết định đối soát không hợp lệ", 400);
      return services.decideAdminPaymentReconciliation(ctx, route.paymentOrderId, input.data);
    }
    case "admin.finance.summary": {
      const input = parseAdminFinanceSummaryQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Khoảng thời gian tài chính không hợp lệ", 400);
      return services.getAdminFinanceSummary(ctx, input.data);
    }
    case "admin.finance.overview": {
      const input = parseAdminFinanceOverviewQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Khoảng thời gian tổng quan tài chính không hợp lệ", 400);
      return getAdminFinanceOverview(ctx, input.data);
    }
    case "admin.finance.transactions": {
      const input = parseAdminFinanceTransactionListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc giao dịch tài chính không hợp lệ", 400);
      return listAdminFinanceTransactions(ctx, input.data);
    }
    case "admin.finance.transactionDetail":
      return getAdminFinanceTransaction(ctx, route.jobId);
    case "admin.finance.export": {
      const input = parseAdminFinanceExportQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc xuất báo cáo tài chính không hợp lệ", 400);
      return exportAdminFinanceCsv(ctx, input.data);
    }
    case "admin.finance.taxPolicies.list":
      return listAdminFinanceTaxPolicies(ctx);
    case "admin.finance.taxPolicies.detail":
      return getAdminFinanceTaxPolicy(ctx, route.policyId);
    case "admin.finance.taxPolicies.draft": {
      const input = adminFinanceTaxPolicyDraftSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Bản nháp chính sách thuế không hợp lệ", 400);
      return createAdminFinanceTaxPolicyDraft(ctx, input.data);
    }
    case "admin.finance.taxPolicies.updateDraft": {
      const input = adminFinanceTaxPolicyDraftSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Bản nháp chính sách thuế không hợp lệ", 400);
      return updateAdminFinanceTaxPolicyDraft(ctx, route.policyId, input.data);
    }
    case "admin.finance.taxPolicies.approve": {
      const input = adminFinanceTaxPolicyApproveSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Bằng chứng phê duyệt thuế không hợp lệ", 400);
      return approveAdminFinanceTaxPolicy(ctx, route.policyId, input.data);
    }
    case "admin.finance.taxPolicies.retire": {
      const input = adminFinanceTaxPolicyRetireSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Lý do ngừng chính sách thuế không hợp lệ", 400);
      return retireAdminFinanceTaxPolicy(ctx, route.policyId, input.data);
    }
    case "admin.finance.balanceSnapshot": {
      const input = adminFinanceBalanceSnapshotSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Số dư tài khoản không hợp lệ", 400);
      return services.recordAdminFinanceBalanceSnapshot(ctx, input.data);
    }
    case "admin.finance.balanceSnapshots":
      return listAdminFinanceBalanceSnapshots(ctx);
    case "admin.payoutMethods.list": {
      const input = parseAdminPayoutMethodListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc tài khoản nhận tiền không hợp lệ", 400);
      return services.listAdminPayoutMethods(ctx, input.data);
    }
    case "admin.payoutMethods.detail":
      return services.getAdminPayoutMethod(ctx, route.payoutMethodId);
    case "admin.payoutMethods.sensitiveAccess": {
      const input = adminPayoutSensitiveAccessSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Lý do mở dữ liệu tài khoản không hợp lệ", 400);
      return services.createAdminPayoutMethodSensitiveAccess(ctx, route.payoutMethodId, input.data);
    }
    case "admin.payoutMethods.decision": {
      const input = adminPayoutMethodDecisionSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Quyết định xác nhận tài khoản không hợp lệ", 400);
      return services.decideAdminPayoutMethod(ctx, route.payoutMethodId, input.data);
    }
    case "admin.withdrawalRequests.list": {
      const input = parseAdminWithdrawalRequestListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc yêu cầu rút tiền không hợp lệ", 400);
      return services.listAdminWithdrawalRequests(ctx, input.data);
    }
    case "admin.withdrawalRequests.detail":
      return services.getAdminWithdrawalRequest(ctx, route.withdrawalRequestId);
    case "admin.withdrawalRequests.sensitiveAccess": {
      const input = adminPayoutSensitiveAccessSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Lý do mở dữ liệu tài khoản không hợp lệ", 400);
      return services.createAdminWithdrawalSensitiveAccess(ctx, route.withdrawalRequestId, input.data);
    }
    case "admin.withdrawalRequests.claim": {
      const input = adminWithdrawalRequestClaimSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu nhận xử lý rút tiền không hợp lệ", 400);
      return services.claimAdminWithdrawalRequest(ctx, route.withdrawalRequestId, input.data);
    }
    case "admin.withdrawalRequests.release": {
      const input = adminWithdrawalRequestReleaseSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu bỏ nhận rút tiền không hợp lệ", 400);
      return services.releaseAdminWithdrawalRequest(ctx, route.withdrawalRequestId, input.data);
    }
    case "admin.withdrawalRequests.resolve": {
      const input = adminWithdrawalRequestResolveSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Kết quả chi trả không hợp lệ", 400);
      return services.resolveAdminWithdrawalRequest(ctx, route.withdrawalRequestId, input.data);
    }
    case "admin.subAdmins.list": {
      const input = parseAdminSubAdminListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Phân trang Sub Admin không hợp lệ", 400);
      return services.listAdminSubAdmins(ctx, input.data);
    }
    case "admin.subAdmins.accounts": {
      const input = parseAdminSubAdminAccountSearchQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Từ khóa tìm tài khoản không hợp lệ", 400);
      return services.searchAdminSubAdminAccounts(ctx, input.data);
    }
    case "admin.managerNominations.nominate":
      return services.nominateAdminManager(ctx, route.userId);
    case "admin.managerNominations.cancel":
      return services.cancelAdminManagerNomination(ctx, route.nominationId);
    case "admin.subAdmins.access": {
      const input = adminSubAdminAccessSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Quyền quản trị viên phụ không hợp lệ", 400);
      return services.setAdminSubAdminAccess(ctx, route.userId, input.data);
    }
  }
  return assertNever(route);
}

function isAdminWorkerTeamUpgradeRoute(
  route: AdminControlDispatchRoute,
): route is AdminWorkerTeamUpgradeRoute {
  return route.kind === "admin.workerApplications.reviewDetail" ||
    route.kind === "admin.workerApplications.profileDecision" ||
    route.kind === "admin.subAdmins.provision" ||
    route.kind === "admin.subAdmins.resetPassword";
}

async function dispatchAdminWorkerTeamUpgrade(
  route: AdminWorkerTeamUpgradeRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
) {
  switch (route.kind) {
    case "admin.workerApplications.reviewDetail":
      return services.getAdminWorkerReviewDetail(ctx, route.applicationId);
    case "admin.workerApplications.profileDecision": {
      const input = adminWorkerProfileDecisionSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Quyết định xác minh hồ sơ không hợp lệ", 400);
      return services.decideAdminWorkerProfile(ctx, route.applicationId, input.data);
    }
    case "admin.subAdmins.provision": {
      const input = adminOperatorProvisionSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Thông tin tài khoản quản trị không hợp lệ", 400);
      return services.provisionAdminOperator(ctx, input.data);
    }
    case "admin.subAdmins.resetPassword": {
      const input = adminOperatorResetPasswordSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Mật khẩu ban đầu không hợp lệ", 400);
      return services.resetPendingAdminOperatorPassword(ctx, route.provisioningId, input.data);
    }
  }
}

async function dispatchAdminGovernance(
  ctx: MobileApiContext,
  service: MobileApiServices["listAdminDisputes"] | MobileApiServices["listAdminPriceBaselines"] | MobileApiServices["listAdminAiCosts"] | MobileApiServices["listAdminLearningRules"],
  request: Request,
  message: string,
): Promise<unknown> {
  const input = parseAdminGovernanceListQuery(new URL(request.url));
  if (!input.success) apiFailure("VALIDATION", message, 400);
  return service(ctx, input.data);
}
