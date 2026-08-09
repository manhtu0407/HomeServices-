import { sanitizeHarnessMetadata } from "./trace.ts";

export type HarnessPromotionClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

export type HarnessKillSwitch =
  | "global_ai"
  | "provider_anthropic"
  | "provider_perplexity"
  | "provider_deepseek"
  | "tool_market_lookup"
  | "tool_vision"
  | "learning_promotion"
  | "payment_sepay";

export type HarnessPromotionState =
  | "assembled"
  | "verified"
  | "staging"
  | "shadow"
  | "canary"
  | "production"
  | "aborted"
  | "rolled_back";

export type HarnessPromotionPacket = Readonly<{
  releaseId: string;
  environment: "preview" | "staging" | "production";
  fromState: HarnessPromotionState;
  toState: HarnessPromotionState;
  packetSha256: string;
  evaluationReportId: string | null;
  rollbackReleaseId: string | null;
  humanApprovalId: string | null;
  cohort: string | null;
  observationWindowMinutes: number | null;
}>;

export async function transitionHarnessPromotion(
  client: HarnessPromotionClient,
  input: {
    readonly packet: HarnessPromotionPacket;
    readonly actorId: string | null;
    readonly reasonCode?: string | null;
    readonly safeMetadata?: Record<string, unknown>;
  },
): Promise<{ ok: true; promotionId: string; state: string } | { ok: false; errorCode: string }> {
  const metadata = sanitizeHarnessMetadata({
    ...(input.safeMetadata ?? {}),
    cohort: input.packet.cohort,
    observation_window_minutes: input.packet.observationWindowMinutes,
  });
  try {
    const { data, error } = await client.rpc("transition_harness_promotion", {
      p_release_id: input.packet.releaseId,
      p_environment: input.packet.environment,
      p_expected_state: input.packet.fromState,
      p_next_state: input.packet.toState,
      p_packet_sha256: input.packet.packetSha256,
      p_evaluation_report_id: input.packet.evaluationReportId,
      p_rollback_release_id: input.packet.rollbackReleaseId,
      p_approval_id: input.packet.humanApprovalId,
      p_actor_id: input.actorId,
      p_reason_code: input.reasonCode ?? null,
      p_safe_metadata: metadata,
    });
    if (error) return { ok: false, errorCode: "PROMOTION_RPC_FAILED" };
    const row = firstRecord(data);
    if (row?.ok !== true) {
      return {
        ok: false,
        errorCode: typeof row?.error_code === "string"
          ? row.error_code
          : "PROMOTION_REJECTED",
      };
    }
    return {
      ok: true,
      promotionId: typeof row.promotion_id === "string" ? row.promotion_id : "",
      state: typeof row.state === "string" ? row.state : input.packet.toState,
    };
  } catch {
    return { ok: false, errorCode: "PROMOTION_RPC_FAILED" };
  }
}

export async function recordHarnessSloObservation(
  client: HarnessPromotionClient,
  input: {
    readonly sloId: string;
    readonly releaseId: string;
    readonly environment: "staging" | "production";
    readonly windowStartedAt: string;
    readonly windowEndedAt: string;
    readonly actual: number;
    readonly safeMetadata?: Record<string, unknown>;
  },
): Promise<{ ok: true; observationId: string } | { ok: false; errorCode: string }> {
  try {
    const { data, error } = await client.rpc("record_harness_slo_observation", {
      p_slo_id: input.sloId,
      p_release_id: input.releaseId,
      p_environment: input.environment,
      p_window_started_at: input.windowStartedAt,
      p_window_ended_at: input.windowEndedAt,
      p_actual: input.actual,
      p_safe_metadata: sanitizeHarnessMetadata(input.safeMetadata ?? {}),
    });
    if (error || typeof data !== "string") {
      return { ok: false, errorCode: "SLO_OBSERVATION_REJECTED" };
    }
    return { ok: true, observationId: data };
  } catch {
    return { ok: false, errorCode: "SLO_OBSERVATION_REJECTED" };
  }
}

export async function setHarnessKillSwitch(
  client: HarnessPromotionClient,
  input: {
    readonly environment: "preview" | "staging" | "production";
    readonly switchId: HarnessKillSwitch;
    readonly enabled: boolean;
    readonly reasonCode: string;
    readonly releaseId: string | null;
    readonly actorId: string;
    readonly safeMetadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("set_harness_kill_switch", {
      p_environment: input.environment,
      p_switch_id: input.switchId,
      p_enabled: input.enabled,
      p_reason_code: input.reasonCode,
      p_release_id: input.releaseId,
      p_actor_id: input.actorId,
      p_safe_metadata: sanitizeHarnessMetadata(input.safeMetadata ?? {}),
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function readHarnessKillSwitch(
  client: HarnessPromotionClient | null | undefined,
  input: {
    readonly environment: string;
    readonly switchId: HarnessKillSwitch;
  },
): Promise<{ enabled: boolean; reasonCode: string | null }> {
  if (!client || input.environment === "local") return { enabled: false, reasonCode: null };
  try {
    const { data, error } = await client.rpc("read_harness_kill_switch", {
      p_environment: input.environment,
      p_switch_id: input.switchId,
    });
    if (error) return { enabled: true, reasonCode: "KILL_SWITCH_READ_FAILED" };
    const row = firstRecord(data);
    if (!row) return { enabled: true, reasonCode: "KILL_SWITCH_READ_EMPTY" };
    return {
      enabled: row.enabled === true,
      reasonCode: typeof row.reason_code === "string" ? row.reason_code : null,
    };
  } catch {
    return { enabled: true, reasonCode: "KILL_SWITCH_READ_FAILED" };
  }
}

export async function assertHarnessCapabilityEnabled(
  client: HarnessPromotionClient | null | undefined,
  input: {
    readonly environment: string;
    readonly switches: readonly HarnessKillSwitch[];
  },
): Promise<{ allowed: true } | { allowed: false; switchId: HarnessKillSwitch; reasonCode: string }> {
  for (const switchId of input.switches) {
    const state = await readHarnessKillSwitch(client, {
      environment: input.environment,
      switchId,
    });
    if (state.enabled) {
      return {
        allowed: false,
        switchId,
        reasonCode: state.reasonCode ?? "KILL_SWITCH_ENABLED",
      };
    }
  }
  return { allowed: true };
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? row as Record<string, unknown> : null;
}
