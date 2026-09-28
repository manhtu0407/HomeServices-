import {
  ambassadorRedeemSchema,
  appealEvidenceUploadSchema,
  appealSubmitSchema,
  compensationResponseSchema,
  availabilityToggleSchema,
  workerApplicationSubmitSchema,
  workerAvatarUpdateSchema,
  workerAvatarUploadSchema,
  workerKaelChatCreateSchema,
  workerKaelChatPinSchema,
  workerKaelChatRenameSchema,
  workerKaelChatTurnSchema,
  workerKaelFeedbackSchema,
  workerKaelMemoryPreferenceUpdateSchema,
  workerKaelTrainingConsentSchema,
  workerRegisterSchema,
  workerRegistrationDraftSchema,
  workerServiceAreaUpdateSchema,
  workerServicePreferencesUpdateSchema,
} from "../../../../_shared/domain.ts";
import {
  workerPayoutMethodSaveSchema,
  workerWithdrawalRequestCreateSchema,
} from "../../../../_shared/worker-payout-contract.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { workerRegistrationCommandSchema } from "../../../../_shared/contracts/worker.ts";
import { readJson } from "../read-json.ts";
import {
  optionalWorkerRouteOrigin,
  parseIsoParam,
  requiredWorkerRouteOrigin,
  workerKaelChatModeParam,
} from "../dto/worker.ts";
import type { MobileApiContext, MobileApiServices } from "../contracts.ts";
import { assertNever, type WorkerDispatchRoute } from "./kinds.ts";

export async function dispatchWorkerRoute(
  route: WorkerDispatchRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "workers.registrationCommand.submit": {
      const input = workerRegistrationCommandSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Lệnh gửi hồ sơ không hợp lệ", 400);
      return services.submitWorkerRegistrationCommand(ctx, input.data);
    }
    case "workers.registrationCommand.get": {
      const key = workerRegistrationCommandSchema.shape.client_request_id.safeParse(route.clientRequestId);
      if (!key.success) apiFailure("VALIDATION", "Mã gửi hồ sơ không hợp lệ", 400);
      return services.getWorkerRegistrationCommand(ctx, key.data);
    }
    case "workers.register": {
      const input = workerRegisterSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.registerWorker(ctx, input.data);
    }
    case "workers.registrationDraft": {
      const input = workerRegistrationDraftSchema.safeParse(await readJson(request));
      if (!input.success || Object.keys(input.data).length === 0) {
        apiFailure("VALIDATION", "Dữ liệu tự lưu không hợp lệ", 400);
      }
      return services.saveWorkerRegistrationDraft(ctx, input.data);
    }
    case "workerApplications.submit": {
      const input = workerApplicationSubmitSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitWorkerApplication(ctx, input.data);
    }
    case "workerApplications.me":
      return services.getWorkerReadiness(ctx);
    case "workers.me":
      return services.getWorkerProfile(ctx);
    case "workers.avatarUpload": {
      const input = workerAvatarUploadSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Ảnh đại diện không hợp lệ", 400);
      return services.createWorkerAvatarUpload(ctx, input.data);
    }
    case "workers.avatar": {
      const input = workerAvatarUpdateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Ảnh đại diện không hợp lệ", 400);
      return services.updateWorkerAvatar(ctx, input.data);
    }
    case "workers.activityMinute":
      return services.recordWorkerAppActiveMinute(ctx);
    case "workers.performanceInsights":
      return services.getWorkerPerformanceInsights(ctx);
    case "workers.serviceArea": {
      const input = workerServiceAreaUpdateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.updateWorkerServiceArea(ctx, input.data);
    }
    case "workers.servicePreferences": {
      const input = workerServicePreferencesUpdateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.updateWorkerServicePreferences(ctx, input.data);
    }
    case "workers.kaelMemory":
      return services.getWorkerKaelMemory(ctx);
    case "workers.kaelMemory.update": {
      const input = workerKaelMemoryPreferenceUpdateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Invalid worker memory preference payload", 400);
      return services.updateWorkerKaelMemoryPreference(ctx, input.data);
    }
    case "workers.kaelChat.create": {
      const input = workerKaelChatCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createWorkerKaelChat(ctx, input.data);
    }
    case "workers.kaelChat.list":
      return services.listWorkerKaelChats(
        ctx,
        workerKaelChatModeParam(new URL(request.url)),
      );
    case "workers.kaelChat.archive":
      return services.archiveWorkerKaelChat(ctx, route.sessionId);
    case "workers.kaelChat.pin": {
      const input = workerKaelChatPinSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.setWorkerKaelChatPinned(ctx, route.sessionId, input.data);
    }
    case "workers.kaelChat.rename": {
      const input = workerKaelChatRenameSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.renameWorkerKaelChat(ctx, route.sessionId, input.data);
    }
    case "workers.kaelChat.get":
      return services.getWorkerKaelChat(ctx, route.sessionId);
    case "workers.kaelChat.stream": {
      const input = workerKaelChatTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.streamWorkerKaelChatTurn(ctx, route.sessionId, input.data);
    }
    case "workers.kaelChat.turn": {
      const input = workerKaelChatTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.sendWorkerKaelChatTurn(ctx, route.sessionId, input.data);
    }
    case "workers.kaelFeedback": {
      const input = workerKaelFeedbackSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitWorkerKaelFeedback(ctx, input.data);
    }
    case "workers.kaelTrainingConsent.get":
      return services.getWorkerKaelTrainingConsent(ctx);
    case "workers.kaelTrainingConsent.set": {
      const input = workerKaelTrainingConsentSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.setWorkerKaelTrainingConsent(ctx, input.data);
    }
    case "workers.availability": {
      const input = availabilityToggleSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.updateWorkerAvailability(ctx, input.data);
    }
    case "workers.broadcasts":
      return services.listWorkerBroadcasts(ctx);
    case "workers.matchingHeartbeat":
      return services.recordWorkerMatchingHeartbeat(ctx);
    case "workers.broadcastSeen":
      return services.markWorkerBroadcastSeen(ctx, route.broadcastId);
    case "workers.broadcastProposal":
      return services.submitWorkerMatchingProposal(
        ctx,
        route.broadcastId,
        workerMatchingProposalInput(await readJson(request)),
      );
    case "workers.jobs":
      return services.listWorkerJobs(ctx);
    case "workers.payoutMethod.get":
      return services.getWorkerPayoutMethod(ctx);
    case "workers.payoutMethod.save": {
      const input = workerPayoutMethodSaveSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Tài khoản nhận tiền không hợp lệ", 400);
      return services.saveWorkerPayoutMethod(ctx, input.data);
    }
    case "workers.compensation.list":
      return services.listWorkerCompensation(ctx);
    case "workers.compensation.respond": {
      const input = compensationResponseSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Phản hồi bồi thường chưa hợp lệ", 400);
      return services.respondCompensation(ctx, route.negotiationId, input.data);
    }
    case "workers.violations.list":
      return services.listWorkerViolations(ctx);
    case "workers.violations.appealUpload": {
      const input = appealEvidenceUploadSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Loại tệp bằng chứng không hợp lệ", 400);
      return services.createAppealEvidenceUpload(ctx, route.caseId, input.data);
    }
    case "workers.violations.appeal": {
      const input = appealSubmitSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Khiếu nại cần lý do rõ ràng", 400);
      return services.submitViolationAppeal(ctx, route.caseId, input.data);
    }
    case "workers.ambassador.get":
      return services.getWorkerAmbassadorSummary(ctx);
    case "workers.ambassador.code":
      return services.ensureWorkerReferralCode(ctx);
    case "workers.ambassador.redeem": {
      const input = ambassadorRedeemSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu đổi thưởng không hợp lệ", 400);
      return services.redeemAmbassadorMilestone(ctx, input.data);
    }
    case "workers.withdrawalRequests.list":
      return services.listWorkerWithdrawalRequests(ctx);
    case "workers.withdrawalRequests.create": {
      const input = workerWithdrawalRequestCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Yêu cầu rút tiền không hợp lệ", 400);
      return services.createWorkerWithdrawalRequest(ctx, input.data);
    }
    case "workers.routePreview":
      return services.getWorkerRoutePreview(
        ctx,
        route.jobId,
        requiredWorkerRouteOrigin(new URL(request.url)),
      );
    case "workers.routeMap":
      return services.getWorkerRouteMap(
        ctx,
        route.jobId,
        optionalWorkerRouteOrigin(new URL(request.url)),
      );
    case "workers.earnings": {
      const url = new URL(request.url);
      const from = parseIsoParam(url.searchParams.get("from"), "from");
      const to = parseIsoParam(url.searchParams.get("to"), "to");
      if (from && to && from > to) {
        apiFailure("VALIDATION", '"from" phải nhỏ hơn hoặc bằng "to"', 400);
      }
      return services.getWorkerEarnings(ctx, { from, to });
    }
  }
  return assertNever(route);
}

function workerMatchingProposalInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    apiFailure("VALIDATION", "Đề xuất phạm vi không hợp lệ", 400);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some((key) =>
      key !== "scope_summary" && key !== "price_min" && key !== "price_max"
    ) ||
    typeof record.scope_summary !== "string" ||
    record.scope_summary.trim().length < 3 ||
    record.scope_summary.trim().length > 2000 ||
    !nullablePositiveInteger(record.price_min) ||
    !nullablePositiveInteger(record.price_max) ||
    typeof record.price_min === "number" && typeof record.price_max === "number" &&
      record.price_max < record.price_min
  ) {
    apiFailure("VALIDATION", "Đề xuất phạm vi không hợp lệ", 400);
  }
  return {
    scope_summary: record.scope_summary.trim(),
    price_min: typeof record.price_min === "number" ? record.price_min : null,
    price_max: typeof record.price_max === "number" ? record.price_max : null,
  };
}

function nullablePositiveInteger(value: unknown) {
  return value === undefined || value === null ||
    typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
