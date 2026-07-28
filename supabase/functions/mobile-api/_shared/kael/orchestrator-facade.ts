import type { KaelPurpose } from "./types.ts";
import {
  auditKaelAutonomyGateResult,
  gateAutonomyDecision,
  type KaelAutonomyAuditClient,
  type KaelAutonomyDecisionSource,
  type KaelAutonomyGateInput,
  type KaelAutonomyGateResult,
} from "./kael-guardrails/autonomy-gate.ts";
import {
  runKaelPurposeStage,
  type KaelStageStatus,
} from "./orchestrator.ts";

export type KaelOrchestratorTelemetry = {
  label: string;
  purpose: KaelPurpose;
  provider: null;
  latency_ms: number;
  cost_usd: number;
  fallback_used: boolean;
  gate_result: KaelAutonomyGateResult["result"];
  reason_code: string;
  stage_success: boolean;
  stage_status: KaelStageStatus;
};

export type KaelAutonomyOrchestratorInput = KaelAutonomyGateInput & {
  label: string;
  timeoutMs?: number;
  audit?: {
    client: KaelAutonomyAuditClient;
    jobId: string | null;
    actorId: string | null;
    actorRole: "customer" | "worker" | "admin" | "system";
    source?: KaelAutonomyDecisionSource;
  };
};

export type KaelAutonomyOrchestratorResult = {
  gate: KaelAutonomyGateResult;
  telemetry: KaelOrchestratorTelemetry;
};

export async function runKaelAutonomyOrchestrator(
  input: KaelAutonomyOrchestratorInput,
): Promise<KaelAutonomyOrchestratorResult> {
  const purpose = input.authority.purpose;
  const stage = await runKaelPurposeStage<KaelAutonomyGateResult>({
    label: input.label,
    purpose,
    timeoutMs: input.timeoutMs ?? 500,
    run: () => Promise.resolve(gateAutonomyDecision(input)),
  });

  const gate = stage.value ?? gateAutonomyDecision({
    ...input,
    decision: {
      actor: "kael_system",
      action: "start_matching",
      policy_id: "kael.autonomy.invalid_stage_failure",
      evidence: [],
      confidence: 0,
      reversible: true,
      appealable: true,
      resulting_event: "kael_started_matching",
    },
  });

  if (input.audit) {
    await auditKaelAutonomyGateResult(input.audit.client, {
      jobId: input.audit.jobId,
      actorId: input.audit.actorId,
      actorRole: input.audit.actorRole,
      source: input.audit.source ?? input.source ?? "policy",
      gate,
    });
  }

  return {
    gate,
    telemetry: {
      label: input.label,
      purpose,
      provider: null,
      latency_ms: stage.elapsedMs,
      cost_usd: 0,
      fallback_used: stage.fallbackUsed,
      gate_result: gate.result,
      reason_code: gate.audit.reason_code,
      stage_success: stage.status === "ok",
      stage_status: stage.status,
    },
  };
}
