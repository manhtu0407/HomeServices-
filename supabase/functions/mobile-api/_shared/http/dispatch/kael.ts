import {
  kaelAssistantSchema,
  kaelChatCreateSchema,
  kaelChatConfirmSchema,
  kaelChatEvidenceSchema,
  kaelChatIntakeConfirmationDecisionSchema,
  kaelChatMediaRevokeSchema,
  kaelChatMediaUploadSchema,
  kaelChatTurnSchema,
} from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { readJson } from "../read-json.ts";
import type { MobileApiContext, MobileApiServices } from "../contracts.ts";
import { assertNever, type KaelDispatchRoute } from "./kinds.ts";
import { legacyConfirmationRecoverySchema } from "../../../../_shared/contracts/legacy-confirmation-recovery.ts";

export async function dispatchKaelRoute(
  route: KaelDispatchRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  switch (route.kind) {
    case "kael.chat.create": {
      const input = kaelChatCreateSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createKaelChat(ctx, input.data);
    }
    case "kael.assistant": {
      const input = kaelAssistantSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.answerKaelAssistant(ctx, input.data);
    }
    case "kael.chat.mediaUpload": {
      const input = kaelChatMediaUploadSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.createKaelChatMediaUpload(ctx, input.data);
    }
    case "kael.chat.mediaRevoke": {
      const input = kaelChatMediaRevokeSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.revokeKaelChatMedia(ctx, input.data);
    }
    case "kael.chat.get":
      return services.getKaelChat(ctx, route.sessionId);
    case "kael.chat.progress":
      return services.getKaelChatProgress(ctx, route.sessionId);
    case "kael.chat.stream": {
      const input = kaelChatTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.streamKaelChatTurn(ctx, route.sessionId, input.data);
    }
    case "kael.chat.evidenceStream": {
      const input = kaelChatEvidenceSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.streamKaelChatEvidence(ctx, route.sessionId, input.data);
    }
    case "kael.chat.turn": {
      const input = kaelChatTurnSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.sendKaelChatTurn(ctx, route.sessionId, input.data);
    }
    case "kael.chat.intakeConfirmation": {
      const input = kaelChatIntakeConfirmationDecisionSchema.safeParse(
        await readJson(request),
      );
      if (!input.success) {
        apiFailure("VALIDATION", "Dữ liệu xác nhận không hợp lệ", 400);
      }
      return services.decideKaelIntakeConfirmation(
        ctx,
        route.sessionId,
        input.data,
      );
    }
    case "kael.chat.confirm": {
      const input = kaelChatConfirmSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu xác nhận không hợp lệ", 400);
      return services.confirmKaelChat(ctx, route.sessionId, input.data);
    }
    case "kael.chat.operation":
      return services.getKaelConfirmationOperation(ctx, route.sessionId);
    case "kael.chat.recoverConfirmation": {
      const input = legacyConfirmationRecoverySchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu khôi phục xác nhận không hợp lệ.", 400);
      return services.recoverLegacyKaelConfirmation(ctx, route.sessionId, input.data);
    }
    case "kael.chat.evidence": {
      const input = kaelChatEvidenceSchema.safeParse(await readJson(request));
      if (!input.success) apiFailure("VALIDATION", "Dữ liệu không hợp lệ", 400);
      return services.submitKaelChatEvidence(ctx, route.sessionId, input.data);
    }
  }
  return assertNever(route);
}
