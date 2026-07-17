import { scrubKaelPiiText } from "../output-pipeline.ts";
import {
  runKaelSelfCheckPipeline,
  type KaelSelfCheckPipelineInput,
  type KaelSelfCheckPipelineResult,
  type KaelSelfCheckReason,
  type KaelSemanticGuardLabel,
} from "./self-check.ts";

export type KaelOutputGuardTrip = {
  readonly surface: string;
  readonly reason: KaelSelfCheckReason;
  readonly guardrailLabel?: KaelSemanticGuardLabel;
  readonly source: "self_check" | "semantic_self_check";
};

export type KaelOutputGuardInput = Omit<
  KaelSelfCheckPipelineInput,
  "semanticGuardEnabled"
> & {
  readonly surface: string;
};

export type KaelOutputGuardResult = KaelSelfCheckPipelineResult & {
  readonly trip?: KaelOutputGuardTrip;
};

export function guardOutput(input: KaelOutputGuardInput): KaelOutputGuardResult {
  const checked = runKaelSelfCheckPipeline({
    ...input,
    semanticGuardEnabled: true,
  });
  const failure = checked.initial_failure;

  return {
    ...checked,
    text: scrubKaelPiiText(checked.text),
    trip: failure
      ? {
        surface: input.surface,
        reason: failure.reason,
        guardrailLabel: failure.guardrailLabel,
        source: failure.reason === "semantic_guardrail"
          ? "semantic_self_check"
          : "self_check",
      }
      : undefined,
  };
}
