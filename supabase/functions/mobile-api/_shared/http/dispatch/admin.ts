import { priceSynthesisAbCaseSchema } from "../../platform/kael-contracts.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { readJson } from "../read-json.ts";
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

export async function dispatchAdminRoute(
  route: AdminDispatchRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "admin.marketCache.invalidate":
      return services.invalidateMarketCache(
        ctx,
        marketCacheInvalidateInput(await readJson(request)),
      );
    case "admin.kaelAb.priceSynthesis": {
      const input = priceSynthesisAbCaseSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu A/B không hợp lệ", 400);
      return services.evaluatePriceSynthesisAbCase(ctx, input.data);
    }
    case "admin.kaelLearning.processQueue":
      return services.processKaelLearningQueue(
        ctx,
        kaelLearningQueueProcessInput(await readJson(request)),
      );
    case "admin.kaelLearning.processBatchResults":
      return services.processKaelBatchResults(
        ctx,
        kaelBatchResultsProcessInput(await readJson(request)),
      );
    case "admin.kaelLearning.monitorRules":
      return services.monitorKaelLearningRules(
        ctx,
        kaelLearningMonitorInput(await readJson(request)),
      );
    case "admin.kaelLearning.candidates.list":
      return services.listKaelLearningCandidates(
        ctx,
        kaelLearningCandidateListInput(new URL(request.url)),
      );
    case "admin.kaelLearning.candidates.approve":
      return services.approveKaelLearningCandidate(
        ctx,
        route.candidateId,
        kaelLearningCandidateReviewInput(await readJson(request), "approve"),
      );
    case "admin.kaelLearning.candidates.reject":
      return services.rejectKaelLearningCandidate(
        ctx,
        route.candidateId,
        kaelLearningCandidateReviewInput(await readJson(request), "reject"),
      );
    case "admin.kaelModelHealth.get":
      return getKaelModelHealth(ctx);
    case "admin.kaelEstimateAccuracy.list":
      return listKaelEstimateAccuracy(ctx, parseKaelEstimateAccuracyInput(new URL(request.url)));
    case "admin.kaelQueue.list":
      return listKaelAdminQueue(
        ctx,
        parseKaelAdminQueueListInput(new URL(request.url)),
      );
    case "admin.kaelQueue.resolve":
      return resolveKaelAdminQueue(
        ctx,
        route.queueId,
        parseKaelAdminQueueResolveInput(await readJson(request)),
      );
  }
  return assertNever(route);
}
