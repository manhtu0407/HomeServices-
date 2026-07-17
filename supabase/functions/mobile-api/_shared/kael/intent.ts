import { sanitizeForLLM } from "../../../_shared/domain.ts";
import type { AIMessage, AIProvider, EdgeAiSecrets, IntentAttemptLog, IntentResult } from "./types.ts";
import { FALLBACK_PROBLEM_SLUG_BY_SERVICE, intentResultSchema } from "./types.ts";
import { getKaelPerformanceProfile } from "./performance-profiles.ts";
import { buildIntakeDiagnosisMessages, buildIntentMessages } from "./prompts.ts";
import { callStructuredAI } from "./structured-call.ts";
import type { KaelSpendGate } from "./spend-gate.ts";
import { maxTokensForPurpose } from "./routing.config.ts";
import { circuitAwareProviderCandidatesForPurpose } from "./routing.ts";
import { hasUnsupportedRepairIntent, scrubSensitiveForLLM, timed } from "./utils.ts";
import { applyHardRoutingPolicy, hasElectricalInfrastructureContext } from "./electrical-intake-policy.ts";

export async function classifyIntent(
  serviceType: string,
  problemChips: string[],
  description: string,
  secrets: EdgeAiSecrets,
  spendGate: KaelSpendGate,
  electricalPlaybookEnabled = false,
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

  for (const candidate of circuitAwareProviderCandidatesForPurpose("intent_classification")) {
    const attempt = await classifyIntentWithProvider(
      candidate,
      messages,
      secrets,
      spendGate,
    );
    attempts.push(attempt.log);
    if (attempt.success) {
      return { success: true, intent: attempt.intent, attempts };
    }
  }

  return {
    success: false,
    fallback: buildFallbackIntent(
      serviceType,
      problemChips,
      description,
      electricalPlaybookEnabled,
    ),
    failureReason: attempts.map((attempt) =>
      `${attempt.provider ?? "unknown"}:${attempt.failureReason ?? "failed"}`
    ).join("; "),
    attempts,
  };
}

export function resolveIntakeScopeConsistency(
  selectedService: string,
  intent: IntentResult,
) {
  const selected = getKaelPerformanceProfile(selectedService)?.service_type ?? null;
  const returned = intent.service_type === "unsupported"
    ? null
    : getKaelPerformanceProfile(intent.service_type)?.service_type ?? null;
  const suggested = intent.suggested_service
    ? getKaelPerformanceProfile(intent.suggested_service)?.service_type ?? null
    : null;

  if (!selected || intent.service_type === "unsupported" || intent.scope_signal === "out_of_scope") {
    return { scopeSignal: "out_of_scope" as const, suggestedService: null };
  }
  if (returned && returned !== selected) {
    return { scopeSignal: "service_mismatch" as const, suggestedService: returned };
  }
  if (intent.scope_signal === "service_mismatch") {
    if (suggested && suggested !== selected) {
      return { scopeSignal: "service_mismatch" as const, suggestedService: suggested };
    }
    return { scopeSignal: "out_of_scope" as const, suggestedService: null };
  }
  return { scopeSignal: "in_scope" as const, suggestedService: null };
}

async function classifyIntentWithProvider(
  route: { provider: AIProvider; model: string; latencyBudgetMs: number },
  messages: AIMessage[],
  secrets: EdgeAiSecrets,
  spendGate: KaelSpendGate,
): Promise<
  | { success: true; intent: IntentResult; log: IntentAttemptLog }
  | { success: false; log: IntentAttemptLog }
> {
  const attempt = await timed(() =>
    callStructuredAI({
      purpose: "intent_classification",
      provider: route.provider,
      model: route.model,
      messages,
      maxTokens: maxTokensForPurpose("intent_classification", 200),
      temperature: 0.1,
      timeoutMs: route.latencyBudgetMs,
      maxRetries: 0,
    }, intentResultSchema, secrets, spendGate)
  );
  const baseLog = {
    provider: route.provider,
    model: route.model,
    latencyMs: attempt.ms,
  };

  if (!attempt.result.success) {
    const schemaResponse = attempt.result.code === "SCHEMA_INVALID"
      ? attempt.result.response
      : undefined;
    return {
      success: false,
      log: {
        ...baseLog,
        success: false,
        failureReason: schemaResponse
          ? "AI intent JSON validation failed"
          : `AI call failed: ${attempt.result.code}`,
        ...(schemaResponse
          ? {
            inputTokens: schemaResponse.usage.inputTokens,
            outputTokens: schemaResponse.usage.outputTokens,
            costUsd: schemaResponse.usage.costUsd,
          }
          : {}),
      },
    };
  }

  return {
    success: true,
    intent: attempt.result.data,
    log: {
      ...baseLog,
      success: true,
      inputTokens: attempt.result.usage.inputTokens,
      outputTokens: attempt.result.usage.outputTokens,
      costUsd: attempt.result.usage.costUsd,
    },
  };
}

// Intake-diagnosis upgraded classifier that also decides whether to
// ask ONE clarification question, using recent conversation context. Same provider
// loop + fallback contract as classifyIntent; separate function so the legacy
// classifyIntent path stays byte-identical when the clarification flag is off.
export async function diagnoseIntake(
  serviceType: string,
  problemChips: string[],
  description: string,
  secrets: EdgeAiSecrets,
  spendGate: KaelSpendGate,
  conversationContext?: string,
  language: "vi" | "en" = "vi",
  electricalPlaybookEnabled = false,
): Promise<
  | { success: true; intent: IntentResult; attempts: IntentAttemptLog[] }
  | {
    success: false;
    fallback: IntentResult;
    failureReason: string;
    attempts: IntentAttemptLog[];
  }
> {
  const messages = buildIntakeDiagnosisMessages(
    sanitizeForLLM(serviceType),
    problemChips.map(sanitizeForLLM),
    description,
    conversationContext ? scrubSensitiveForLLM(conversationContext) : undefined,
    language,
  );
  const attempts: IntentAttemptLog[] = [];

  for (const candidate of circuitAwareProviderCandidatesForPurpose("intent_classification")) {
    const attempt = await diagnoseIntakeWithProvider(
      candidate,
      messages,
      secrets,
      spendGate,
    );
    attempts.push(attempt.log);
    if (attempt.success) {
      return { success: true, intent: attempt.intent, attempts };
    }
  }

  return {
    success: false,
    fallback: buildFallbackIntent(
      serviceType,
      problemChips,
      description,
      electricalPlaybookEnabled,
    ),
    failureReason: attempts.map((attempt) =>
      `${attempt.provider ?? "unknown"}:${attempt.failureReason ?? "failed"}`
    ).join("; "),
    attempts,
  };
}

async function diagnoseIntakeWithProvider(
  route: { provider: AIProvider; model: string; latencyBudgetMs: number },
  messages: AIMessage[],
  secrets: EdgeAiSecrets,
  spendGate: KaelSpendGate,
): Promise<
  | { success: true; intent: IntentResult; log: IntentAttemptLog }
  | { success: false; log: IntentAttemptLog }
> {
  // Raw maxTokens (not maxTokensForPurpose) so the richer structured diagnosis JSON
  // is not truncated by the intent route's tighter output cap.
  const attempt = await timed(() =>
    callStructuredAI({
      purpose: "intent_classification",
      provider: route.provider,
      model: route.model,
      messages,
      maxTokens: 320,
      temperature: 0.2,
      timeoutMs: route.latencyBudgetMs,
      maxRetries: 0,
    }, intentResultSchema, secrets, spendGate)
  );
  const baseLog = {
    provider: route.provider,
    model: route.model,
    latencyMs: attempt.ms,
  };

  if (!attempt.result.success) {
    const schemaResponse = attempt.result.code === "SCHEMA_INVALID"
      ? attempt.result.response
      : undefined;
    return {
      success: false,
      log: {
        ...baseLog,
        success: false,
        failureReason: schemaResponse
          ? "AI intake-diagnosis JSON validation failed"
          : `AI call failed: ${attempt.result.code}`,
        ...(schemaResponse
          ? {
            inputTokens: schemaResponse.usage.inputTokens,
            outputTokens: schemaResponse.usage.outputTokens,
            costUsd: schemaResponse.usage.costUsd,
          }
          : {}),
      },
    };
  }

  return {
    success: true,
    intent: attempt.result.data,
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
  electricalPlaybookEnabled = false,
): IntentResult {
  const hardRoute = electricalPlaybookEnabled && serviceType === "electrical"
    ? applyHardRoutingPolicy({ selectedService: "electrical", text: description })
    : null;
  if (hardRoute?.scopeSignal === "out_of_scope") {
    return {
      service_type: "unsupported",
      problem_slug: "unsupported",
      confidence: 1,
      needs_clarification: false,
      scope_signal: "out_of_scope",
      suggested_service: null,
    };
  }
  if (hardRoute?.scopeSignal === "service_mismatch" && hardRoute.suggestedService) {
    return {
      service_type: hardRoute.suggestedService,
      problem_slug: FALLBACK_PROBLEM_SLUG_BY_SERVICE[hardRoute.suggestedService],
      confidence: 1,
      needs_clarification: false,
      scope_signal: "service_mismatch",
      suggested_service: hardRoute.suggestedService,
    };
  }
  const supportedElectricalContext = electricalPlaybookEnabled &&
    serviceType === "electrical" &&
    hasElectricalInfrastructureContext(description);
  if (hasUnsupportedRepairIntent(description) && !supportedElectricalContext) {
    return {
      service_type: "unsupported",
      problem_slug: "unsupported",
      confidence: 0.2,
      needs_clarification: false,
    };
  }

  const profile = getKaelPerformanceProfile(serviceType);
  const validServiceType = profile?.service_type ?? "unsupported";
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
    "Vệ sinh điều hòa": "routine_hvac_cleaning",
    "Máy lạnh yếu": "weak_cooling",
    "Máy không mát": "no_cooling",
    "Chảy nước": "water_leak",
    "Kêu bất thường": "unusual_noise",
    "Có mã lỗi": "error_code",
    "Vệ sinh sofa": "sofa_cleaning",
    "Vệ sinh nệm": "mattress_cleaning",
    "Vệ sinh rèm": "curtain_cleaning",
    "Vệ sinh thảm": "carpet_cleaning",
    "Vết bẩn": "stain_treatment",
    "Mùi hôi/ẩm mốc": "odor_or_mold",
    "Khoan/lắp kệ": "drill_or_mount_shelf",
    "Lắp thanh rèm": "install_curtain_rod",
    "Lắp đèn/thiết bị nhỏ": "install_small_fixture",
    "Sửa bản lề/tay nắm": "repair_hinge_or_handle",
    "Lắp thiết bị phòng tắm": "install_bathroom_fixture",
    "Lắp TV/nội thất": "mount_tv_or_furniture",
  };
  const firstChip = problemChips[0] ?? "";
  const slug = slugMap[firstChip] ?? (validServiceType === "unsupported"
    ? "unsupported"
    : FALLBACK_PROBLEM_SLUG_BY_SERVICE[validServiceType]);
  return {
    service_type: validServiceType,
    problem_slug: slug,
    confidence: 0.3,
    needs_clarification: false,
  };
}
