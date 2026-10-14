import type { KaelPromptLanguage } from "../prompts/system-prompt.ts";
import type { KaelOutputGuardResult } from "./output-gateway.ts";
import type { KaelSelfCheckReason } from "./self-check.ts";

export type KaelGuardFailure = {
  readonly reason?: KaelSelfCheckReason;
  readonly guardrailLabel?: string;
};

// A secret or personal number is never sent back to a model to "fix"; the canned text is safer.
const NON_RETRYABLE_LABELS = new Set(["pii_or_secret"]);

/**
 * Tells the model what the guard rejected so one rewrite can keep the content and fix the form.
 * @returns the instruction, or null when the failure must not be retried.
 */
export function regenerationHint(
  failure: KaelGuardFailure,
  language: KaelPromptLanguage,
): string | null {
  if (!failure.reason) return null;
  if (failure.guardrailLabel && NON_RETRYABLE_LABELS.has(failure.guardrailLabel)) return null;
  switch (failure.reason) {
    case "sentence_too_long":
      return "A sentence ran past 35 words. Say the same thing in clear sentences of 25 words or fewer.";
    case "language_mismatch":
      return language === "en"
        ? "The reply mixed Vietnamese into English. Write it entirely in natural English."
        : "The reply mixed English phrases into Vietnamese. Write it entirely in natural Vietnamese; everyday loanwords such as app, link, video and file are fine.";
    case "fear_language":
      return "Remove alarming wording. State any risk calmly, then the safe next step.";
    case "absolute_claim":
      return "Remove guarantees and absolute claims about outcomes such as always, never or 100%.";
    case "accusatory_in_dispute":
    case "aggressive_response":
      return "Rewrite neutrally and warmly, without accusing anyone or refusing curtly.";
    case "exact_vnd":
      return "Remove every exact price or money amount; describe the cost only in words.";
    case "ai_self_reference":
      return "Do not describe yourself as a model or cite what an AI cannot do; just help.";
    case "casual_slang":
    case "buzzword":
      return "Use plain, polite wording without slang or buzzwords.";
    case "semantic_guardrail":
      return "Rewrite more carefully, avoiding alarming, absolute, accusatory or exact-price wording.";
    case "empty":
      return "Answer the question directly.";
  }
}

/**
 * One guided rewrite after a guard trip. The model is called at most once; the result must pass the
 * same guard that rejected the first attempt.
 * @returns the passing guard result, or null so the caller falls back to its canned text.
 */
export async function regenerateOnce(input: {
  readonly failure: KaelGuardFailure;
  readonly language: KaelPromptLanguage;
  readonly rewrite: (hint: string) => Promise<string | null>;
  readonly guard: (text: string) => KaelOutputGuardResult;
}): Promise<KaelOutputGuardResult | null> {
  const hint = regenerationHint(input.failure, input.language);
  if (!hint) return null;
  let rewritten: string | null;
  try {
    rewritten = await input.rewrite(hint);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    console.warn("kael guided regeneration unavailable", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
  if (!rewritten?.trim()) return null;
  const checked = input.guard(rewritten);
  return checked.allowed && !checked.used_fallback ? checked : null;
}
