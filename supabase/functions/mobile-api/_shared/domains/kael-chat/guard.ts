// Deterministic customer-chat boundary handling, including safety-first decline copy,
// sanitized observation metadata, guardrail audit, and terminal progress settlement.

import type { ServiceType } from "../../../../_shared/domain.ts";
import { evaluateMessageBoundary, type BoundaryDecision } from "../../kael/kael-guardrails/boundary-guard.ts";
import { isIntakeEvalObservationExposureEnabled } from "../../kael/pipeline/intake-runtime.ts";
import {
  getEnabledKaelPlaybook,
  getKaelPlaybookVersion,
} from "../../kael/learning/playbooks/registry.ts";
import { kaelIntakeDiagnosisPromptVersion } from "../../kael/prompts/prompts.ts";
import { isKaelAiKillSwitchEnabled } from "../../kael/kael-guardrails/spend-gate.ts";
import {
  intakeEvalObservationSchema,
  kaelDiagnosisScopeArtifactSchema,
  updateKaelProgress,
  type IntakeEvalObservation,
} from "../../kael/index.ts";
import { auditGuardrailTripBestEffort } from "../../kael/learning/audit.ts";
import type { DbClient } from "../../platform/db.ts";
import { appendKaelSystemTurn, updateKaelSession } from "./session-store.ts";
import { mergeBoundarySafetyGuidance, persistentKaelSafetySignals } from "./intake-safety.ts";

import { asKaelStoredSentiment, asNumber } from "../../platform/coercions.ts";
import { guardDemandingResponseText } from "../job/chat.ts";
import type { KaelChatStatus } from "../../../../_shared/contracts.ts";
import {
  buildDemandingCustomerResponse,
  detectDemandingCustomerPatterns,
  recordDemandingCustomerInteraction,
} from "../../kael/index.ts";
import { sanitizeCustomerCaseEvidenceText } from "../../kael/evidence/untrusted-evidence.ts";
import {
  demandingCustomerSessionMetadata,
  demandingCustomerTurnMetadata,
} from "./case-work-context.ts";

function intakeObservationMetadata(observation: IntakeEvalObservation | undefined) {
  if (!observation) return {};
  return { intake_observation: intakeEvalObservationSchema.parse(observation) };
}

function boundaryIntakeObservation(
  boundary: Extract<BoundaryDecision, { ok: false }>,
  serviceType: ServiceType,
  electricalPlaybookEnabled: boolean,
  persistedSafetySignals: readonly string[] = [],
) {
  if (boundary.reason === "prompt_injection" ||
    (!electricalPlaybookEnabled && !isIntakeEvalObservationExposureEnabled())) return undefined;
  const parsed = intakeEvalObservationSchema.safeParse({
    scopeSignal: boundary.reason,
    suggestedService: boundary.suggestedService ?? null,
    problemSlug: null,
    needsClarification: false,
    safetySignals: persistentKaelSafetySignals("", serviceType, [
      ...persistedSafetySignals,
      ...(boundary.safetySignals ?? []),
    ]),
    modelId: "deterministic",
    promptVersion: kaelIntakeDiagnosisPromptVersion(serviceType),
    playbookVersion: electricalPlaybookEnabled
      ? getKaelPlaybookVersion(serviceType)
      : null,
  });
  return parsed.success ? parsed.data : undefined;
}

export async function maybeApplyKaelBoundaryGuard(
  client: DbClient,
  sessionId: string,
  message: string,
  serviceType: ServiceType,
  auditContext: {
    readonly actorId: string | null;
    readonly jobId: string | null;
    readonly language?: "vi" | "en";
    readonly persistedSafetySignals?: readonly string[];
    readonly progressTarget?: Parameters<typeof updateKaelProgress>[1];
  } = { actorId: null, jobId: null },
): Promise<boolean> {
  if (isKaelAiKillSwitchEnabled()) return false;
  const electricalPlaybookEnabled = Boolean(getEnabledKaelPlaybook(serviceType));
  const boundary = evaluateMessageBoundary(message, serviceType, {
    semanticInjectionClassifierEnabled: true,
    language: auditContext.language,
    electricalPlaybookEnabled,
  });
  if (boundary.ok) return false;
  console.warn("kael_chat boundary decline", {
    sessionId,
    reason: boundary.reason,
    signalCount: boundary.detectedSignals.length,
  });
  await auditGuardrailTripBestEffort(client, {
    jobId: auditContext.jobId,
    actorId: auditContext.actorId,
    actorRole: "customer",
    surface: "kael_chat_boundary",
    reason: boundary.reason,
    source: "boundary_guard",
    safeMetadata: {
      session_id: sessionId,
      service_type: serviceType,
      boundary_signals: boundary.detectedSignals,
    },
  });
  await appendKaelSystemTurn(client, sessionId, {
    contentType: "error",
    text: mergeBoundarySafetyGuidance(
      boundary.declineText,
      boundary.safetySignals ?? [],
      persistentKaelSafetySignals(
        message,
        serviceType,
        auditContext.persistedSafetySignals,
      ),
      auditContext.language ?? "vi",
      serviceType,
    ),
    nextStatus: "unsupported",
    metadata: {
      boundary_reason: boundary.reason,
      boundary_signals: boundary.detectedSignals,
      ...intakeObservationMetadata(boundaryIntakeObservation(
        boundary,
        serviceType,
        electricalPlaybookEnabled,
        auditContext.persistedSafetySignals,
      )),
      ...(boundary.suggestedService
        ? { suggested_service: boundary.suggestedService }
        : {}),
    },
  });
  if (auditContext.progressTarget) {
    await updateKaelProgress(client, auditContext.progressTarget, {
      stage: "intent_classification",
      status: "failed",
      progress: 1,
      failureReason: boundary.reason,
    });
  }
  return true;
}

export async function maybeHandleDemandingCustomerKaelChatTurn(
  client: DbClient,
  input: {
    sessionId: string;
    actorId: string;
    jobId: string | null;
    status: KaelChatStatus;
    casePhase?: unknown;
    diagnosisScope?: unknown;
    metadata: Record<string, unknown>;
    message: string;
    qaCount: number;
    language?: "vi" | "en";
  },
) {
  if (isKaelAiKillSwitchEnabled()) return false;
  const alreadyHardStopped = input.metadata.demanding_customer_hard_escalation === true;
  const safeInteractionEvidence = sanitizeCustomerCaseEvidenceText(input.message);
  const detection = detectDemandingCustomerPatterns({
    message: safeInteractionEvidence,
    qaCount: input.qaCount,
    cancelCount: asNumber(input.metadata.demanding_customer_cancel_count),
    // Prior-turn intake-diagnosis sentiment fills a keyword
    // gap (soft only). Keyword detection above stays the primary, deterministic path.
    llmSentiment: asKaelStoredSentiment(input.metadata.last_customer_sentiment),
  });
  const hasPressureSignal = detection.pressureSignals.length > 0;
  const hasLegitimateConcern = detection.legitimateConcernSignals.some((signal) =>
    signal !== "qa_loop_above_3"
  );
  const canAnswerFromExistingOffer = input.status === "estimate_ready" &&
    input.casePhase === "offer_review";
  const shouldIntercept = alreadyHardStopped || hasPressureSignal ||
    (hasLegitimateConcern && canAnswerFromExistingOffer);
  if (!shouldIntercept) return false;

  const effectiveDetection = alreadyHardStopped && detection.escalationLevel !== "hard"
    ? {
      ...detection,
      nuance: detection.nuance === "none" ? "pressure" as const : detection.nuance,
      expectedNuance: detection.expectedNuance === "none" ? "pressure" as const : detection.expectedNuance,
      pressureScore: Math.max(detection.pressureScore, 1),
      escalationLevel: "hard" as const,
    }
    : detection;
  const language = input.language ?? (input.metadata.language === "en" ? "en" : "vi");
  const response = buildDemandingCustomerResponse(effectiveDetection, {}, language);
  const priorOfferArtifact = input.status === "estimate_ready" &&
      input.casePhase === "offer_review" &&
      !response.stopAiLoop
    ? kaelDiagnosisScopeArtifactSchema.safeParse(input.diagnosisScope)
    : null;
  const guarded = guardDemandingResponseText(response.responseText, language);
  if (guarded.trip) {
    await auditGuardrailTripBestEffort(client, {
      jobId: input.jobId,
      actorId: input.actorId,
      actorRole: "customer",
      surface: guarded.trip.surface,
      reason: guarded.trip.reason,
      guardrailLabel: guarded.trip.guardrailLabel ?? null,
      source: guarded.trip.source,
      safeMetadata: { session_id: input.sessionId },
    });
  }

  await recordDemandingCustomerInteraction(client, {
    jobId: input.jobId,
    actorId: input.actorId,
    actorRole: "customer",
    message: safeInteractionEvidence,
    detection: effectiveDetection,
    response,
  });
  await appendKaelSystemTurn(client, input.sessionId, {
    contentType: "clarification",
    text: guarded.text,
    nextStatus: response.stopAiLoop
      ? "active"
      : input.status === "estimate_ready"
      ? "estimate_ready"
      : "active",
    metadata: {
      demanding_customer: demandingCustomerTurnMetadata(effectiveDetection, response),
    },
    sessionMetadata: demandingCustomerSessionMetadata(
      input.metadata,
      effectiveDetection,
      response,
    ),
  });
  if (priorOfferArtifact?.success && priorOfferArtifact.data.quote_ready) {
    await updateKaelSession(client, input.sessionId, {
      status: "estimate_ready",
      case_phase: "offer_review",
      diagnosis_scope: priorOfferArtifact.data,
    });
  }
  return true;
}
