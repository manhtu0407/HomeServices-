import type { JobStatus } from "../../_shared/domain.ts";
import {
  type KaelAutonomyDecision,
  kaelAutonomyDecisionSchema,
} from "./kael/artifact-contract.ts";
import { validateTransition } from "./lifecycle.ts";

export type WorkflowTransitionEvent =
  | "ai_estimate_ready"
  | "kael_failed"
  | "ai_explanation_ready"
  | "kael_confirmed_ticket"
  | "kael_started_matching"
  | "customer_confirmed_ticket"
  | "matching_started"
  | "worker_accepted"
  | "worker_status_advanced"
  | "scope_change_requested"
  | "kael_decided_scope_change"
  | "scope_change_decided"
  | "worker_completed"
  | "kael_confirmed_completion"
  | "customer_confirmed_completion"
  | "kael_decided_payment"
  | "payment_confirmed"
  | "kael_decided_dispute"
  | "review_submitted"
  | "kael_processed_cancellation"
  | "cancel_requested";

export type WorkflowCommandEvent =
  | "customer_cancellation_requested"
  | "worker_cancellation_requested"
  | "job_media_attached";

export type WorkflowMediaStage =
  | "before"
  | "after"
  | "kael_reference"
  | "cancellation_evidence"
  | "scope_change_evidence"
  | "access_check_in";

export type WorkflowTransitionInput = {
  event: WorkflowTransitionEvent;
  from: JobStatus;
  to: JobStatus;
};

export type WorkflowCommandInput = {
  event: WorkflowCommandEvent;
  status: JobStatus;
  mediaStage?: WorkflowMediaStage;
};

export type WorkflowTransitionResult =
  | {
    valid: true;
    event: WorkflowTransitionEvent;
    from: JobStatus;
    to: JobStatus;
    timestampColumn: string | null;
  }
  | {
    valid: false;
    event: WorkflowTransitionEvent;
    from: JobStatus;
    to: JobStatus;
    error: string;
  };

export type WorkflowCommandResult =
  | {
    valid: true;
    event: WorkflowCommandEvent;
    status: JobStatus;
  }
  | {
    valid: false;
    event: WorkflowCommandEvent;
    status: JobStatus;
    error: string;
  };

export type KaelAutonomyTransitionInput = {
  decision: KaelAutonomyDecision;
  from: JobStatus;
  to: JobStatus;
};

export type KaelAutonomyTransitionResult =
  | (Extract<WorkflowTransitionResult, { valid: true }> & { decision: KaelAutonomyDecision })
  | (Extract<WorkflowTransitionResult, { valid: false }> & { decision?: KaelAutonomyDecision });

const WORKFLOW_EVENT_TRANSITIONS: Record<WorkflowTransitionEvent, ReadonlyArray<readonly [JobStatus, JobStatus]>> = {
  ai_estimate_ready: [["analyzing", "awaiting_customer_confirm"]],
  kael_failed: [["analyzing", "cancelled"]],
  ai_explanation_ready: [["estimate_ready", "awaiting_customer_confirm"]],
  kael_confirmed_ticket: [
    ["analyzing", "broadcasting"],
    ["estimate_ready", "broadcasting"],
    ["awaiting_customer_confirm", "broadcasting"],
  ],
  kael_started_matching: [
    ["analyzing", "broadcasting"],
    ["estimate_ready", "broadcasting"],
    ["awaiting_customer_confirm", "broadcasting"],
  ],
  customer_confirmed_ticket: [["awaiting_customer_confirm", "broadcasting"]],
  matching_started: [["awaiting_customer_confirm", "broadcasting"]],
  worker_accepted: [["broadcasting", "worker_matched"]],
  worker_status_advanced: [
    ["worker_matched", "worker_on_way"],
    ["worker_on_way", "arrived"],
    ["arrived", "inspecting"],
    ["inspecting", "repairing"],
  ],
  scope_change_requested: [
    ["inspecting", "scope_change_pending"],
    ["repairing", "scope_change_pending"],
  ],
  kael_decided_scope_change: [
    ["scope_change_pending", "repairing"],
    ["scope_change_pending", "cancelled"],
  ],
  scope_change_decided: [
    ["scope_change_pending", "repairing"],
    ["scope_change_pending", "cancelled"],
  ],
  worker_completed: [["repairing", "completed_by_worker"]],
  kael_confirmed_completion: [["completed_by_worker", "confirmed_by_customer"]],
  customer_confirmed_completion: [["completed_by_worker", "confirmed_by_customer"]],
  kael_decided_payment: [["confirmed_by_customer", "payment_pending"]],
  payment_confirmed: [["payment_pending", "paid"]],
  kael_decided_dispute: [
    ["completed_by_worker", "confirmed_by_customer"],
    ["confirmed_by_customer", "reviewed"],
  ],
  review_submitted: [
    ["confirmed_by_customer", "reviewed"],
    ["paid", "reviewed"],
  ],
  kael_processed_cancellation: [
    ["draft", "cancelled"],
    ["analyzing", "cancelled"],
    ["awaiting_customer_confirm", "cancelled"],
    ["broadcasting", "cancelled"],
    ["worker_matched", "broadcasting"],
    ["worker_on_way", "broadcasting"],
    ["arrived", "broadcasting"],
    ["inspecting", "broadcasting"],
    ["repairing", "broadcasting"],
    ["scope_change_pending", "broadcasting"],
    ["worker_matched", "cancelled"],
    ["worker_on_way", "cancelled"],
    ["arrived", "cancelled"],
    ["inspecting", "cancelled"],
    ["repairing", "cancelled"],
    ["scope_change_pending", "cancelled"],
  ],
  cancel_requested: [
    ["draft", "cancelled"],
    ["analyzing", "cancelled"],
    ["awaiting_customer_confirm", "cancelled"],
    ["broadcasting", "cancelled"],
  ],
};

const KAEL_AUTONOMY_ACTION_EVENTS: Record<KaelAutonomyDecision["action"], readonly WorkflowTransitionEvent[]> = {
  confirm_ticket: ["kael_confirmed_ticket", "kael_started_matching"],
  start_matching: ["kael_started_matching"],
  process_cancellation: ["kael_processed_cancellation"],
  decide_scope_change: ["kael_decided_scope_change"],
  confirm_completion: ["kael_confirmed_completion"],
  decide_payment: ["kael_decided_payment"],
  decide_dispute: ["kael_decided_dispute"],
};

const CUSTOMER_CANCELLATION_REQUEST_STATUSES: readonly JobStatus[] = [
  "awaiting_customer_confirm",
  "broadcasting",
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
];

const WORKER_CANCELLATION_REQUEST_STATUSES: readonly JobStatus[] = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
];

const MEDIA_STAGE_STATUSES: Record<WorkflowMediaStage, readonly JobStatus[]> = {
  before: ["draft", "analyzing", "estimate_ready", "awaiting_customer_confirm", "broadcasting"],
  kael_reference: ["draft", "analyzing", "estimate_ready", "awaiting_customer_confirm", "broadcasting"],
  after: ["repairing", "completed_by_worker"],
  cancellation_evidence: [
    "worker_matched",
    "worker_on_way",
    "arrived",
    "inspecting",
    "repairing",
    "scope_change_pending",
  ],
  scope_change_evidence: ["inspecting", "repairing", "scope_change_pending"],
  // §32.7: lobby check-in photo is taken while the worker is still `worker_on_way`
  // (the status flips to `arrived` only after the check-in upload succeeds);
  // `arrived` stays allowed for a retry after a partial failure.
  access_check_in: ["worker_on_way", "arrived"],
};

function invalidWorkflowCommand(input: WorkflowCommandInput): WorkflowCommandResult {
  return {
    valid: false,
    event: input.event,
    status: input.status,
    error: "Tr\u1ea1ng th\u00e1i hi\u1ec7n t\u1ea1i ch\u01b0a cho ph\u00e9p h\u00e0nh \u0111\u1ed9ng n\u00e0y. Vui l\u00f2ng t\u1ea3i l\u1ea1i v\u00e0 th\u1eed l\u1ea1i.",
  };
}

export function validateWorkflowTransition(input: WorkflowTransitionInput): WorkflowTransitionResult {
  const allowedTransitions = WORKFLOW_EVENT_TRANSITIONS[input.event] ?? [];
  const eventAllowsTransition = allowedTransitions.some(
    ([from, to]) => from === input.from && to === input.to,
  );
  if (!eventAllowsTransition) {
    return {
      valid: false,
      event: input.event,
      from: input.from,
      to: input.to,
      error: "Tr\u1ea1ng th\u00e1i kh\u00f4ng kh\u1edbp v\u1edbi b\u01b0\u1edbc x\u1eed l\u00fd hi\u1ec7n t\u1ea1i. Vui l\u00f2ng t\u1ea3i l\u1ea1i v\u00e0 th\u1eed l\u1ea1i.",
    };
  }

  const result = validateTransition(input.from, input.to);
  if (!result.valid) {
    return {
      valid: false,
      event: input.event,
      from: input.from,
      to: input.to,
      error: result.error,
    };
  }

  return {
    valid: true,
    event: input.event,
    from: input.from,
    to: input.to,
    timestampColumn: result.timestampColumn,
  };
}

export function validateKaelAutonomyTransition(
  input: KaelAutonomyTransitionInput,
): KaelAutonomyTransitionResult {
  const decisionResult = kaelAutonomyDecisionSchema.safeParse(input.decision);
  if (!decisionResult.success) {
    return {
      valid: false,
      event: input.decision.resulting_event,
      from: input.from,
      to: input.to,
      error: "Quyết định tự động của Kael không đạt schema kiểm soát.",
    };
  }

  const decision = decisionResult.data;
  const allowedEvents = KAEL_AUTONOMY_ACTION_EVENTS[decision.action];
  if (!allowedEvents.includes(decision.resulting_event)) {
    return {
      valid: false,
      event: decision.resulting_event,
      from: input.from,
      to: input.to,
      decision,
      error: "Quyết định tự động của Kael không khớp hành động workflow.",
    };
  }

  const transition = validateWorkflowTransition({
    event: decision.resulting_event,
    from: input.from,
    to: input.to,
  });
  return transition.valid
    ? { ...transition, decision }
    : { ...transition, decision };
}

export function validateWorkflowCommand(input: WorkflowCommandInput): WorkflowCommandResult {
  if (input.event === "customer_cancellation_requested") {
    return CUSTOMER_CANCELLATION_REQUEST_STATUSES.includes(input.status)
      ? { valid: true, event: input.event, status: input.status }
      : invalidWorkflowCommand(input);
  }

  if (input.event === "worker_cancellation_requested") {
    return WORKER_CANCELLATION_REQUEST_STATUSES.includes(input.status)
      ? { valid: true, event: input.event, status: input.status }
      : invalidWorkflowCommand(input);
  }

  if (!input.mediaStage) return invalidWorkflowCommand(input);
  const allowedStatuses = MEDIA_STAGE_STATUSES[input.mediaStage] ?? [];
  return allowedStatuses.includes(input.status)
    ? { valid: true, event: input.event, status: input.status }
    : invalidWorkflowCommand(input);
}
