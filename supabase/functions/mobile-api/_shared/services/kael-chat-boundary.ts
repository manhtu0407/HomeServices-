// Deterministic customer-chat boundary handling, including safety-first decline copy,
// sanitized observation metadata, guardrail audit, and terminal progress settlement.

import type { ServiceType } from "../../../_shared/domain.ts";
import { evaluateMessageBoundary, type BoundaryDecision } from "../kael/boundary-guard.ts";
import { isIntakeEvalObservationExposureEnabled } from "../kael/intake-runtime.ts";
import { ELECTRICAL_PLAYBOOK_VERSION, isElectricalPlaybookEnabled } from "../kael/playbooks/electrical.ts";
import { kaelIntakeDiagnosisPromptVersion } from "../kael/prompts.ts";
import { isKaelAiKillSwitchEnabled } from "../kael/spend-gate.ts";
import { intakeEvalObservationSchema, updateKaelProgress, type IntakeEvalObservation } from "../kael/index.ts";
import { auditGuardrailTripBestEffort } from "./audit.ts";
import type { DbClient } from "./db.ts";
import { appendKaelSystemTurn } from "./kael-chat-session-store.ts";
import { mergeBoundarySafetyGuidance, persistentKaelSafetySignals } from "./kael-chat-intake-safety.ts";

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
  if (boundary.reason === "prompt_injection" || serviceType !== "electrical" ||
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
    playbookVersion: electricalPlaybookEnabled ? ELECTRICAL_PLAYBOOK_VERSION : null,
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
  const electricalPlaybookEnabled = serviceType === "electrical" &&
    isElectricalPlaybookEnabled();
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
