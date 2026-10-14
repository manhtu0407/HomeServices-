import type { PipelineStageLog } from "../../kael/contracts/types.ts";
import type { KaelSafeTraceEvent } from "../../kael/learning/trace.ts";

type TraceCall = Pick<KaelSafeTraceEvent, "provider" | "model" | "latency_ms" | "cost_usd">;
import type { KaelReplySource, KaelTurnTelemetry } from "./session-store.ts";

// The last provider call in a trace is the one whose text the customer read.
export function telemetryFromTrace(
  trace: readonly TraceCall[] | undefined,
  replySource: KaelReplySource,
): KaelTurnTelemetry {
  const call = [...(trace ?? [])].reverse().find((event) => event.provider !== null);
  if (!call) return { replySource };
  return {
    replySource,
    provider: call.provider,
    model: call.model,
    latencyMs: call.latency_ms,
    costUsd: call.cost_usd,
  };
}

export function telemetryFromStageLogs(
  stageLogs: readonly PipelineStageLog[] | undefined,
  stage: PipelineStageLog["stage"],
  replySource: KaelReplySource,
): KaelTurnTelemetry {
  const log = [...(stageLogs ?? [])].reverse().find((entry) => entry.stage === stage && entry.provider);
  if (!log) return { replySource };
  return {
    replySource,
    provider: log.provider ?? null,
    model: log.model ?? null,
    latencyMs: log.latencyMs,
    costUsd: log.costUsd ?? null,
  };
}

// Stored on the customer turn of a normal-chat exchange: the exchange RPC keeps no metadata for the Kael turn.
export function replyTelemetryMetadata(
  trace: readonly TraceCall[] | undefined,
  fallbackUsed: boolean,
  regenerated = false,
): Record<string, unknown> {
  const telemetry = telemetryFromTrace(trace, fallbackUsed ? "fallback" : regenerated ? "guard_regenerated" : "ai");
  return {
    reply_source: telemetry.replySource,
    fallback_used: fallbackUsed,
    ...(telemetry.provider ? { provider: telemetry.provider } : {}),
    ...(telemetry.model ? { model: telemetry.model } : {}),
    ...(typeof telemetry.latencyMs === "number" ? { latency_ms: Math.round(telemetry.latencyMs) } : {}),
    ...(typeof telemetry.costUsd === "number" ? { cost_usd: telemetry.costUsd } : {}),
  };
}
