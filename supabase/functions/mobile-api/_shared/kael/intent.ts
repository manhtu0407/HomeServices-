import { sanitizeForLLM } from "../../../_shared/domain.ts";
import type { AIMessage, AIProvider, EdgeAiSecrets, IntentAttemptLog, IntentResult } from "./types.ts";
import { intentResultSchema } from "./types.ts";
import { buildIntentMessages } from "./prompts.ts";
import { callAI } from "./provider-client.ts";
import { maxTokensForPurpose } from "./routing.config.ts";
import { providerCandidatesForPurpose } from "./routing.ts";
import { hasUnsupportedRepairIntent, safeParseJSON, timed } from "./utils.ts";

export async function classifyIntent(
  serviceType: string,
  problemChips: string[],
  description: string,
  secrets: EdgeAiSecrets,
): Promise<
  | { success: true; intent: IntentResult; attempts: IntentAttemptLog[] }
  | {
    success: false;
    fallback: IntentResult;
    failureReason: string;
    attempts: IntentAttemptLog[];
  }
> {
  const messages = buildIntentMessages(
    sanitizeForLLM(serviceType),
    problemChips.map(sanitizeForLLM),
    description,
  );
  const attempts: IntentAttemptLog[] = [];

  for (const candidate of providerCandidatesForPurpose("intent_classification")) {
    const attempt = await classifyIntentWithProvider(
      candidate,
      messages,
      secrets,
    );
    attempts.push(attempt.log);
    if (attempt.success) {
      return { success: true, intent: attempt.intent, attempts };
    }
  }

  return {
    success: false,
    fallback: buildFallbackIntent(serviceType, problemChips, description),
    failureReason: attempts.map((attempt) =>
      `${attempt.provider ?? "unknown"}:${attempt.failureReason ?? "failed"}`
    ).join("; "),
    attempts,
  };
}

async function classifyIntentWithProvider(
  route: { provider: AIProvider; model: string; latencyBudgetMs: number },
  messages: AIMessage[],
  secrets: EdgeAiSecrets,
): Promise<
  | { success: true; intent: IntentResult; log: IntentAttemptLog }
  | { success: false; log: IntentAttemptLog }
> {
  const attempt = await timed(() =>
    callAI({
      purpose: "intent_classification",
      provider: route.provider,
      model: route.model,
      messages,
      maxTokens: maxTokensForPurpose("intent_classification", 200),
      temperature: 0.1,
      timeoutMs: route.latencyBudgetMs,
      maxRetries: 0,
    }, secrets)
  );
  const baseLog = {
    provider: route.provider,
    model: route.model,
    latencyMs: attempt.ms,
  };

  if (!attempt.result.success) {
    return {
      success: false,
      log: {
        ...baseLog,
        success: false,
        failureReason: `AI call failed: ${attempt.result.code}`,
      },
    };
  }

  const parsed = safeParseJSON(attempt.result.content);
  const validated = parsed ? intentResultSchema.safeParse(parsed) : null;
  if (!validated?.success) {
    return {
      success: false,
      log: {
        ...baseLog,
        success: false,
        failureReason: "AI intent JSON validation failed",
        inputTokens: attempt.result.usage.inputTokens,
        outputTokens: attempt.result.usage.outputTokens,
        costUsd: attempt.result.usage.costUsd,
      },
    };
  }

  return {
    success: true,
    intent: validated.data,
    log: {
      ...baseLog,
      success: true,
      inputTokens: attempt.result.usage.inputTokens,
      outputTokens: attempt.result.usage.outputTokens,
      costUsd: attempt.result.usage.costUsd,
    },
  };
}

export function buildFallbackIntent(
  serviceType: string,
  problemChips: string[],
  description: string,
): IntentResult {
  if (hasUnsupportedRepairIntent(description)) {
    return {
      service_type: "unsupported",
      problem_slug: "unsupported",
      confidence: 0.2,
      needs_clarification: false,
    };
  }

  const validServiceType =
    serviceType === "electrical" || serviceType === "plumbing" ||
      serviceType === "cleaning"
      ? serviceType
      : "unsupported";
  const slugMap: Record<string, string> = {
    "Mất điện một phòng": "power_outage_one_room",
    "Mất điện toàn căn": "power_outage_whole_unit",
    "Ổ cắm/công tắc hỏng": "outlet_or_switch_broken",
    "Cầu dao trip": "breaker_trip",
    "Đèn chập chờn": "flickering_light",
    "Lắp thêm thiết bị": "install_device",
    "Ống rò rỉ": "pipe_leak",
    "Tắc cống/bồn": "clogged_drain_or_sink",
    "Vòi hỏng": "faucet_broken",
    "Toilet không xả": "toilet_flush_issue",
    "Áp nước yếu": "weak_water_pressure",
    "Lắp/thay thiết bị": "install_or_replace_fixture",
    "Dọn dẹp nhà": "standard_home_cleaning",
    "Vệ sinh bếp": "kitchen_deep_clean",
    "Vệ sinh phòng tắm": "bathroom_deep_clean",
    "Tổng vệ sinh": "deep_cleaning",
    "Dọn sau sửa chữa": "post_repair_cleaning",
    "Vệ sinh cửa kính": "window_cleaning",
  };
  const firstChip = problemChips[0] ?? "";
  const slug = slugMap[firstChip] ??
    (validServiceType === "electrical"
      ? "other_electrical"
      : validServiceType === "plumbing"
      ? "other_plumbing"
      : validServiceType === "cleaning"
      ? "other_cleaning"
      : "unsupported");
  return {
    service_type: validServiceType,
    problem_slug: slug,
    confidence: 0.3,
    needs_clarification: false,
  };
}
