import { z } from "zod";

export const kaelArtifactTypeSchema = z.enum([
  "service_request",
  "process_ticket",
  "ai_diagnosis",
  "ai_notes",
  "estimate",
  "provider_match",
  "worker_brief",
  "booking",
  "scope_change",
  "cancellation_review",
  "completion_evidence",
  "completion_review",
  "dispute_decision",
  "payment_decision",
  "review",
]);

export const kaelArtifactVisibilitySchema = z.enum([
  "internal",
  "partial",
  "customer_review",
  "worker_visible",
  "final",
]);

export const kaelArtifactEstimateSchema = z.object({
  price_min: z.number().int().positive(),
  price_max: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  disclaimer: z.string().min(1).max(500),
}).strict().refine((value) => value.price_max >= value.price_min, {
  message: "price_max must be >= price_min",
  path: ["price_max"],
});

export const kaelAutonomyActionSchema = z.enum([
  "confirm_ticket",
  "start_matching",
  "process_cancellation",
  "decide_scope_change",
  "confirm_completion",
  "decide_payment",
  "decide_dispute",
]);

export const kaelAutonomyEventSchema = z.enum([
  "kael_confirmed_ticket",
  "kael_started_matching",
  "kael_processed_cancellation",
  "kael_decided_scope_change",
  "kael_confirmed_completion",
  "kael_decided_payment",
  "kael_decided_dispute",
]);

export const kaelAutonomyEvidenceSchema = z.object({
  kind: z.enum(["artifact", "job_event", "policy", "worker_evidence", "customer_input", "system_check"]),
  reference_id: z.string().min(1).max(160),
  summary: z.string().min(1).max(280).optional(),
}).strict();

export const kaelAutonomyDecisionSchema = z.object({
  actor: z.literal("kael_system"),
  action: kaelAutonomyActionSchema,
  policy_id: z.string().min(3).max(120),
  evidence: z.array(kaelAutonomyEvidenceSchema).min(1).max(12),
  confidence: z.number().min(0).max(1),
  reversible: z.boolean(),
  appealable: z.boolean(),
  resulting_event: kaelAutonomyEventSchema,
}).strict();

export type KaelAutonomyDecision = z.infer<typeof kaelAutonomyDecisionSchema>;

const FORBIDDEN_WORKFLOW_KEYS = new Set([
  "status",
  "currentStatus",
  "current_status",
  "jobStatus",
  "job_status",
  "nextStatus",
  "next_status",
  "fromStatus",
  "from_status",
  "toStatus",
  "to_status",
  "phase",
  "currentPhase",
  "current_phase",
  "workflowPhase",
  "workflow_phase",
  "workflowStatus",
  "workflow_status",
  "workflowEvent",
  "workflow_event",
  "transitionEvent",
  "transition_event",
]);

function hasForbiddenWorkflowKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => hasForbiddenWorkflowKey(item));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_WORKFLOW_KEYS.has(key) || hasForbiddenWorkflowKey(nested)
  );
}

export const kaelTicketPatchSchema = z.record(z.string(), z.unknown()).refine(
  (value) => !hasForbiddenWorkflowKey(value),
  { message: "ticket_patch must not include workflow status or phase fields" },
);

export const kaelArtifactProposalSchema = z.object({
  artifact_type: kaelArtifactTypeSchema,
  visibility: kaelArtifactVisibilitySchema,
  confidence: z.number().min(0).max(1),
  missing_fields: z.array(z.string().min(1).max(80)).max(12),
  may_transition: z.literal(false),
  ticket_patch: kaelTicketPatchSchema.optional(),
  estimate: kaelArtifactEstimateSchema.optional(),
  recommended_next_question: z.string().min(1).max(240).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.artifact_type === "estimate" && !value.estimate) {
    ctx.addIssue({
      code: "custom",
      message: "estimate artifact proposals must include estimate",
      path: ["estimate"],
    });
  }
  if (value.artifact_type !== "estimate" && value.estimate) {
    ctx.addIssue({
      code: "custom",
      message: "estimate payload is only valid for estimate artifacts",
      path: ["estimate"],
    });
  }
});

export type KaelArtifactProposal = z.infer<typeof kaelArtifactProposalSchema>;

export function buildKaelAutonomyDecision(input: {
  action: z.infer<typeof kaelAutonomyActionSchema>;
  policyId: string;
  evidence: readonly z.infer<typeof kaelAutonomyEvidenceSchema>[];
  confidence: number;
  resultingEvent: z.infer<typeof kaelAutonomyEventSchema>;
  reversible: boolean;
  appealable: boolean;
}): KaelAutonomyDecision {
  return kaelAutonomyDecisionSchema.parse({
    actor: "kael_system",
    action: input.action,
    policy_id: input.policyId,
    evidence: [...input.evidence],
    confidence: Math.max(0, Math.min(1, input.confidence)),
    reversible: input.reversible,
    appealable: input.appealable,
    resulting_event: input.resultingEvent,
  });
}

export function buildKaelMissingInfoArtifactProposal(input: {
  missingFields: readonly string[];
  question: string;
  confidence?: number;
  artifactType?: Extract<KaelArtifactProposal["artifact_type"], "process_ticket" | "ai_notes" | "ai_diagnosis">;
}): KaelArtifactProposal {
  return kaelArtifactProposalSchema.parse({
    artifact_type: input.artifactType ?? "process_ticket",
    visibility: "partial",
    confidence: Math.max(0, Math.min(1, input.confidence ?? 0.4)),
    missing_fields: [...input.missingFields],
    may_transition: false,
    recommended_next_question: input.question,
  });
}
