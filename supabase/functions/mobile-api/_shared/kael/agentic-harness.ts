import {
  evaluateKaelPathControl,
  type KaelMobileAction,
  type KaelWorkflowPhase,
  type KaelEdgeRoute,
} from "./path-control.ts";
import { buildKaelTraceEvent, type KaelSafeTraceEvent } from "./trace.ts";
import type { AIProvider, KaelPurpose } from "./types.ts";
import type { KaelActorRole } from "./kael-guardrails/permission-gate.ts";

export type KaelAgenticGoldenScenario = {
  readonly id: "P9" | "P10" | "P11" | "P12" | "P13";
  readonly title: string;
  readonly mobileAction: KaelMobileAction;
  readonly workflowPhase: KaelWorkflowPhase;
  readonly actorRole: KaelActorRole;
  readonly edgeRoute: KaelEdgeRoute;
  readonly kaelPurpose: KaelPurpose;
  readonly policyId: string;
  readonly expectedFallback: boolean;
  readonly expectedModelRouting: readonly {
    readonly provider: AIProvider;
    readonly model: string;
  }[];
};

export const KAEL_AGENTIC_GOLDEN_SCENARIOS: readonly KaelAgenticGoldenScenario[] = Object.freeze([
  {
    id: "P9",
    title: "normal transaction intake to estimate",
    mobileAction: "customer.submit_intake",
    workflowPhase: "intake",
    actorRole: "customer",
    edgeRoute: "POST /kael/chat",
    kaelPurpose: "intent_classification",
    policyId: "kael.path.customer_intake_to_estimate.v1",
    expectedFallback: false,
    expectedModelRouting: [
      { provider: "deepseek", model: "deepseek-v4-pro" },
      { provider: "anthropic", model: "claude-sonnet-5" },
    ],
  },
  {
    id: "P10",
    title: "demanding customer case chat revision",
    mobileAction: "customer.open_case_chat",
    workflowPhase: "offer_ready",
    actorRole: "customer",
    edgeRoute: "POST /kael/chat/:id",
    kaelPurpose: "clarification",
    policyId: "kael.path.customer_case_chat_revision.v1",
    expectedFallback: true,
    expectedModelRouting: [
      { provider: "deepseek", model: "deepseek-v4-pro" },
      { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    ],
  },
  {
    id: "P11",
    title: "worker cancellation review path",
    mobileAction: "worker.request_cancellation",
    workflowPhase: "cancellation",
    actorRole: "worker",
    edgeRoute: "POST /jobs/:id/worker-cancellation",
    kaelPurpose: "educational_response",
    policyId: "kael.autonomy.v2.worker_cancel_to_rematch",
    expectedFallback: true,
    expectedModelRouting: [
      { provider: "deepseek", model: "deepseek-v4-pro" },
      { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    ],
  },
  {
    id: "P12",
    title: "customer cancellation review path",
    mobileAction: "customer.request_cancellation",
    workflowPhase: "cancellation",
    actorRole: "customer",
    edgeRoute: "POST /jobs/:id/customer-cancellation",
    kaelPurpose: "educational_response",
    policyId: "kael.autonomy.v2.customer_cancel_after_accept",
    expectedFallback: true,
    expectedModelRouting: [
      { provider: "deepseek", model: "deepseek-v4-pro" },
      { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    ],
  },
  {
    id: "P13",
    title: "dispute neutral summary path",
    mobileAction: "system.open_dispute",
    workflowPhase: "dispute",
    actorRole: "system",
    edgeRoute: "POST /jobs/:id/disputes",
    kaelPurpose: "educational_response",
    policyId: "kael.autonomy.v2.dispute_resolution",
    expectedFallback: true,
    expectedModelRouting: [
      { provider: "deepseek", model: "deepseek-v4-pro" },
      { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
    ],
  },
]);

export function evaluateKaelAgenticGoldenScenario(
  scenario: KaelAgenticGoldenScenario,
): { allowed: boolean; trace: KaelSafeTraceEvent } {
  const path = evaluateKaelPathControl({
    mobileAction: scenario.mobileAction,
    workflowPhase: scenario.workflowPhase,
    actorRole: scenario.actorRole,
    edgeRoute: scenario.edgeRoute,
    kaelPurpose: scenario.kaelPurpose,
  });
  const trace = buildKaelTraceEvent({
    workflow_phase: scenario.workflowPhase,
    actor_role: scenario.actorRole,
    action: scenario.mobileAction,
    policy_id: scenario.policyId,
    purpose: scenario.kaelPurpose,
    provider: scenario.expectedModelRouting[0]?.provider ?? null,
    model: scenario.expectedModelRouting[0]?.model ?? null,
    latency_ms: 0,
    cost_usd: 0,
    validation: { status: "pass" },
    fallback: {
      used: scenario.expectedFallback,
      reason_code: scenario.expectedFallback ? "SCENARIO_SAFE_FALLBACK_ALLOWED" : null,
    },
    confidence: scenario.expectedFallback ? 0.4 : 0.8,
    safe_metadata: {
      scenario_id: scenario.id,
      route_count: scenario.expectedModelRouting.length,
    },
  });
  return { allowed: path.allowed, trace };
}
