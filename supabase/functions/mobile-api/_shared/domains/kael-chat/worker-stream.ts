import { db } from "../../platform/db.ts";
import { createSseResponse, encodeSseEvent, encodeSseHeartbeat } from "../../platform/sse.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  createKaelReasoningReporter,
  createKaelResponseReporter,
  type EdgeAiSecrets,
} from "../../kael/index.ts";
import type { WorkerKaelChatTurnInput } from "../../../../_shared/domain.ts";
import {
  readWorkerKaelSession,
  sendWorkerKaelChatTurn,
  serializeWorkerKaelSession,
} from "../worker/kael-chat.ts";
import {
  kaelChatStreamErrorPayload,
  KAEL_CHAT_STREAM_HEARTBEAT_MS,
  KAEL_CHAT_STREAM_MAX_MS,
  KAEL_CHAT_STREAM_POLL_MS,
} from "./stream.ts";
import { waitForKaelChatProgressPoll } from "./stream-delay.ts";
export async function streamWorkerKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: WorkerKaelChatTurnInput,
  secrets: EdgeAiSecrets,
) {
  await readWorkerKaelChatProgressSnapshot(ctx, sessionId);

  const encoder = new TextEncoder();
  let stopped = false;
  let lastProgressSignature: string | null = null;
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
      // Keep worker streams equally resilient when the first assist stage
      // needs more time than the client connection window.
      write(encodeSseHeartbeat());
      const reasoning = createKaelReasoningReporter({ emit });
      const response = createKaelResponseReporter({ emit, language: input.language });
      reasoning.start();
      const emitProgressIfChanged = async () => {
        const snapshot = await readWorkerKaelChatProgressSnapshot(ctx, sessionId);
        const progress = snapshot.progress;
        if (!progress) return;
        const signature = `${progress.current_stage}:${progress.status}:${progress.progress}:${progress.updated_at}`;
        if (signature === lastProgressSignature) return;
        lastProgressSignature = signature;
        emit("stage", {
          stage: progress.current_stage,
          status: progress.status,
          progress: progress.progress,
          failure_reason: progress.failure_reason ?? null,
          updated_at: progress.updated_at,
        });
      };

      const resultPromise = sendWorkerKaelChatTurn(
        ctx,
        sessionId,
        input,
        secrets,
        { reasoning, response },
      )
        .then(async (result) => {
          await emitProgressIfChanged();
          emit("result", result);
          close();
        })
        .catch((err) => {
          response.fail({
            message: input.language === "en"
              ? "Kael could not complete this reply. Please try again."
              : "Kael chưa thể hoàn tất phản hồi này. Vui lòng thử lại.",
            recoverable: true,
          });
          reasoning.fail({
            publicMessage: input.language === "en"
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
          await emitProgressIfChanged();
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

async function readWorkerKaelChatProgressSnapshot(
  ctx: MobileApiContext,
  sessionId: string,
) {
  const client = db(ctx);
  const session = await readWorkerKaelSession(client, ctx, sessionId);
  return {
    session_id: sessionId,
    progress: serializeWorkerKaelSession(session).progress,
  };
}
