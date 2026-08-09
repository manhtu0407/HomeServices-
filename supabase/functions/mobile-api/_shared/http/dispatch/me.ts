import {
  customerAccountDeletionRequestSchema,
  customerAvatarUpdateSchema,
  customerAvatarUploadSchema,
  customerKaelFeedbackSchema,
  customerRefundAccountSaveSchema,
  updateKaelMemorySchema,
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
      if (!services.deleteCustomerAccount) {
        apiFailure("NOT_IMPLEMENTED", "Chức năng xóa tài khoản chưa sẵn sàng", 501);
      }
      const input = customerAccountDeletionRequestSchema.safeParse(await readJson(request));
      if (!input.success) {
        apiFailure("VALIDATION", "Xác nhận xóa tài khoản không hợp lệ", 400);
      }
      return services.deleteCustomerAccount(ctx, input.data);
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
