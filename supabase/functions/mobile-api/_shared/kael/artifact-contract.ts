import { z } from "zod";

export const kaelArtifactTypeSchema = z.enum([
  "service_request",
  "process_ticket",
  "ai_diagnosis",
  "ai_notes",
  "estimate",
  "provider_match",
  "booking",
  "scope_change",
  "completion_evidence",
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
