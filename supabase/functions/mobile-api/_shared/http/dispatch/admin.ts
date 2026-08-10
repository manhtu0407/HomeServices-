import { priceSynthesisAbCaseSchema } from "../../platform/kael-contracts.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { readJson } from "../read-json.ts";
import {
  adminSubAdminAccessSchema,
  adminWorkerAccessSchema,
  adminWorkerApplicationDecisionSchema,
  parseAdminGovernanceListQuery,
  parseAdminSubAdminAccountSearchQuery,
  parseAdminTransactionListQuery,
  parseAdminWorkerApplicationListQuery,
} from "../routes/admin-control-contract.ts";
import {
  adminPayoutMethodDecisionSchema,
  adminWithdrawalRequestResolveSchema,
  parseAdminPayoutMethodListQuery,
  parseAdminWithdrawalRequestListQuery,
} from "../routes/admin-payout-contract.ts";
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
      | "admin.operations.get"
      | `admin.governance.${string}`
      | `admin.workerApplications.${string}`
      | `admin.workers.${string}`
      | `admin.transactions.${string}`
      | `admin.payoutMethods.${string}`
      | `admin.withdrawalRequests.${string}`
      | `admin.subAdmins.${string}`
      | `admin.managerNominations.${string}`;
  }
>;

function isAdminControlRoute(route: AdminDispatchRoute): route is AdminControlDispatchRoute {
  return route.kind === "admin.operations.get"
    || route.kind.startsWith("admin.governance.")
    || route.kind.startsWith("admin.workerApplications.")
    || route.kind.startsWith("admin.workers.")
    || route.kind.startsWith("admin.transactions.")
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
  switch (route.kind) {
    case "admin.operations.get":
      return services.getAdminOperations(ctx);
    case "admin.governance.disputes":
      return dispatchAdminGovernance(ctx, services.listAdminDisputes, request, "Phân trang tranh chấp không hợp lệ");
    case "admin.governance.priceBaselines":
      return dispatchAdminGovernance(ctx, services.listAdminPriceBaselines, request, "Phân trang nền tảng giá không hợp lệ");
    case "admin.governance.aiCosts":
      return dispatchAdminGovernance(ctx, services.listAdminAiCosts, request, "Phân trang chi phí Kael không hợp lệ");
    case "admin.governance.learningRules":
      return dispatchAdminGovernance(ctx, services.listAdminLearningRules, request, "Phân trang quy tắc học Kael không hợp lệ");
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
    case "admin.transactions.list": {
      const input = parseAdminTransactionListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc giao dịch không hợp lệ", 400);
      return services.listAdminTransactions(ctx, input.data);
    }
    case "admin.transactions.detail":
      return services.getAdminTransaction(ctx, route.jobId);
    case "admin.payoutMethods.list": {
      const input = parseAdminPayoutMethodListQuery(new URL(request.url));
      if (!input.success) apiFailure("VALIDATION", "Bộ lọc tài khoản nhận tiền không hợp lệ", 400);
      return services.listAdminPayoutMethods(ctx, input.data);
    }
    case "admin.payoutMethods.detail":
      return services.getAdminPayoutMethod(ctx, route.payoutMethodId);
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
    case "admin.withdrawalRequests.claim":
      return services.claimAdminWithdrawalRequest(ctx, route.withdrawalRequestId);
    case "admin.withdrawalRequests.resolve": {
      const input = adminWithdrawalRequestResolveSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Kết quả chi trả không hợp lệ", 400);
      return services.resolveAdminWithdrawalRequest(ctx, route.withdrawalRequestId, input.data);
    }
    case "admin.subAdmins.list":
      return services.listAdminSubAdmins(ctx);
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
