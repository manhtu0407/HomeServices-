import type { JobStatus } from "../../../../_shared/domain.ts";
import {
  type KaelAutonomyDecision,
  kaelAutonomyDecisionSchema,
} from "../contracts/artifact-contract.ts";
import {
  evaluateKaelPermissionGate,
  type KaelPermissionGateRequest,
} from "./permission-gate.ts";
import { validateKaelAutonomyTransition } from "../../workflow-orchestrator.ts";

export type KaelAutonomyDecisionSource = "policy" | "llm_proposed";
export type KaelAutonomyGateStatus = "allow" | "reject" | "escalate";

export type KaelAutonomyGateInput = {
  decision: unknown;
  from: JobStatus;
  to: JobStatus;
  authority: KaelPermissionGateRequest;
  knownEvidenceReferences: readonly string[];
  source?: KaelAutonomyDecisionSource;
  amountVnd?: number | null;
  featureFlags?: {
    fullAutonomyEnabled?: boolean;
  };
};

export type KaelAutonomyGateAudit = {
  gate_result: KaelAutonomyGateStatus;
  reason_code: string;
  from_status: JobStatus;
  to_status: JobStatus;
  action: string | null;
  policy_id: string | null;
  resulting_event: string | null;
  confidence: number | null;
  evidence_refs: string[];
  safe_metadata: Record<string, unknown>;
};

export type KaelAutonomyGateResult = {
  result: KaelAutonomyGateStatus;
  decision?: KaelAutonomyDecision;
  audit: KaelAutonomyGateAudit;
  feedback: string;
};

export type KaelAutonomyReplayRow = {
  decision: unknown;
  from_status: JobStatus;
  to_status: JobStatus;
  authority: KaelPermissionGateRequest;
  evidence_refs: readonly string[];
  decision_source?: KaelAutonomyDecisionSource;
  amount_vnd?: number | null;
};

export type KaelAutonomyAuditClient = {
  from(table: string): {
    insert(value: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
};

const CHECK_ORDER = Object.freeze([
  "schema",
  "state_machine",
  "permission",
  "invariants",
  "evidence_sufficiency",
  "confidence_calibration",
] as const);

const HIGH_STAKES_ACTIONS = new Set<KaelAutonomyDecision["action"]>([
  "decide_payment",
  "decide_dispute",
]);
const FLAG_GATED_FULL_AUTONOMY_ACTIONS = new Set<KaelAutonomyDecision["action"]>([
  "process_cancellation",
  "decide_scope_change",
  "confirm_completion",
  "decide_payment",
  "decide_dispute",
]);
const HIGH_STAKES_AMOUNT_VND = 1_000_000;
const HIGH_STAKES_CONFIDENCE_MIN = 0.82;

const PII_OR_SECRET_PATTERNS = [
  /\b(?:0|\+?84)[1-9]\d{8,9}\b/i,
  /\b\d{12}\b/,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\bpplx-[A-Za-z0-9_-]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bSUPABASE_(?:SERVICE_ROLE|SECRET)_KEY\b/i,
];

const DIRECT_MUTATION_PATTERNS = [
  /\bignore (?:previous|all|policy|rules)\b/i,
  /\boverride (?:policy|rules|gate)\b/i,
  /\b(?:update|delete from|insert into)\s+(?:public\.)?(?:jobs|payments|reviews)\b/i,
  /\bset\s+status\s*=/i,
  /\brpc\s*\(/i,
  /\bbypass\b/i,
  /\brelease payment\b/i,
  /\bcharge (?:customer|now)\b/i,
];

export function readKaelAutonomyFlags(
  getEnv = readRuntimeEnv,
): { KAEL_AUTONOMY_FULL_ENABLED: boolean } {
  return {
    KAEL_AUTONOMY_FULL_ENABLED: readBooleanFlag(getEnv("KAEL_AUTONOMY_FULL_ENABLED")),
  };
}

export function gateAutonomyDecision(input: KaelAutonomyGateInput): KaelAutonomyGateResult {
  const source = input.source ?? "policy";
  const fullAutonomyEnabled = input.featureFlags?.fullAutonomyEnabled ??
    readKaelAutonomyFlags().KAEL_AUTONOMY_FULL_ENABLED;

  if (source === "llm_proposed" && !fullAutonomyEnabled) {
    return blocked(input, "reject", "AUTONOMY_FULL_FLAG_OFF", null);
  }

  const parsed = kaelAutonomyDecisionSchema.safeParse(input.decision);
  if (!parsed.success) {
    return blocked(input, "reject", "SCHEMA_INVALID", null, {
      schema_error_count: parsed.error.issues.length,
    });
  }
  const decision = parsed.data;

  if (!decision.policy_id.startsWith("kael.autonomy.")) {
    return blocked(input, "reject", "POLICY_ID_INVALID", decision);
  }

  if (!fullAutonomyEnabled && FLAG_GATED_FULL_AUTONOMY_ACTIONS.has(decision.action)) {
    return blocked(input, "reject", "AUTONOMY_FULL_FLAG_OFF", decision, {
      flag: "KAEL_AUTONOMY_FULL_ENABLED",
    });
  }

  const transition = validateKaelAutonomyTransition({
    decision,
    from: input.from,
    to: input.to,
  });
  if (!transition.valid) {
    return blocked(input, "reject", "STATE_TRANSITION_INVALID", decision, {
      transition_error: transition.error,
    });
  }

  const authority = evaluateKaelPermissionGate(input.authority);
  if (!authority.allowed) {
    return blocked(input, "reject", "AUTHORITY_DENIED", decision, {
      authority_reason_code: authority.reasonCode,
    });
  }

  const piiOrSecret = hasPattern(decision, PII_OR_SECRET_PATTERNS);
  if (piiOrSecret) {
    return blocked(input, "reject", "PII_OR_SECRET_DETECTED", decision, {
      invariant: "I4",
    });
  }

  const directMutation = hasPattern(decision, DIRECT_MUTATION_PATTERNS);
  if (directMutation) {
    return blocked(input, "reject", "LLM_DIRECT_MUTATION_ATTEMPT", decision, {
      invariant: "I5",
    });
  }

  const truth = checkEvidenceTruth(decision, input.knownEvidenceReferences);
  if (!truth.ok) {
    return blocked(input, "reject", truth.reasonCode, decision, {
      invariant: "I2",
      missing_reference: truth.missingReference,
    });
  }

  const sufficiency = checkEvidenceSufficiency(decision);
  if (!sufficiency.ok) {
    return blocked(input, "reject", sufficiency.reasonCode, decision, {
      invariant: sufficiency.invariant,
      missing_evidence_kinds: sufficiency.missingKinds,
    });
  }

  if (isHighStakes(input, decision) && decision.confidence < HIGH_STAKES_CONFIDENCE_MIN) {
    return blocked(input, "escalate", "HIGH_STAKES_LOW_CONFIDENCE", decision, {
      escalation_queue_type: "autonomy_escalation",
      confidence_min: HIGH_STAKES_CONFIDENCE_MIN,
      amount_vnd: input.amountVnd ?? null,
    });
  }

  return {
    result: "allow",
    decision,
    audit: buildAudit(input, "allow", "ALLOW_AUTONOMY_DECISION", decision),
    feedback: "ALLOW",
  };
}

export function replayAutonomyDecisionAudit(row: KaelAutonomyReplayRow): KaelAutonomyGateResult {
  // Historical audit rows predate W2 provenance. They originate from deterministic
  // policy routes, so preserve their semantics while recording the explicit form.
  const authority = {
    ...row.authority,
    intentConfidence: Number.isFinite(row.authority.intentConfidence)
      ? row.authority.intentConfidence
      : 1,
    topicSource: row.authority.topicSource === "llm"
      ? "llm" as const
      : "deterministic_rule" as const,
    boundarySignal: row.authority.boundarySignal === true,
  };
  return gateAutonomyDecision({
    decision: row.decision,
    from: row.from_status,
    to: row.to_status,
    authority,
    knownEvidenceReferences: row.evidence_refs,
    source: row.decision_source ?? "policy",
    amountVnd: row.amount_vnd ?? null,
    featureFlags: { fullAutonomyEnabled: true },
  });
}

export async function auditKaelAutonomyGateResult(
  client: KaelAutonomyAuditClient,
  input: {
    jobId: string | null;
    actorId: string | null;
    actorRole: "customer" | "worker" | "admin" | "system";
    source: KaelAutonomyDecisionSource;
    gate: KaelAutonomyGateResult;
  },
) {
  const audit = input.gate.audit;
  await persistAutonomyRecord(
    client,
    "kael_autonomy_decision_audit",
    {
    job_id: input.jobId,
    actor_id: input.actorId,
    actor_role: input.actorRole,
    decision_source: input.source,
    decision: input.gate.decision ?? null,
    from_status: audit.from_status,
    to_status: audit.to_status,
    gate_result: audit.gate_result,
    reason_code: audit.reason_code,
    evidence_refs: audit.evidence_refs,
    confidence: audit.confidence,
    resulting_event: audit.resulting_event,
    safe_metadata: audit.safe_metadata,
    },
    "KAEL_AUTONOMY_AUDIT_FAILED",
  );

  if (input.gate.result === "escalate") {
    await persistAutonomyRecord(
      client,
      "kael_admin_queue",
      {
        job_id: input.jobId,
        actor_id: input.actorId,
        actor_role: input.actorRole,
        queue_type: "autonomy_escalation",
        priority: "high",
        status: "open",
        escalation_level: "hard",
        reason_code: audit.reason_code,
        response_summary: `Autonomy gate escalated ${audit.action ?? "unknown_action"}`.slice(0, 200),
        safe_metadata: {
          gate_result: audit.gate_result,
          action: audit.action,
          policy_id: audit.policy_id,
          resulting_event: audit.resulting_event,
          evidence_refs: audit.evidence_refs,
        },
      },
      "KAEL_AUTONOMY_ESCALATION_QUEUE_FAILED",
    );
  }
}

async function persistAutonomyRecord(
  client: KaelAutonomyAuditClient,
  table: string,
  value: Record<string, unknown>,
  failureCode: string,
): Promise<void> {
  try {
    const result = await client.from(table).insert(value);
    if (result.error) throw new Error(failureCode);
  } catch {
    // An autonomy result is not durable until its required audit/control row exists.
    throw new Error(failureCode);
  }
}

function blocked(
  input: KaelAutonomyGateInput,
  result: "reject" | "escalate",
  reasonCode: string,
  decision: KaelAutonomyDecision | null,
  metadata: Record<string, unknown> = {},
): KaelAutonomyGateResult {
  return {
    result,
    ...(decision ? { decision } : {}),
    audit: buildAudit(input, result, reasonCode, decision, metadata),
    feedback: result === "escalate" ? "ESCALATE" : "REJECT",
  };
}

function buildAudit(
  input: KaelAutonomyGateInput,
  gateResult: KaelAutonomyGateStatus,
  reasonCode: string,
  decision: KaelAutonomyDecision | null,
  metadata: Record<string, unknown> = {},
): KaelAutonomyGateAudit {
  const evidenceRefs = decision ? decision.evidence.map((evidence) => evidence.reference_id) : [];
  return {
    gate_result: gateResult,
    reason_code: reasonCode,
    from_status: input.from,
    to_status: input.to,
    action: decision?.action ?? null,
    policy_id: decision?.policy_id ?? null,
    resulting_event: decision?.resulting_event ?? null,
    confidence: decision?.confidence ?? null,
    evidence_refs: evidenceRefs,
    safe_metadata: {
      check_order: [...CHECK_ORDER],
      decision_source: input.source ?? "policy",
      authority: {
        actor: input.authority.actor,
        purpose: input.authority.purpose,
        action: input.authority.action,
        topic: input.authority.topic,
        job_relation: input.authority.jobRelation,
        intent_confidence: input.authority.intentConfidence,
        topic_source: input.authority.topicSource,
        boundary_signal: input.authority.boundarySignal,
      },
      ...metadata,
    },
  };
}

function checkEvidenceTruth(
  decision: KaelAutonomyDecision,
  knownEvidenceReferences: readonly string[],
): { ok: true } | { ok: false; reasonCode: string; missingReference?: string } {
  if (knownEvidenceReferences.length === 0) {
    return { ok: false, reasonCode: "EVIDENCE_CATALOG_REQUIRED" };
  }
  const known = new Set(knownEvidenceReferences);
  for (const evidence of decision.evidence) {
    if (known.has(evidence.reference_id)) continue;
    if (evidence.kind === "policy" && isPolicyReference(evidence.reference_id)) continue;
    return {
      ok: false,
      reasonCode: "EVIDENCE_REFERENCE_NOT_FOUND",
      missingReference: evidence.reference_id,
    };
  }
  return { ok: true };
}

function checkEvidenceSufficiency(
  decision: KaelAutonomyDecision,
): { ok: true } | { ok: false; reasonCode: string; invariant: string; missingKinds: string[] } {
  if (decision.action === "start_matching" || decision.action === "confirm_ticket") {
    return requireKinds(decision, ["artifact", "policy"], "EVIDENCE_INSUFFICIENT_START_MATCHING", "I2");
  }
  if (decision.action === "process_cancellation") {
    return requireAnyKinds(
      decision,
      [["customer_input", "policy"], ["worker_evidence", "policy"], ["system_check", "policy"]],
      "EVIDENCE_INSUFFICIENT_PROCESS_CANCELLATION",
      "I2",
    );
  }
  if (decision.action === "decide_scope_change") {
    return requireKinds(decision, ["artifact", "system_check", "policy"], "EVIDENCE_INSUFFICIENT_DECIDE_SCOPE_CHANGE", "I2");
  }
  if (decision.action === "confirm_completion") {
    return requireKinds(decision, ["worker_evidence", "system_check", "policy"], "EVIDENCE_INSUFFICIENT_CONFIRM_COMPLETION", "I1");
  }
  if (decision.action === "decide_payment") {
    return requireKinds(decision, ["artifact", "job_event", "policy"], "EVIDENCE_INSUFFICIENT_DECIDE_PAYMENT", "I1");
  }
  if (decision.action === "decide_dispute") {
    return requireAnyKinds(
      decision,
      [["artifact", "job_event", "policy"], ["customer_input", "worker_evidence", "policy"]],
      "EVIDENCE_INSUFFICIENT_DECIDE_DISPUTE",
      "I2",
    );
  }
  return { ok: true };
}

function requireKinds(
  decision: KaelAutonomyDecision,
  kinds: readonly KaelAutonomyDecision["evidence"][number]["kind"][],
  reasonCode: string,
  invariant: string,
) {
  const present = new Set(decision.evidence.map((evidence) => evidence.kind));
  const missing = kinds.filter((kind) => !present.has(kind));
  return missing.length === 0
    ? { ok: true as const }
    : { ok: false as const, reasonCode, invariant, missingKinds: missing };
}

function requireAnyKinds(
  decision: KaelAutonomyDecision,
  alternatives: readonly (readonly KaelAutonomyDecision["evidence"][number]["kind"][])[],
  reasonCode: string,
  invariant: string,
) {
  const passing = alternatives.some((kinds) => requireKinds(decision, kinds, reasonCode, invariant).ok);
  if (passing) return { ok: true as const };
  const shortest = alternatives.reduce((best, next) => next.length < best.length ? next : best);
  return { ok: false as const, reasonCode, invariant, missingKinds: [...shortest] };
}

function hasPattern(decision: KaelAutonomyDecision, patterns: readonly RegExp[]) {
  const evidenceText = decision.evidence
    .flatMap((evidence) => [evidence.reference_id, evidence.summary ?? ""])
    .join("\n");
  const text = `${decision.policy_id}\n${decision.resulting_event}\n${evidenceText}`;
  return patterns.some((pattern) => pattern.test(text));
}

function isPolicyReference(referenceId: string) {
  return /^(?:RULES|STRUCTURES|critical|Plan|README|MEMORY)\.md(?:#.+)?$/i.test(referenceId) ||
    /^docs\/[A-Za-z0-9._/-]+(?:#.+)?$/i.test(referenceId);
}

function isHighStakes(input: KaelAutonomyGateInput, decision: KaelAutonomyDecision) {
  if (HIGH_STAKES_ACTIONS.has(decision.action)) return true;
  return (input.amountVnd ?? 0) >= HIGH_STAKES_AMOUNT_VND;
}

function readBooleanFlag(value: string | undefined): boolean {
  return typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readRuntimeEnv(name: string): string | undefined {
  const deno = (globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno;
  return deno?.env?.get?.(name);
}
