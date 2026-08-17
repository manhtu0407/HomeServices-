import type { UserRole } from "../../_shared/domain.ts";
import {
  evaluateKaelPathControl,
  type KaelEdgeRoute,
  type KaelMobileAction,
  type KaelWorkflowPhase,
} from "./kael/kael-guardrails/path-control.ts";
import type { KaelPurpose } from "./kael/contracts/types.ts";

type RouteLike = {
  readonly kind: string;
};

type KaelRuntimePathControlRoute = {
  readonly mobileAction: KaelMobileAction;
  readonly workflowPhase: KaelWorkflowPhase;
  readonly edgeRoute: KaelEdgeRoute;
  readonly kaelPurpose: KaelPurpose;
};

export type KaelRuntimePathControlFailure = {
  readonly code: "KAEL_PATH_CONTROL_DENIED";
  readonly message: string;
  readonly status: 403;
  readonly extra: Record<string, unknown>;
};

type ApiFailureFn = (
  code: KaelRuntimePathControlFailure["code"],
  message: string,
  status: KaelRuntimePathControlFailure["status"],
  extra?: Record<string, unknown>,
) => never;

const KAEL_RUNTIME_PATH_CONTROL: Partial<Record<string, KaelRuntimePathControlRoute>> = {
  "kael.chat.create": {
    mobileAction: "customer.submit_intake",
    workflowPhase: "intake",
    edgeRoute: "POST /kael/chat",
    kaelPurpose: "intent_classification",
  },
  "kael.chat.turn": {
    mobileAction: "customer.open_case_chat",
    workflowPhase: "offer_ready",
    edgeRoute: "POST /kael/chat/:id",
    kaelPurpose: "clarification",
  },
  "kael.chat.stream": {
    mobileAction: "customer.open_case_chat",
    workflowPhase: "offer_ready",
    edgeRoute: "POST /kael/chat/:id",
    kaelPurpose: "clarification",
  },
  "kael.chat.confirm": {
    mobileAction: "customer.confirm_offer",
    workflowPhase: "offer_ready",
    edgeRoute: "POST /kael/chat/:id/confirm",
    kaelPurpose: "price_synthesis",
  },
  "jobs.cancel": {
    mobileAction: "customer.request_cancellation",
    workflowPhase: "cancellation",
    edgeRoute: "POST /jobs/:id/cancel",
    kaelPurpose: "educational_response",
  },
  "jobs.customerCancellation": {
    mobileAction: "customer.request_cancellation",
    workflowPhase: "cancellation",
    edgeRoute: "POST /jobs/:id/customer-cancellation",
    kaelPurpose: "educational_response",
  },
  "jobs.openDispute": {
    mobileAction: "customer.open_dispute",
    workflowPhase: "dispute",
    edgeRoute: "POST /jobs/:id/disputes",
    kaelPurpose: "educational_response",
  },
  "jobs.scopeChange": {
    mobileAction: "worker.request_scope_change",
    workflowPhase: "plan_price_adjust",
    edgeRoute: "POST /jobs/:id/scope-change",
    kaelPurpose: "scope_change",
  },
  "jobs.kaelIncidentOpen": {
    mobileAction: "worker.open_job_incident",
    workflowPhase: "plan_price_adjust",
    edgeRoute: "POST /jobs/:id/kael-incident",
    kaelPurpose: "job_incident",
  },
  "jobs.kaelIncidentPreviewScope": {
    mobileAction: "worker.preview_scope_from_incident",
    workflowPhase: "plan_price_adjust",
    edgeRoute: "POST /jobs/:id/kael-incident/preview-scope",
    kaelPurpose: "scope_change",
  },
  "jobs.kaelIncidentProposeScope": {
    mobileAction: "worker.propose_scope_from_incident",
    workflowPhase: "plan_price_adjust",
    edgeRoute: "POST /jobs/:id/kael-incident/propose-scope",
    kaelPurpose: "scope_change",
  },
  "jobs.kaelClarify": {
    mobileAction: "worker.ask_kael",
    workflowPhase: "in_progress",
    edgeRoute: "POST /jobs/:id/kael-clarify",
    kaelPurpose: "worker_assist",
  },
  "jobs.workerCancellation": {
    mobileAction: "worker.request_cancellation",
    workflowPhase: "cancellation",
    edgeRoute: "POST /jobs/:id/worker-cancellation",
    kaelPurpose: "educational_response",
  },
  "workers.kaelChat.turn": {
    mobileAction: "worker.ask_kael",
    workflowPhase: "in_progress",
    edgeRoute: "POST /workers/me/kael/chat/:id",
    kaelPurpose: "worker_assist",
  },
  "workers.kaelChat.stream": {
    mobileAction: "worker.ask_kael",
    workflowPhase: "in_progress",
    edgeRoute: "POST /workers/me/kael/chat/:id",
    kaelPurpose: "worker_assist",
  },
};

function evaluateKaelRuntimePathControl(
  route: RouteLike,
  actorRole: UserRole,
): KaelRuntimePathControlFailure | null {
  const control = KAEL_RUNTIME_PATH_CONTROL[route.kind];
  if (!control) return null;
  const decision = evaluateKaelPathControl({
    mobileAction: control.mobileAction,
    workflowPhase: control.workflowPhase,
    actorRole,
    edgeRoute: control.edgeRoute,
    kaelPurpose: control.kaelPurpose,
  });
  if (decision.allowed) return null;
  console.warn("kael path-control denied", {
    reasonCode: decision.reason_code,
    routeKind: route.kind,
    actorRole,
    edgeRoute: control.edgeRoute,
    kaelPurpose: control.kaelPurpose,
  });
  return {
    code: "KAEL_PATH_CONTROL_DENIED",
    message: "Kael chưa thể thực hiện hành động này ở bước hiện tại.",
    status: 403,
    extra: {
      ...decision.safe_metadata,
      reason_code: decision.reason_code,
    },
  };
}

export function enforceKaelRuntimePathControl(
  route: RouteLike,
  actorRole: UserRole,
  fail: ApiFailureFn,
): void {
  const failure = evaluateKaelRuntimePathControl(route, actorRole);
  if (!failure) return;
  fail(failure.code, failure.message, failure.status, failure.extra);
}
