import {
  sendCustomerKaelConversationTurn,
} from "../customer/kael-conversation.ts";
import { createSseResponse, encodeSseEvent, encodeSseHeartbeat } from "../../platform/sse.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  createKaelReasoningReporter,
  createKaelResponseReporter,
  type EdgeAiSecrets,
  type KaelReasoningReporter,
  type KaelResponseReporter,
} from "../../kael/index.ts";
import type { EdgeCustomerKaelConversationTurnInput } from "../../../../_shared/domain.ts";
import {
  kaelChatStreamErrorPayload,
  KAEL_CHAT_STREAM_HEARTBEAT_MS,
  KAEL_CHAT_STREAM_MAX_MS,
  KAEL_CHAT_STREAM_POLL_MS,
} from "./stream.ts";
import { waitForKaelChatProgressPoll } from "./stream-delay.ts";
export async function streamCustomerKaelConversationTurn(
  ctx: MobileApiContext,
  conversationId: string,
  input: EdgeCustomerKaelConversationTurnInput,
  secrets: EdgeAiSecrets,
) {
  return streamCustomerKaelConversationRequest(
    input.language,
    (reasoning, response) => sendCustomerKaelConversationTurn(
      ctx,
      conversationId,
      input,
      secrets,
      { reasoning, response },
    ),
  );
}

function streamCustomerKaelConversationRequest(
  language: "vi" | "en",
  request: (
    reasoning: KaelReasoningReporter,
    response: KaelResponseReporter,
  ) => Promise<unknown>,
) {
  const encoder = new TextEncoder();
  let stopped = false;
  let lastHeartbeatAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (stopped) return;
        controller.enqueue(encoder.encode(chunk));
      };
      const emit = (event: string, data: unknown) => {
        write(encodeSseEvent({ event, data }));
      };
      const close = () => {
        if (stopped) return;
        stopped = true;
        controller.close();
      };
      write(encodeSseHeartbeat());
      const reasoning = createKaelReasoningReporter({ emit });
      const response = createKaelResponseReporter({ emit, language });
      reasoning.start();

      const resultPromise = request(reasoning, response)
        .then((result) => {
          emit("result", result);
          close();
        })
        .catch((err) => {
          response.fail({
            message: language === "en"
              ? "Kael could not complete this reply. Please try again."
              : "Kael chưa thể hoàn tất phản hồi này. Vui lòng thử lại.",
            recoverable: true,
          });
          reasoning.fail({
            publicMessage: language === "en"
              ? "Kael could not complete this reply. Please try again."
              : "Kael chưa thể hoàn tất phản hồi này. Vui lòng thử lại.",
            recoverable: true,
          });
          emit("error", kaelChatStreamErrorPayload(err));
          close();
        });

      void (async () => {
        const startedAt = Date.now();
        while (!stopped && Date.now() - startedAt < KAEL_CHAT_STREAM_MAX_MS) {
          const now = Date.now();
          if (now - lastHeartbeatAt >= KAEL_CHAT_STREAM_HEARTBEAT_MS) {
            write(encodeSseHeartbeat());
            lastHeartbeatAt = now;
          }
          await waitForKaelChatProgressPoll(KAEL_CHAT_STREAM_POLL_MS);
        }
        await resultPromise;
      })().catch((err) => {
        emit("error", kaelChatStreamErrorPayload(err));
        close();
      });
    },
    cancel() {
      stopped = true;
    },
  });

  return createSseResponse(stream);
}
