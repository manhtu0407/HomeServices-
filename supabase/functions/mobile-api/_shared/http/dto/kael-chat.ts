import { customerKaelConversationModeSchema } from "../../../../_shared/domain.ts";
import type { EdgeCustomerKaelConversationMode } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";

export function customerKaelConversationModeParam(url: URL): EdgeCustomerKaelConversationMode {
  const parsed = customerKaelConversationModeSchema.safeParse(
    url.searchParams.get("mode") ?? undefined,
  );
  if (!parsed.success) {
    apiFailure("VALIDATION", "Chế độ trò chuyện Kael không hợp lệ", 400);
  }
  return parsed.data;
}
