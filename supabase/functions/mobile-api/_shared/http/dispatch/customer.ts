import {
  customerKaelConversationCreateSchema,
  customerKaelConversationPinSchema,
  customerKaelConversationRenameSchema,
  customerKaelConversationTurnSchema,
  normalChatSuggestionsRequestSchema,
} from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { readJson } from "../read-json.ts";
import { customerKaelConversationModeParam } from "../dto/kael-chat.ts";
import type { MobileApiContext, MobileApiServices } from "../contracts.ts";
import { assertNever, type CustomerDispatchRoute } from "./kinds.ts";

export async function dispatchCustomerRoute(
  route: CustomerDispatchRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "customer.kaelConversations.create": {
      const input = customerKaelConversationCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createCustomerKaelConversation(ctx, input.data);
    }
    case "customer.kaelConversations.list":
      return services.listCustomerKaelConversations(
        ctx,
        customerKaelConversationModeParam(new URL(request.url)),
      );
    case "customer.kaelConversations.archive":
      return services.archiveCustomerKaelConversation(
        ctx,
        route.conversationId,
        new URL(request.url).searchParams.get("confirm_case_work") === "true",
      );
    case "customer.kaelConversations.rename": {
      const input = customerKaelConversationRenameSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.renameCustomerKaelConversation(ctx, route.conversationId, input.data);
    }
    case "customer.kaelConversations.pin": {
      const input = customerKaelConversationPinSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.setCustomerKaelConversationPinned(ctx, route.conversationId, input.data);
    }
    case "customer.kaelConversations.get":
      return services.getCustomerKaelConversation(ctx, route.conversationId);
    case "customer.kaelConversations.turn": {
      const input = customerKaelConversationTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.sendCustomerKaelConversationTurn(ctx, route.conversationId, input.data);
    }
    case "customer.kaelConversations.suggestions": {
      const input = normalChatSuggestionsRequestSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createCustomerKaelConversationSuggestions(ctx, route.conversationId, input.data);
    }
    case "customer.kaelConversations.stream": {
      const input = customerKaelConversationTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.streamCustomerKaelConversationTurn(ctx, route.conversationId, input.data);
    }
  }
  return assertNever(route);
}
