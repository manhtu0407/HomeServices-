import {
  getCustomerKaelConversation,
  sendCustomerKaelConversationTurn,
} from "../customer/kael-conversation.ts";
import { createSseResponse, encodeSseEvent, encodeSseHeartbeat } from "../../platform/sse.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { EdgeAiSecrets } from "../../kael/index.ts";
import type { EdgeCustomerKaelConversationTurnInput } from "../../../../_shared/domain.ts";
import {
  kaelChatStreamErrorPayload,
  KAEL_CHAT_STREAM_HEARTBEAT_MS,
  KAEL_CHAT_STREAM_MAX_MS,
  KAEL_CHAT_STREAM_POLL_MS,
} from "./stream.ts";
import { emitCommittedKaelReply, sleepForKaelChatStream } from "./verified-response-stream.ts";
export async function streamCustomerKaelConversationTurn(
  ctx: MobileApiContext,
  conversationId: string,
  input: EdgeCustomerKaelConversationTurnInput,
  secrets: EdgeAiSecrets,
) {
  const baseline = await getCustomerKaelConversation(ctx, conversationId);
  return streamCustomerKaelConversationRequest(
    baseline,
    () => sendCustomerKaelConversationTurn(ctx, conversationId, input, secrets),
  );
}

function streamCustomerKaelConversationRequest(
  baseline: unknown,
  request: () => Promise<unknown>,
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

      const resultPromise = request()
        .then(async (result) => {
          await emitCommittedKaelReply(baseline, result, emit, () => stopped);
          emit("result", result);
          close();
        })
        .catch((err) => {
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
          await sleepForKaelChatStream(KAEL_CHAT_STREAM_POLL_MS);
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
