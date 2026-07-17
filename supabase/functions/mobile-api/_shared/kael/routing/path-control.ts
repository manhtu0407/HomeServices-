import type { KaelPurpose } from "../types.ts";
import type { KaelActorRole } from "../guards/permission-gate.ts";

export type KaelWorkflowPhase =
  | "intake"
  | "kael_analyzing"
  | "offer_ready"
  | "matching"
  | "matched"
  | "on_the_way"
  | "arrived"
  | "in_progress"
  | "plan_price_adjust"
  | "completion"
  | "payment"
  | "review"
  | "cancellation"
  | "dispute";

export type KaelMobileAction =
  | "customer.submit_intake"
  | "customer.open_case_chat"
  | "customer.confirm_offer"
  | "customer.request_cancellation"
  | "customer.open_dispute"
  | "worker.ask_kael"
  | "worker.open_job_incident"
  | "worker.propose_scope_from_incident"
  | "worker.request_scope_change"
  | "worker.request_cancellation"
  | "worker.open_dispute"
  | "worker.submit_completion_evidence"
  | "system.open_dispute";

export type KaelEdgeRoute =
  | "POST /kael/chat"
  | "POST /kael/chat/:id"
  | "POST /kael/chat/:id/confirm"
  | "POST /jobs/:id/cancel"
  | "POST /jobs/:id/customer-cancellation"
  | "POST /jobs/:id/kael-clarify"
  | "POST /jobs/:id/kael-incident"
  | "POST /jobs/:id/kael-incident/propose-scope"
  | "POST /workers/me/kael/chat/:id"
  | "POST /jobs/:id/scope-change"
  | "POST /jobs/:id/worker-cancellation"
  | "POST /jobs/:id/media"
  | "POST /jobs/:id/disputes";

export type KaelPathControlRule = {
  readonly mobile_action: KaelMobileAction;
  readonly workflow_phase: KaelWorkflowPhase;
  readonly actor_role: KaelActorRole;
  readonly edge_route: KaelEdgeRoute;
  readonly kael_purpose: KaelPurpose;
  readonly policy_id: string;
};

export type KaelPathControlRequest = {
  readonly mobileAction: KaelMobileAction | string;
  readonly workflowPhase: KaelWorkflowPhase | string;
  readonly actorRole: KaelActorRole | string;
  readonly edgeRoute: KaelEdgeRoute | string;
  readonly kaelPurpose: KaelPurpose | string;
};

export type KaelPathControlDecision = {
  readonly allowed: boolean;
  readonly reason_code: string;
  readonly rule?: KaelPathControlRule;
  readonly safe_metadata: {
    readonly mobile_action: string;
    readonly workflow_phase: string;
    readonly actor_role: string;
    readonly edge_route: string;
    readonly kael_purpose: string;
    readonly policy_id: string | null;
    readonly expected_actor_role?: string;
    readonly expected_workflow_phase?: string;
    readonly expected_edge_route?: string;
    readonly expected_kael_purpose?: string;
  };
};

export const KAEL_PATH_CONTROL_RULES: readonly KaelPathControlRule[] = Object.freeze([
  {
    mobile_action: "customer.submit_intake",
    workflow_phase: "intake",
    actor_role: "customer",
    edge_route: "POST /kael/chat",
    kael_purpose: "intent_classification",
    policy_id: "kael.path.customer_intake_to_estimate.v1",
  },
  {
    mobile_action: "customer.open_case_chat",
    workflow_phase: "offer_ready",
    actor_role: "customer",
    edge_route: "POST /kael/chat/:id",
    kael_purpose: "clarification",
    policy_id: "kael.path.customer_case_chat_revision.v1",
  },
  {
    mobile_action: "customer.confirm_offer",
    workflow_phase: "offer_ready",
    actor_role: "customer",
    edge_route: "POST /kael/chat/:id/confirm",
    kael_purpose: "price_synthesis",
    policy_id: "kael.autonomy.v2.chat_estimate_to_matching",
  },
  {
    mobile_action: "customer.request_cancellation",
    workflow_phase: "cancellation",
    actor_role: "customer",
    edge_route: "POST /jobs/:id/cancel",
    kael_purpose: "educational_response",
    policy_id: "kael.autonomy.v2.customer_cancel_before_accept",
  },
  {
    mobile_action: "customer.request_cancellation",
    workflow_phase: "cancellation",
    actor_role: "customer",
    edge_route: "POST /jobs/:id/customer-cancellation",
    kael_purpose: "educational_response",
    policy_id: "kael.autonomy.v2.customer_cancel_after_accept",
  },
  {
    mobile_action: "worker.ask_kael",
    workflow_phase: "in_progress",
    actor_role: "worker",
    edge_route: "POST /workers/me/kael/chat/:id",
    kael_purpose: "worker_assist",
    policy_id: "kael.path.worker_assist_own_job.v1",
  },
  {
    mobile_action: "worker.ask_kael",
    workflow_phase: "in_progress",
    actor_role: "worker",
    edge_route: "POST /jobs/:id/kael-clarify",
    kael_purpose: "worker_assist",
    policy_id: "kael.path.worker_assist_own_job.v1",
  },
  {
    mobile_action: "worker.request_scope_change",
    workflow_phase: "plan_price_adjust",
    actor_role: "worker",
    edge_route: "POST /jobs/:id/scope-change",
    kael_purpose: "scope_change",
    policy_id: "kael.autonomy.v2.scope_change_review",
  },
  {
    mobile_action: "worker.open_job_incident",
    workflow_phase: "plan_price_adjust",
    actor_role: "worker",
    edge_route: "POST /jobs/:id/kael-incident",
    kael_purpose: "job_incident",
    policy_id: "kael.case-work.job-incident.v1",
  },
  {
    mobile_action: "worker.propose_scope_from_incident",
    workflow_phase: "plan_price_adjust",
    actor_role: "worker",
    edge_route: "POST /jobs/:id/kael-incident/propose-scope",
    kael_purpose: "scope_change",
    policy_id: "kael.autonomy.v2.scope_change_review",
  },
  {
    mobile_action: "worker.request_cancellation",
    workflow_phase: "cancellation",
    actor_role: "worker",
    edge_route: "POST /jobs/:id/worker-cancellation",
    kael_purpose: "educational_response",
    policy_id: "kael.autonomy.v2.worker_cancel_to_rematch",
  },
  {
    mobile_action: "worker.submit_completion_evidence",
    workflow_phase: "completion",
    actor_role: "worker",
    edge_route: "POST /jobs/:id/media",
    kael_purpose: "worker_brief",
    policy_id: "kael.autonomy.v2.customer_completion_acceptance",
  },
  {
    mobile_action: "customer.open_dispute",
    workflow_phase: "dispute",
    actor_role: "customer",
    edge_route: "POST /jobs/:id/disputes",
    kael_purpose: "educational_response",
    policy_id: "kael.autonomy.v2.dispute_resolution",
  },
  {
    mobile_action: "worker.open_dispute",
    workflow_phase: "dispute",
    actor_role: "worker",
    edge_route: "POST /jobs/:id/disputes",
    kael_purpose: "educational_response",
    policy_id: "kael.autonomy.v2.dispute_resolution",
  },
  {
    mobile_action: "system.open_dispute",
    workflow_phase: "dispute",
    actor_role: "system",
    edge_route: "POST /jobs/:id/disputes",
    kael_purpose: "educational_response",
    policy_id: "kael.autonomy.v2.dispute_resolution",
  },
]);

export function evaluateKaelPathControl(
  request: KaelPathControlRequest,
): KaelPathControlDecision {
  const rules = KAEL_PATH_CONTROL_RULES.filter((candidate) =>
    candidate.mobile_action === request.mobileAction
  );
  if (rules.length === 0) return deny(request, "PATH_CONTROL_UNKNOWN_ACTION", null);
  const actorRule = rules.find((rule) => rule.actor_role === request.actorRole);
  if (!actorRule) return deny(request, "PATH_CONTROL_ACTOR_MISMATCH", rules[0] ?? null);
  const phaseRule = rules.find((rule) =>
    rule.actor_role === request.actorRole &&
    rule.workflow_phase === request.workflowPhase
  );
  if (!phaseRule) return deny(request, "PATH_CONTROL_PHASE_MISMATCH", actorRule);
  const routeRule = rules.find((rule) =>
    rule.actor_role === request.actorRole &&
    rule.workflow_phase === request.workflowPhase &&
    rule.edge_route === request.edgeRoute
  );
  if (!routeRule) return deny(request, "PATH_CONTROL_ROUTE_MISMATCH", phaseRule);
  const rule = rules.find((candidate) =>
    candidate.actor_role === request.actorRole &&
    candidate.workflow_phase === request.workflowPhase &&
    candidate.edge_route === request.edgeRoute &&
    candidate.kael_purpose === request.kaelPurpose
  );
  if (!rule) return deny(request, "PATH_CONTROL_PURPOSE_MISMATCH", routeRule);
  return {
    allowed: true,
    reason_code: "PATH_CONTROL_ALLOWED",
    rule,
    safe_metadata: metadata(request, rule),
  };
}

function deny(
  request: KaelPathControlRequest,
  reasonCode: string,
  rule: KaelPathControlRule | null,
): KaelPathControlDecision {
  return {
    allowed: false,
    reason_code: reasonCode,
    ...(rule ? { rule } : {}),
    safe_metadata: metadata(request, rule),
  };
}

function metadata(
  request: KaelPathControlRequest,
  rule: KaelPathControlRule | null,
): KaelPathControlDecision["safe_metadata"] {
  return {
    mobile_action: request.mobileAction,
    workflow_phase: request.workflowPhase,
    actor_role: request.actorRole,
    edge_route: request.edgeRoute,
    kael_purpose: request.kaelPurpose,
    policy_id: rule?.policy_id ?? null,
    ...(rule
      ? {
        expected_actor_role: rule.actor_role,
        expected_workflow_phase: rule.workflow_phase,
        expected_edge_route: rule.edge_route,
        expected_kael_purpose: rule.kael_purpose,
      }
      : {}),
  };
}
