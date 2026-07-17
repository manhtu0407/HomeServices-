// Edge service kael-chat streaming (C4 6a, services/* split): SSE stream wrappers over the customer +
// worker Kael chat turn pipelines (poll progress -> emit stage/result/heartbeat). Imports the chat APIs
// one-way. Imported by services.ts for the createEdgeServices wiring.

import { db } from "../_runtime/db.ts";
import { getKaelChat, readKaelChatProgressSnapshot, sendKaelChatTurn } from "./index.ts";
import { readWorkerKaelSession, sendWorkerKaelChatTurn, serializeWorkerKaelSession } from "../worker-kael/index.ts";
import { createSseResponse, encodeSseEvent, encodeSseHeartbeat } from "../../sse.ts";
import type { MobileApiContext } from "../../router.ts";
import type { EdgeAiSecrets } from "../../kael/index.ts";
import type { KaelChatTurnInput, WorkerKaelChatTurnInput } from "../../../../_shared/domain.ts";

const KAEL_CHAT_STREAM_POLL_MS = 800;
const KAEL_CHAT_STREAM_MAX_MS = 15_000;
const KAEL_CHAT_STREAM_HEARTBEAT_MS = 10_000;

export async function streamKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: KaelChatTurnInput,
  secrets: EdgeAiSecrets,
) {
  // Preflight ownership before returning a 200 event stream so unauthorized
  // callers still receive the normal JSON auth/error path.
  await getKaelChat(ctx, sessionId);

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
      const emitProgressIfChanged = async () => {
        const snapshot = await readKaelChatProgressSnapshot(ctx, sessionId);
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

      const resultPromise = sendKaelChatTurn(ctx, sessionId, input, secrets)
        .then(async (result) => {
          await emitProgressIfChanged();
          // Token events remain disabled until provider-client/callAI exposes a
          // real streaming mode; the authoritative object is always final.
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
          await emitProgressIfChanged();
          const now = Date.now();
          if (now - lastHeartbeatAt >= KAEL_CHAT_STREAM_HEARTBEAT_MS) {
            write(encodeSseHeartbeat());
            lastHeartbeatAt = now;
          }
          await sleep(KAEL_CHAT_STREAM_POLL_MS);
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

      const resultPromise = sendWorkerKaelChatTurn(ctx, sessionId, input, secrets)
        .then(async (result) => {
          await emitProgressIfChanged();
          // Token events stay disabled until callAI exposes real provider token
          // streaming for worker_assist. The final result remains authoritative.
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
          await emitProgressIfChanged();
          const now = Date.now();
          if (now - lastHeartbeatAt >= KAEL_CHAT_STREAM_HEARTBEAT_MS) {
            write(encodeSseHeartbeat());
            lastHeartbeatAt = now;
          }
          await sleep(KAEL_CHAT_STREAM_POLL_MS);
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function kaelChatStreamErrorPayload(err: unknown) {
  const code = typeof (err as { code?: unknown })?.code === "string"
    ? (err as { code: string }).code
    : "STREAM_ERROR";
  return {
    code,
    message:
      "Kael ch\u01b0a th\u1ec3 ph\u00e1t lu\u1ed3ng c\u1eadp nh\u1eadt. B\u1ea1n th\u1eed l\u1ea1i sau \u00edt ph\u00fat.",
  };
}
