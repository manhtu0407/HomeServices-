// Edge service kael-chat streaming (C4 6a, services/* split): SSE wrappers for customer turns,
// customer evidence analysis, and worker turns (poll progress -> emit stage/result/heartbeat).
// Imports chat APIs one-way and is wired through services.ts.

import { db } from "./db.ts";
import {
  getKaelChat,
  readKaelChatProgressSnapshot,
  sendKaelChatTurn,
  submitKaelChatEvidence,
} from "./kael-chat.service.ts";
import {
  getCustomerKaelConversation,
  sendCustomerKaelConversationTurn,
} from "./customer-kael-conversation.service.ts";
import {
  splitVerifiedResponseBlocks,
  splitVerifiedResponseDeltas,
  verifiedResponseCadenceMs,
  verifiedResponseTargetChars,
} from "./kael-verified-response-stream.ts";
import { readWorkerKaelSession, sendWorkerKaelChatTurn, serializeWorkerKaelSession } from "./worker-kael-chat.service.ts";
import { createSseResponse, encodeSseEvent, encodeSseHeartbeat } from "../sse.ts";
import type { MobileApiContext } from "../router.ts";
import type { EdgeAiSecrets } from "../kael/index.ts";
import type {
  EdgeCustomerKaelConversationTurnInput,
  KaelChatEvidenceInput,
  KaelChatTurnInput,
  WorkerKaelChatTurnInput,
} from "../../../_shared/domain.ts";

const KAEL_CHAT_STREAM_POLL_MS = 800;
const KAEL_CHAT_STREAM_MAX_MS = 15_000;
const KAEL_CHAT_STREAM_HEARTBEAT_MS = 10_000;

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
      // Keep worker streams equally resilient when the first assist stage
      // needs more time than the client connection window.
      write(encodeSseHeartbeat());
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

async function emitCommittedKaelReply(
  baseline: unknown,
  result: unknown,
  emit: (event: string, data: unknown) => void,
  isStopped: () => boolean,
) {
  const reply = findCommittedKaelReply(baseline, result);
  if (!reply) return;
  const startedAt = Date.now();
  const blocks = splitVerifiedResponseBlocks(reply.text);
  const targetChars = verifiedResponseTargetChars(reply.text);
  emit("response.started", {
    response_id: reply.turnId,
    mode: "standard",
  });
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const blockId = `${reply.turnId}:block:${blockIndex}`;
    emit("block.started", {
      block_id: blockId,
      kind: block.kind,
    });
    const deltas = splitVerifiedResponseDeltas(block.text, targetChars);
    for (let deltaIndex = 0; deltaIndex < deltas.length; deltaIndex += 1) {
      if (isStopped()) return;
      emit("block.text.delta", {
        block_id: blockId,
        delta: deltas[deltaIndex],
      });
      // Keep released clients compatible while new clients suppress this twin
      // after observing response.started for the same turn.
      emit("response_delta", {
        turn_id: reply.turnId,
        delta: deltas[deltaIndex],
      });
      if (deltaIndex < deltas.length - 1) {
        await sleep(verifiedResponseCadenceMs(deltas[deltaIndex]));
      }
    }
    emit("block.completed", { block_id: blockId });
    if (block.separatorAfter) {
      emit("response_delta", {
        turn_id: reply.turnId,
        delta: block.separatorAfter,
      });
    }
    if (blockIndex < blocks.length - 1) {
      await sleep(verifiedResponseCadenceMs("\n"));
    }
  }
  emit("response.completed", {
    response_id: reply.turnId,
    elapsed_ms: Date.now() - startedAt,
  });
}

function findCommittedKaelReply(baseline: unknown, result: unknown) {
  const existingIds = new Set(responseTurns(baseline).map((turn) => turn.id));
  const turns = responseTurns(result);
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (
      turn.role === "kael" &&
      !existingIds.has(turn.id) &&
      turn.text_content.trim().length > 0
    ) {
      return { turnId: turn.id, text: turn.text_content };
    }
  }
  return null;
}

function responseTurns(value: unknown) {
  if (!value || typeof value !== "object") return [];
  const turns = (value as { turns?: unknown }).turns;
  if (!Array.isArray(turns)) return [];
  return turns.flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const candidate = turn as {
      id?: unknown;
      role?: unknown;
      text_content?: unknown;
    };
    return typeof candidate.id === "string" &&
        typeof candidate.role === "string" &&
        typeof candidate.text_content === "string"
      ? [{
        id: candidate.id,
        role: candidate.role,
        text_content: candidate.text_content,
      }]
      : [];
  });
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
