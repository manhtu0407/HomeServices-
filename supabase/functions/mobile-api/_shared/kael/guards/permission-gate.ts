import type { KaelPurpose } from "../types.ts";
import {
  retrieveLegalBoundaryPattern,
  type LegalBoundaryType,
} from "../knowledge.ts";
import { canonicalizeVN } from "../canonicalize-vn.ts";

export type KaelActorRole = "customer" | "worker" | "admin" | "system";
export type KaelJobRelation = "none" | "own_customer_job" | "own_worker_job" | "admin_review";
export type KaelAction =
  | "read_context"
  | "classify_intent"
  | "analyze_media"
  | "ask_clarification"
  | "synthesize_problem"
  | "lookup_market"
  | "synthesize_price"
  | "generate_advisory"
  | "generate_worker_brief"
  | "review_scope_change"
  | "write_memory"
  | "read_memory"
  | "create_learning_candidate"
  | "decline_response";
export type KaelTopic =
  | "electrical_repair"
  | "plumbing_repair"
  | "home_cleaning"
  | "hvac_service"
  | "upholstery_care"
  | "handyman_service"
  | "electrical_safety_education"
  | "plumbing_self_diagnosis"
  | "cleaning_best_practices"
  | "service_pricing_general_info"
  | "worker_qualification_explain"
  | "price_estimate"
  | "worker_brief"
  | "scope_change"
  | "job_status"
  | "app_usage_help"
  | "safety_advisory"
  | "worker_safety_advisory"
  | "legal_safety_awareness"
  | "support_redirect"
  | "medical_advice"
  | "legal_advice"
  | "financial_advice"
  | "other_workers_specific"
  | "other_jobs_specific"
  | "market_prediction"
  | "political_opinion"
  | "social_opinion"
  | "exact_guaranteed_price"
  | "fear_based_upsell"
  | "out_of_scope_services_anything";

export type DeclineTemplateKey =
  | "out_of_scope_service"
  | "out_of_domain_question"
  | "cannot_do_action"
  | "unsafe_or_sensitive"
  | "rate_limit_hit"
  | "cost_cap_hit"
  | "legal_advice_redirect"
  | "emergency_redirect"
  | "clarification_required";

export type KaelPermissionGateRequest = {
  purpose: KaelPurpose;
  actor: KaelActorRole;
  jobRelation: KaelJobRelation;
  action: KaelAction;
  topic: KaelTopic;
  intentConfidence: number;
  topicSource: "deterministic_rule" | "llm";
  boundarySignal: boolean;
  actorId?: string | null;
  jobId?: string | null;
  language?: "vi" | "en";
};

export type KaelPermissionGateOptions = {
  confidenceThreshold?: number | null;
};

export type KaelPermissionGateDecision = KaelPermissionGateRequest & {
  allowed: boolean;
  decision: "allow" | "deny" | "rate_limit" | "escalate";
  reasonCode: string;
  declineTemplateKey?: DeclineTemplateKey;
  responseText?: string;
  retryAfterMs?: number;
  safeMetadata?: Record<string, unknown>;
};

type AuditClient = {
  from(table: string): {
    insert(value: Record<string, unknown>): PromiseLike<unknown>;
  };
};

type BoundaryClient = Parameters<typeof retrieveLegalBoundaryPattern>[0];

const DECLINE_TEMPLATES: Record<"vi" | "en", Record<DeclineTemplateKey, string>> = {
  vi: {
    out_of_scope_service: "Vấn đề này nằm ngoài sáu nhóm dịch vụ nhà ở Kael đang hỗ trợ tại TP.HCM.",
    out_of_domain_question: "Câu hỏi này nằm ngoài phạm vi của Kael. Bạn vui lòng liên hệ hỗ trợ tại tab hồ sơ để được giúp.",
    cannot_do_action: "Kael không có thẩm quyền thực hiện điều này. {alternative}",
    unsafe_or_sensitive: "Kael không thể trả lời câu hỏi này. Nếu bạn cần hỗ trợ khẩn cấp, vui lòng gọi số 113.",
    rate_limit_hit: "Bạn đã hỏi Kael quá nhiều lần trong thời gian ngắn. Vui lòng đợi {seconds} giây.",
    cost_cap_hit: "Bạn đã đạt giới hạn yêu cầu Kael cho tháng này. Vui lòng liên hệ hỗ trợ.",
    legal_advice_redirect: "Câu hỏi này cần tư vấn pháp lý chuyên môn. Kael có thể cảnh báo về an toàn nhưng không tư vấn pháp lý. Vui lòng tham vấn luật sư.",
    emergency_redirect: "Kael nhận thấy tình huống này có vẻ khẩn cấp. Vui lòng gọi 113 hoặc 115 ngay lập tức.",
    clarification_required: "Để Kael hỗ trợ đúng và an toàn, bạn vui lòng nêu rõ nhu cầu, bối cảnh và kết quả bạn muốn hỏi.",
  },
  en: {
    out_of_scope_service: "This is outside the six HCMC home-service categories Kael currently supports.",
    out_of_domain_question: "This question is outside Kael's scope. Please contact support from your profile tab.",
    cannot_do_action: "Kael is not authorized to perform that action. {alternative}",
    unsafe_or_sensitive: "Kael cannot answer that safely. If this is an emergency, call 113 or 115 now.",
    rate_limit_hit: "You have sent too many Kael requests in a short time. Please wait {seconds} seconds.",
    cost_cap_hit: "You have reached the current Kael request limit. Please contact support.",
    legal_advice_redirect: "This requires professional legal advice. Kael can provide general safety awareness, but not legal advice. Please consult a lawyer.",
    emergency_redirect: "This may be an emergency. Please call 113 or 115 now.",
    clarification_required: "To help safely, Kael needs a clearer request, context, and desired outcome.",
  },
};

const SERVICE_TOPICS: readonly KaelTopic[] = [
  "electrical_repair",
  "plumbing_repair",
  "home_cleaning",
  "hvac_service",
  "upholstery_care",
  "handyman_service",
];
const EDUCATIONAL_TOPICS: readonly KaelTopic[] = [
  ...SERVICE_TOPICS,
  "electrical_safety_education",
  "plumbing_self_diagnosis",
  "cleaning_best_practices",
  "service_pricing_general_info",
  "worker_qualification_explain",
  "worker_safety_advisory",
  "legal_safety_awareness",
  "support_redirect",
];
const ACTIONS_BY_PURPOSE: Record<KaelPurpose, readonly KaelAction[]> = {
  intent_classification: ["classify_intent"],
  vision_analysis: ["analyze_media"],
  clarification: ["ask_clarification"],
  problem_synthesis: ["synthesize_problem"],
  market_lookup: ["lookup_market"],
  price_synthesis: ["synthesize_price"],
  advisory_generation: ["generate_advisory"],
  worker_brief: ["generate_worker_brief"],
  worker_assist: ["read_context", "generate_advisory", "ask_clarification"],
  scope_change: ["review_scope_change"],
  job_incident: ["read_context", "ask_clarification", "generate_advisory"],
  post_job_learning: ["write_memory", "create_learning_candidate"],
  educational_response: ["generate_advisory", "read_context"],
};

export function evaluateKaelPermissionGate(
  request: KaelPermissionGateRequest,
  options: KaelPermissionGateOptions = {},
): KaelPermissionGateDecision {
  const preflight = confidenceAndBoundaryDecision(request, options);
  if (preflight) return preflight;
  return evaluateAllowedTopic(request);
}

export async function evaluateKaelPermissionGateWithBoundaries(
  request: KaelPermissionGateRequest,
  client?: BoundaryClient,
  options: KaelPermissionGateOptions = {},
): Promise<KaelPermissionGateDecision> {
  const preflight = confidenceAndBoundaryDecision(request, options);
  if (preflight) return preflight;

  const forbidden = await forbiddenTopicDecisionWithBoundaries(
    request.topic,
    client,
  );
  if (forbidden) {
    return deny(request, forbidden.reasonCode, forbidden.template, {
      responseText: forbidden.responseText,
      safeMetadata: forbidden.safeMetadata,
    });
  }

  return evaluateAllowedTopic(request);
}

function evaluateAllowedTopic(
  request: KaelPermissionGateRequest,
): KaelPermissionGateDecision {
  if (
    request.actor === "worker" &&
    request.jobRelation === "none" &&
    (request.purpose === "worker_brief" || request.topic === "other_jobs_specific")
  ) {
    return deny(request, "DENY_WORKER_PRE_ACCEPT_PII", "cannot_do_action");
  }

  const forbidden = forbiddenTopicDecision(request.topic);
  if (forbidden) return deny(request, forbidden.reasonCode, forbidden.template);

  if (request.actor === "admin") return allow(request, "ALLOW_ADMIN");
  if (request.purpose === "educational_response") {
    return EDUCATIONAL_TOPICS.includes(request.topic) &&
        ACTIONS_BY_PURPOSE.educational_response.includes(request.action)
      ? allow(request, "ALLOW_EDUCATIONAL_RESPONSE")
      : deny(request, "DENY_TOPIC_NOT_ALLOWED", "out_of_domain_question");
  }
  if (request.actor === "system") {
    return request.purpose === "post_job_learning"
      ? allow(request, "ALLOW_SYSTEM_LEARNING")
      : deny(request, "DENY_SYSTEM_PURPOSE", "cannot_do_action");
  }
  if (request.actor === "worker") {
    if (request.purpose === "worker_brief" && request.jobRelation === "own_worker_job") {
      return allow(request, "ALLOW_WORKER_BRIEF");
    }
    if (request.purpose === "worker_assist" && request.jobRelation === "own_worker_job") {
      return ACTIONS_BY_PURPOSE.worker_assist.includes(request.action)
        ? allow(request, "ALLOW_WORKER_ASSIST")
        : deny(request, "DENY_WORKER_ASSIST_ACTION", "cannot_do_action");
    }
    if (request.purpose === "scope_change" && request.jobRelation === "own_worker_job") {
      return allow(request, "ALLOW_WORKER_SCOPE_CHANGE");
    }
    if (request.purpose === "job_incident" && request.jobRelation === "own_worker_job") {
      return ACTIONS_BY_PURPOSE.job_incident.includes(request.action)
        ? allow(request, "ALLOW_WORKER_JOB_INCIDENT")
        : deny(request, "DENY_WORKER_JOB_INCIDENT_ACTION", "cannot_do_action");
    }
    return deny(request, "DENY_WORKER_JOB_REQUIRED", "cannot_do_action");
  }
  if (
    ["price_synthesis", "market_lookup", "scope_change", "vision_analysis", "problem_synthesis"]
      .includes(request.purpose) &&
    request.jobRelation !== "own_customer_job"
  ) {
    return deny(request, "DENY_CUSTOMER_JOB_REQUIRED", "cannot_do_action");
  }
  return ACTIONS_BY_PURPOSE[request.purpose].includes(request.action)
    ? allow(request, `ALLOW_${request.purpose.toUpperCase()}`)
    : deny(request, "DENY_ACTION_NOT_ALLOWED", "cannot_do_action");
}

function confidenceAndBoundaryDecision(
  request: KaelPermissionGateRequest,
  options: KaelPermissionGateOptions,
): KaelPermissionGateDecision | null {
  if (request.topicSource === "llm") {
    if (!Number.isFinite(request.intentConfidence) || request.intentConfidence < 0 || request.intentConfidence > 1) {
      return deny(request, "DENY_INTENT_CONFIDENCE_INVALID", "clarification_required");
    }

    const threshold = configuredConfidenceThreshold(options);
    if (threshold === null) {
      return deny(request, "DENY_INTENT_CONFIDENCE_UNCONFIGURED", "clarification_required", {
        safeMetadata: { confidence_threshold_configured: false },
      });
    }
    if (request.intentConfidence < threshold) {
      return deny(request, "DENY_INTENT_CONFIDENCE_LOW", "clarification_required", {
        safeMetadata: {
          confidence_threshold: threshold,
          confidence_threshold_configured: true,
        },
      });
    }
  }

  if (requiresBoundarySignal(request.topic) && !request.boundarySignal) {
    return deny(request, "DENY_FORBIDDEN_TOPIC_UNCONFIRMED", "clarification_required", {
      safeMetadata: { boundary_signal_confirmed: false },
    });
  }
  return null;
}

function configuredConfidenceThreshold(
  options: KaelPermissionGateOptions,
): number | null {
  const denoRuntime = (globalThis as {
    Deno?: { env: { get(name: string): string | undefined } };
  }).Deno;
  const environmentValue = denoRuntime?.env.get("KAEL_PERMISSION_CONFIDENCE_THRESHOLD");
  const configured = options.confidenceThreshold ?? environmentValue;
  const value = typeof configured === "number"
    ? configured
    : typeof configured === "string" && configured.trim().length > 0
    ? Number(configured)
    : Number.NaN;
  return Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function requiresBoundarySignal(topic: KaelTopic): boolean {
  return topic === "legal_advice" ||
    topic === "medical_advice" ||
    topic === "financial_advice" ||
    topic === "exact_guaranteed_price" ||
    topic === "fear_based_upsell";
}

export function hasKaelForbiddenTopicBoundarySignal(
  topic: KaelTopic,
  text: string,
): boolean {
  const canonicalText = canonicalizeVN(text);
  const patterns = topic === "legal_advice"
    ? ["khoi kien", "luat su", "toa an", "don kien", "hop dong phap ly", "legal advice", "lawyer", "attorney", "lawsuit", "sue the"]
    : topic === "medical_advice"
    ? ["y te", "tai nan", "benh", "medical", "hospital"]
    : topic === "financial_advice"
    ? ["ty gia"]
    : topic === "exact_guaranteed_price"
    ? ["gia chot dung", "tra dung so tien nay"]
    : topic === "fear_based_upsell"
    ? ["neu khong sua ngay", "neu khong lam ngay", "nguy hiem chet nguoi", "chay no tuc thi"]
    : [];
  return patterns.some((pattern) => canonicalText.includes(pattern));
}

export function renderDeclineTemplate(
  key: DeclineTemplateKey,
  values: { alternative?: string; seconds?: number } = {},
  language: "vi" | "en" = "vi",
) {
  return DECLINE_TEMPLATES[language][key]
    .replace(
      "{alternative}",
      values.alternative ?? (language === "vi"
        ? "Bạn có thể tiếp tục trong luồng hỗ trợ phù hợp."
        : "You can continue through the appropriate support flow."),
    )
    .replace("{seconds}", String(values.seconds ?? 60));
}

export async function auditKaelPermissionDecision(
  client: AuditClient,
  decision: KaelPermissionGateDecision,
) {
  if (decision.reasonCode === "COST_CAP_HIT") {
    await persistPermissionAudit(client, "kael_advisory_audit", {
      job_id: decision.jobId ?? null,
      actor_id: decision.actorId ?? null,
      purpose: decision.purpose,
      advisory_type: "cost_cap_hit",
      template_key: decision.declineTemplateKey ?? null,
      safe_metadata: {
        reason_code: decision.reasonCode,
        decision: decision.decision,
        topic: decision.topic,
        action: decision.action,
        intent_confidence: decision.intentConfidence,
        topic_source: decision.topicSource,
        boundary_signal: decision.boundarySignal,
        ...(decision.safeMetadata ?? {}),
      },
    }, "KAEL_ADVISORY_AUDIT_FAILED");
    return;
  }

  await persistPermissionAudit(client, "kael_permission_audit", {
    job_id: decision.jobId ?? null,
    actor_id: decision.actorId ?? null,
    actor_role: decision.actor,
    purpose: decision.purpose,
    action: decision.action,
    topic: decision.topic,
    decision: decision.decision,
    reason_code: decision.reasonCode,
    safe_metadata: {
      job_relation: decision.jobRelation,
      template_key: decision.declineTemplateKey ?? null,
      intent_confidence: decision.intentConfidence,
      topic_source: decision.topicSource,
      boundary_signal: decision.boundarySignal,
      ...(decision.safeMetadata ?? {}),
    },
  }, "KAEL_PERMISSION_AUDIT_FAILED");
}

async function persistPermissionAudit(
  client: AuditClient,
  table: string,
  value: Record<string, unknown>,
  failureCode: string,
): Promise<void> {
  try {
    const result = await client.from(table).insert(value);
    if (
      !result || typeof result !== "object" || !("error" in result) ||
      Boolean((result as { error: unknown }).error)
    ) {
      throw new Error(failureCode);
    }
  } catch {
    throw new Error(failureCode);
  }
}

function allow(
  request: KaelPermissionGateRequest,
  reasonCode: string,
): KaelPermissionGateDecision {
  return {
    ...request,
    allowed: true,
    decision: "allow",
    reasonCode,
  };
}

function deny(
  request: KaelPermissionGateRequest,
  reasonCode: string,
  declineTemplateKey: DeclineTemplateKey,
  options: {
    responseText?: string | null;
    safeMetadata?: Record<string, unknown>;
  } = {},
): KaelPermissionGateDecision {
  return {
    ...request,
    allowed: false,
    decision: "deny",
    reasonCode,
    declineTemplateKey,
    responseText: request.language === "en"
      ? renderDeclineTemplate(declineTemplateKey, {}, "en")
      : options.responseText ?? renderDeclineTemplate(declineTemplateKey),
    safeMetadata: options.safeMetadata,
  };
}

async function forbiddenTopicDecisionWithBoundaries(
  topic: KaelTopic,
  client?: BoundaryClient,
): Promise<{
  reasonCode: string;
  template: DeclineTemplateKey;
  responseText?: string | null;
  safeMetadata?: Record<string, unknown>;
} | null> {
  if (topic === "legal_advice") {
    return boundaryDecision(
      topic,
      "redirect_required",
      "DENY_LEGAL_ADVICE",
      "legal_advice_redirect",
      client,
    );
  }
  if (topic === "medical_advice") {
    const emergency = await boundaryDecision(
      topic,
      "emergency_redirect",
      "DENY_MEDICAL_ADVICE",
      "emergency_redirect",
      client,
    );
    return emergency.responseText
      ? emergency
      : {
        reasonCode: "DENY_MEDICAL_ADVICE",
        template: "unsafe_or_sensitive",
        safeMetadata: emergency.safeMetadata,
      };
  }
  return forbiddenTopicDecision(topic);
}

async function boundaryDecision(
  topic: KaelTopic,
  boundaryType: LegalBoundaryType,
  reasonCode: string,
  fallbackTemplate: DeclineTemplateKey,
  client?: BoundaryClient,
) {
  const boundary = await retrieveLegalBoundaryPattern(client, {
    topic,
    boundaryType,
  });
  return {
    reasonCode,
    template: fallbackTemplate,
    responseText: boundary.guidance,
    safeMetadata: boundary.safeMetadata,
  };
}

function forbiddenTopicDecision(topic: KaelTopic): {
  reasonCode: string;
  template: DeclineTemplateKey;
} | null {
  if (topic === "legal_advice") {
    return { reasonCode: "DENY_LEGAL_ADVICE", template: "legal_advice_redirect" };
  }
  if (topic === "out_of_scope_services_anything") {
    return { reasonCode: "DENY_OUT_OF_SCOPE_SERVICE", template: "out_of_scope_service" };
  }
  if (topic === "medical_advice") {
    return { reasonCode: "DENY_MEDICAL_ADVICE", template: "unsafe_or_sensitive" };
  }
  if (topic === "financial_advice") {
    return { reasonCode: "DENY_FINANCIAL_ADVICE", template: "out_of_domain_question" };
  }
  if (topic === "exact_guaranteed_price") {
    return { reasonCode: "DENY_EXACT_GUARANTEED_PRICE", template: "cannot_do_action" };
  }
  if (topic === "fear_based_upsell") {
    return { reasonCode: "DENY_FEAR_BASED_UPSELL", template: "unsafe_or_sensitive" };
  }
  if (
    topic === "other_workers_specific" ||
    topic === "other_jobs_specific" ||
    topic === "market_prediction" ||
    topic === "political_opinion" ||
    topic === "social_opinion"
  ) {
    return { reasonCode: "DENY_FORBIDDEN_TOPIC", template: "out_of_domain_question" };
  }
  return null;
}
