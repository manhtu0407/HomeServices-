import {
  customerScopeDecisionSchema,
  devicePushTokenSchema,
  devicePushTokenUnregisterSchema,
  matchingPushDeliveryAckSchema,
  disputeAdminDecisionSchema,
  disputeCounterStatementSchema,
  placesAutocompleteSchema,
  placesResolveSchema,
} from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { readJson } from "../read-json.ts";
import type { MobileApiContext, MobileApiServices } from "../contracts.ts";
import { assertNever, type MiscDispatchRoute } from "./kinds.ts";

export async function dispatchMiscRoute(
  route: MiscDispatchRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "services":
      return services.listServices(ctx);
    case "places.autocomplete": {
      const input = placesAutocompleteSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.placesAutocomplete(ctx, input.data);
    }
    case "places.resolve": {
      const input = placesResolveSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.placesResolve(ctx, input.data);
    }
    case "scope.decide": {
      const input = customerScopeDecisionSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.decideScopeChange(ctx, route.scopeChangeId, input.data);
    }
    case "disputes.counterStatement": {
      const input = disputeCounterStatementSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitDisputeCounterStatement(
        ctx,
        route.disputeId,
        input.data,
      );
    }
    case "disputes.adminDecision": {
      const input = disputeAdminDecisionSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.decideDispute(ctx, route.disputeId, input.data);
    }
    case "notifications":
      return services.listNotifications(ctx);
    case "notifications.deviceToken": {
      const input = devicePushTokenSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.registerDevicePushToken(ctx, input.data);
    }
    case "notifications.deviceToken.unregister": {
      const input = devicePushTokenUnregisterSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.unregisterDevicePushToken(ctx, input.data);
    }
    case "notifications.matchingDeliveryAck": {
      const input = matchingPushDeliveryAckSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu xác nhận thiết bị không hợp lệ", 400);
      return services.acknowledgeMatchingPushDelivery(ctx, input.data);
    }
    case "notifications.read":
      return services.markNotificationRead(ctx, route.notificationId);
  }
  return assertNever(route);
}
