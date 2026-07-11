import { z } from "zod";
import {
  getKaelPerformanceProfile,
  KAEL_CASE_WORK_SERVICE_TYPES,
  KAEL_PERFORMANCE_PROFILE_IDS,
  type KaelCaseWorkServiceType,
} from "./performance-profiles.ts";

export const KAEL_CASE_WORK_PHASES = Object.freeze([
  "analysis",
  "offer_review",
  "matching",
  "worker_candidate_review",
  "worker_en_route",
  "service_execution",
  "scope_change_review",
  "completion_review",
  "payment",
  "review",
  "closed",
] as const);

const kaelCaseFactValueSchema = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(500)).max(30),
  z.null(),
]);

export const kaelCaseEvidenceSchema = z.object({
  kind: z.enum([
    "photo",
    "video_frame",
    "video_original_private",
    "voice_transcript",
    "text_note",
  ]),
  ref: z.string().max(1000).optional(),
  transcript: z.string().trim().min(1).max(5000).optional(),
  summary: z.string().trim().min(1).max(1000).optional(),
  model_eligible: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (
    (value.kind === "photo" || value.kind === "video_frame" || value.kind === "video_original_private") &&
    !value.ref
  ) {
    ctx.addIssue({ code: "custom", path: ["ref"], message: `${value.kind} requires a private ref` });
  }
  if ((value.kind === "voice_transcript" || value.kind === "text_note") && !value.transcript) {
    ctx.addIssue({ code: "custom", path: ["transcript"], message: `${value.kind} requires reviewed text` });
  }
  if (value.kind === "voice_transcript" && value.ref) {
    ctx.addIssue({ code: "custom", path: ["ref"], message: "Raw voice media must not accompany a transcript" });
  }
  if (value.kind === "video_original_private" && value.model_eligible) {
    ctx.addIssue({ code: "custom", path: ["model_eligible"], message: "Original video is private human evidence only" });
  }
  if (
    (value.kind === "photo" || value.kind === "video_frame") &&
    value.ref &&
    !/^supabase:\/\/kael-chat-media\/[^/\s?#]+\/kael-chat\/model_vision\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i.test(value.ref)
  ) {
    ctx.addIssue({ code: "custom", path: ["ref"], message: "Model evidence requires a private model_vision ref" });
  }
  if (
    value.kind === "video_original_private" &&
    value.ref &&
    !/^supabase:\/\/kael-chat-media\/[^/\s?#]+\/kael-chat\/private_video_original\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i.test(value.ref)
  ) {
    ctx.addIssue({ code: "custom", path: ["ref"], message: "Original video requires a private human-evidence ref" });
  }
});

const kaelCaseNextActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ask_question"),
    question: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({
    kind: z.literal("request_evidence"),
    evidence_kind: z.enum(["photo", "video_frame", "voice_transcript"]),
    prompt: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({ kind: z.literal("prepare_offer") }).strict(),
  z.object({
    kind: z.literal("escalate"),
    reason: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({ kind: z.literal("wait") }).strict(),
]);

export const kaelDiagnosisScopeArtifactSchema = z.object({
  version: z.literal(1),
  service_type: z.enum(KAEL_CASE_WORK_SERVICE_TYPES),
  profile_id: z.enum(KAEL_PERFORMANCE_PROFILE_IDS),
  case_phase: z.enum(KAEL_CASE_WORK_PHASES),
  facts: z.record(z.string().min(1).max(120), kaelCaseFactValueSchema),
  missing_facts: z.array(z.string().min(1).max(120)).max(64),
  evidence: z.array(kaelCaseEvidenceSchema).max(20),
  safety_flags: z.array(z.object({
    code: z.string().trim().min(1).max(120),
    severity: z.enum(["notice", "review", "stop"]),
    customer_message: z.string().trim().min(1).max(1000).optional(),
  }).strict()).max(20),
  scope_summary: z.string().trim().min(1).max(3000).nullable(),
  quote_ready: z.boolean(),
  quote_blockers: z.array(z.string().min(1).max(200)).max(30),
  worker_requirements: z.array(z.string().min(1).max(120)).max(30),
  confidence: z.number().min(0).max(1),
  next_action: kaelCaseNextActionSchema,
  updated_at: z.string().datetime(),
}).strict().superRefine((value, ctx) => {
  const profile = getKaelPerformanceProfile(value.service_type);
  if (!profile || profile.id !== value.profile_id) {
    ctx.addIssue({ code: "custom", path: ["profile_id"], message: "Profile must match the selected service" });
  }
  if (Object.keys(value.facts).length > 64) {
    ctx.addIssue({ code: "custom", path: ["facts"], message: "Case facts exceed the bounded artifact contract" });
  }
  if (value.quote_ready) {
    if (value.missing_facts.length > 0 || value.quote_blockers.length > 0) {
      ctx.addIssue({ code: "custom", path: ["quote_ready"], message: "Quote cannot be ready while blockers remain" });
    }
    if (!value.scope_summary) {
      ctx.addIssue({ code: "custom", path: ["scope_summary"], message: "Quote-ready scope requires a summary" });
    }
    if (value.next_action.kind !== "prepare_offer" || value.case_phase !== "offer_review") {
      ctx.addIssue({ code: "custom", path: ["next_action"], message: "Quote-ready case must enter offer review" });
    }
  }
});

export type KaelDiagnosisScopeArtifact = z.infer<typeof kaelDiagnosisScopeArtifactSchema>;

export function buildInitialDiagnosisScopeArtifact(input: {
  serviceType: KaelCaseWorkServiceType;
  customerGoal: string;
  workerRequirements?: readonly string[];
}): KaelDiagnosisScopeArtifact {
  const profile = getKaelPerformanceProfile(input.serviceType);
  if (!profile) throw new Error("Unsupported Kael performance profile");
  const missingFacts = [...profile.quote_drivers];
  const firstDriver = missingFacts[0] ?? "service_scope";
  return kaelDiagnosisScopeArtifactSchema.parse({
    version: 1,
    service_type: input.serviceType,
    profile_id: profile.id,
    case_phase: "analysis",
    facts: { customer_goal: input.customerGoal.trim() },
    missing_facts: missingFacts,
    evidence: [],
    safety_flags: [],
    scope_summary: null,
    quote_ready: false,
    quote_blockers: missingFacts,
    worker_requirements: input.workerRequirements ?? profile.worker_capabilities,
    confidence: 0.2,
    next_action: {
      kind: "ask_question",
      question: `Bạn cho Kael biết thêm về ${firstDriver.replaceAll("_", " ")} nhé?`,
    },
    updated_at: new Date().toISOString(),
  });
}

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
