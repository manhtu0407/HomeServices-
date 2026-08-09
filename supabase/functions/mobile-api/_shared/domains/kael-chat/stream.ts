import {
  getKaelChat,
  readKaelChatProgressSnapshot,
} from "./read.service.ts";
import { sendKaelChatTurn } from "./turn.ts";
import { submitKaelChatEvidence } from "./evidence.ts";

import { createSseResponse, encodeSseEvent, encodeSseHeartbeat } from "../../platform/sse.ts";
import { emitCommittedKaelReply, sleepForKaelChatStream } from "./verified-response-stream.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { EdgeAiSecrets } from "../../kael/index.ts";
import type {
  KaelChatEvidenceInput,
  KaelChatTurnInput,
} from "../../../../_shared/domain.ts";

export const KAEL_CHAT_STREAM_POLL_MS = 800;
export const KAEL_CHAT_STREAM_MAX_MS = 15_000;
export const KAEL_CHAT_STREAM_HEARTBEAT_MS = 10_000;
export async function streamKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: KaelChatTurnInput,
  secrets: EdgeAiSecrets,
) {
  return streamKaelChatRequest(
    ctx,
    sessionId,
    () => sendKaelChatTurn(ctx, sessionId, input, secrets),
  );
}

export async function streamKaelChatEvidence(
  ctx: MobileApiContext,
  sessionId: string,
  input: KaelChatEvidenceInput,
  secrets: EdgeAiSecrets,
) {
  return streamKaelChatRequest(
    ctx,
    sessionId,
    () => submitKaelChatEvidence(ctx, sessionId, input, secrets),
  );
}

async function streamKaelChatRequest(
  ctx: MobileApiContext,
  sessionId: string,
  request: () => Promise<unknown>,
) {
  // Preflight ownership before returning a 200 event stream so unauthorized
  // callers still receive the normal JSON auth/error path.
  const baseline = await getKaelChat(ctx, sessionId);

  // A session retains its last completed progress snapshot. Capture it before
  // this request begins so the client only sees stages emitted for this turn.
  const baselineProgress = await readKaelChatProgressSnapshot(ctx, sessionId);

  const encoder = new TextEncoder();
  let stopped = false;
  let lastProgressSignature = kaelProgressSignature(baselineProgress.progress);
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
      // Flush the SSE response before a media turn verifies Storage and starts
      // Vision. Expo otherwise can time out while the server is still working.
      write(encodeSseHeartbeat());
      const emitProgressIfChanged = async () => {
        const snapshot = await readKaelChatProgressSnapshot(ctx, sessionId);
        const progress = snapshot.progress;
        if (!progress) return;
        const signature = kaelProgressSignature(progress);
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

      const resultPromise = request()
        .then(async (result) => {
          await emitProgressIfChanged();
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
          await emitProgressIfChanged();
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

function kaelProgressSignature(progress: {
  current_stage: string;
  progress: number;
  status: string;
  updated_at: string;
} | null) {
  if (!progress) return null;
  return `${progress.current_stage}:${progress.status}:${progress.progress}:${progress.updated_at}`;
}

export function kaelChatStreamErrorPayload(err: unknown) {
  const code = typeof (err as { code?: unknown })?.code === "string"
    ? (err as { code: string }).code
    : "STREAM_ERROR";
  return {
    code,
    message:
      "Kael ch\u01b0a th\u1ec3 ph\u00e1t lu\u1ed3ng c\u1eadp nh\u1eadt. B\u1ea1n th\u1eed l\u1ea1i sau \u00edt ph\u00fat.",
  };
}
