import {
  intakeEvalObservationSchema,
  prependDeterministicSafetyGuidance,
  type IntakeEvalObservation,
} from "../kael/index.ts";

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
) {
  return prependDeterministicSafetyGuidance(
    text,
    safetySignals,
    language,
    { trustedText },
  );
}
