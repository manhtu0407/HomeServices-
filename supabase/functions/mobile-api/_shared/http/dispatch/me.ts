import {
  accountDeletionRequestSchema,
  customerAvatarUpdateSchema,
  customerAvatarUploadSchema,
  customerKaelFeedbackSchema,
  customerRefundAccountSaveSchema,
  updateKaelMemorySchema,
  adminOperatorActivationSchema,
} from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { readJson } from "../read-json.ts";
import type { MobileApiContext, MobileApiServices } from "../contracts.ts";
import { assertNever, type MeDispatchRoute } from "./kinds.ts";

export async function dispatchMeRoute(
  route: MeDispatchRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "me.adminActivation":
      return services.getAdminActivation(ctx);
    case "me.adminActivation.activate": {
      const input = adminOperatorActivationSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Mật khẩu kích hoạt không hợp lệ", 400);
      return services.activateAdminOperator(ctx, input.data);
    }
    case "me.favoriteWorkerSave":
      if (!services.saveCustomerFavoriteWorker) {
        apiFailure("NOT_IMPLEMENTED", "Chức năng lưu thợ chưa sẵn sàng", 501);
      }
      return services.saveCustomerFavoriteWorker(ctx, route.workerId);
    case "me.favoriteWorkerRemove":
      if (!services.removeCustomerFavoriteWorker) {
        apiFailure("NOT_IMPLEMENTED", "Chức năng bỏ lưu thợ chưa sẵn sàng", 501);
      }
      return services.removeCustomerFavoriteWorker(ctx, route.workerId);
    case "me.jobs.active":
      return services.listCustomerActiveJobs(ctx);
    case "me.jobs.history":
      return services.listCustomerServiceHistory(ctx);
    case "me.favoriteWorkers.matching": {
      const jobId = new URL(request.url).searchParams.get("job_id")?.trim() ?? "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
        apiFailure("VALIDATION", "job_id không hợp lệ", 400);
      }
      return services.listFavoriteWorkersForMatching(ctx, jobId);
    }
    case "me.kaelFeedback": {
      const input = customerKaelFeedbackSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitCustomerKaelFeedback(ctx, input.data);
    }
    case "me.kaelMemory":
      return services.getMyKaelMemory(ctx);
    case "me.kaelMemory.delete":
      return services.deleteMyKaelMemory(ctx);
    case "me.kaelMemory.update": {
      const input = updateKaelMemorySchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.updateMyKaelMemory(ctx, input.data);
    }
    case "me.pendingDecisions":
      return services.listMyPendingDecisions(ctx);
    case "me.profileInsights":
      return services.getCustomerProfileInsights(ctx);
    case "me.avatar":
      return services.getCustomerAvatar(ctx);
    case "me.avatarUpload": {
      const input = customerAvatarUploadSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu ảnh đại diện không hợp lệ", 400);
      return services.createCustomerAvatarUpload(ctx, input.data);
    }
    case "me.avatarUpdate": {
      const input = customerAvatarUpdateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu ảnh đại diện không hợp lệ", 400);
      return services.updateCustomerAvatar(ctx, input.data);
    }
    case "me.accountDeletion": {
      if (!services.deleteAccount) {
        apiFailure("NOT_IMPLEMENTED", "Chức năng xóa tài khoản chưa sẵn sàng", 501);
      }
      const input = accountDeletionRequestSchema.safeParse(await readJson(request));
      if (!input.success) {
        apiFailure("VALIDATION", "Xác nhận xóa tài khoản không hợp lệ", 400);
      }
      return services.deleteAccount(ctx, input.data);
    }
    case "me.refundAccount":
      return services.getCustomerRefundAccount(ctx);
    case "me.refundAccount.save": {
      const input = customerRefundAccountSaveSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.saveCustomerRefundAccount(ctx, input.data);
    }
    case "me.threads":
      return services.listMyThreads(ctx);
  }
  return assertNever(route);
}
