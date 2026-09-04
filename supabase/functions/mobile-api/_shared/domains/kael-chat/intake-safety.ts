import type { ServiceType } from "../../../../_shared/domain.ts";
import {
  deterministicSafetyGuidance,
  getKaelPerformanceProfile,
  intakeEvalObservationSchema,
  prependDeterministicSafetyGuidance,
  scanIntakeSafetySignals,
} from "../../kael/index.ts";
import { getEnabledKaelPlaybook } from "../../kael/learning/playbooks/registry.ts";
import type { IntakeEvalObservation } from "../../kael/contracts/types.ts";

export function persistentKaelSafetySignals(
  message: string,
  serviceType: ServiceType,
  persistedSafetySignals: readonly string[] = [],
) {
  if (!getEnabledKaelPlaybook(serviceType)) return [];
  const allowed = new Set(
    getKaelPerformanceProfile(serviceType)?.safety_capability_gates
      .flatMap((gate) => [...gate.trigger_signals]) ?? [],
  );
  return [...new Set([
    ...persistedSafetySignals,
    ...scanIntakeSafetySignals(serviceType, message),
  ])].filter((signal) => allowed.has(signal));
}

export function requiresImmediateKaelSafetyPath(
  message: string,
  serviceType: ServiceType,
  persistedSafetySignals: readonly string[] = [],
) {
  return Boolean(
    getEnabledKaelPlaybook(serviceType) &&
      deterministicSafetyGuidance(
        persistentKaelSafetySignals(message, serviceType, persistedSafetySignals),
        "vi",
        serviceType,
      ) !== null,
  );
}

export function mergeBoundarySafetyGuidance(
  declineText: string,
  currentSafetySignals: readonly string[],
  persistedSafetySignals: readonly string[],
  language: "vi" | "en",
  serviceType: ServiceType = "electrical",
) {
  if (deterministicSafetyGuidance(currentSafetySignals, language, serviceType)) return declineText;
  return prependDeterministicSafetyGuidance(
    declineText,
    persistedSafetySignals,
    language,
    { serviceType },
  );
}

export function resolveKaelResponseSafetySignals(input: {
  readonly electricalPlaybookEnabled: boolean;
  readonly serviceType?: ServiceType;
  readonly earlySafetySignals: readonly string[];
  readonly pipelineSafetySignals?: readonly string[];
  readonly intakeObservation?: IntakeEvalObservation;
}) {
  if (!input.electricalPlaybookEnabled) {
    return [...new Set(input.pipelineSafetySignals ?? [])];
  }
  return [...new Set([
    ...input.earlySafetySignals,
    ...(input.pipelineSafetySignals ?? []),
    ...(input.intakeObservation?.safetySignals ?? []),
  ])];
}

export function buildSafetyFirstKaelClarification(input: {
  readonly providerText: string;
  readonly focusedFallback: string;
  readonly safetySignals: readonly string[];
  readonly language: "vi" | "en";
  readonly serviceType?: ServiceType;
}) {
  const safetyFallbackUsed = deterministicSafetyGuidance(
    input.safetySignals,
    input.language,
    input.serviceType,
  ) !== null;
  const question = safetyFallbackUsed ? input.focusedFallback : input.providerText;
  return {
    question,
    visibleText: safetyFallbackUsed
      ? prependDeterministicSafetyGuidance(
        question,
        input.safetySignals,
        input.language,
        { serviceType: input.serviceType },
      )
      : question,
    safetyFallbackUsed,
  };
}

export function kaelServiceLabelEn(serviceType: string) {
  const labels: Record<string, string> = {
    electrical: "electrical repair",
    plumbing: "plumbing repair",
    cleaning: "home cleaning",
    hvac: "air conditioning and air care",
    upholstery: "upholstery care",
    handyman: "minor repairs and installation",
  };
  return labels[serviceType] ?? "another supported service";
}

export function intakeObservationMetadata(observation: IntakeEvalObservation | undefined) {
  if (!observation) return {};
  return { intake_observation: intakeEvalObservationSchema.parse(observation) };
}

export function withIntakeSafetyGuidance(
  text: string,
  safetySignals: readonly string[],
  language: "vi" | "en",
  trustedText = true,
  serviceType: ServiceType = "electrical",
) {
  return prependDeterministicSafetyGuidance(
    text,
    safetySignals,
    language,
    { trustedText, serviceType },
  );
}
