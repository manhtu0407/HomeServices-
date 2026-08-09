import { prependDeterministicSafetyGuidance } from "../kael-guardrails/electrical-intake-policy.ts";

export function createIntakeSafetyGuidance(
  language: "vi" | "en",
  defaultSafetySignals: readonly string[],
) {
  return (
    message: string,
    safetySignals: readonly string[] = defaultSafetySignals,
  ) => prependDeterministicSafetyGuidance(message, safetySignals, language);
}
