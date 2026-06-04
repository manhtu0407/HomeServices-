import type { KaelPurpose } from "./types.ts";

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
  | "emergency_redirect";

export type KaelPermissionGateRequest = {
  purpose: KaelPurpose;
  actor: KaelActorRole;
  jobRelation: KaelJobRelation;
  action: KaelAction;
  topic: KaelTopic;
  actorId?: string | null;
  jobId?: string | null;
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
  from(table: import("../db-types.ts").PublicTableName): {
    insert(value: Record<string, unknown>): PromiseLike<unknown>;
  };
};

const DECLINE_TEMPLATES: Record<DeclineTemplateKey, string> = {
  out_of_scope_service:
    "Hiện Kael chỉ hỗ trợ sửa điện, sửa nước và dọn dẹp tại các căn hộ HCMC. Bạn vui lòng quay lại khi Kael mở thêm dịch vụ.",
  out_of_domain_question:
    "Câu hỏi này nằm ngoài phạm vi của Kael. Bạn vui lòng liên hệ hỗ trợ tại tab hồ sơ để được giúp.",
  cannot_do_action:
    "Kael không có thẩm quyền thực hiện điều này. {alternative}",
  unsafe_or_sensitive:
    "Kael không thể trả lời câu hỏi này. Nếu bạn cần hỗ trợ khẩn cấp, vui lòng gọi số 113.",
  rate_limit_hit:
    "Bạn đã hỏi Kael quá nhiều lần trong thời gian ngắn. Vui lòng đợi {seconds} giây.",
  cost_cap_hit:
    "Bạn đã đạt giới hạn yêu cầu Kael cho tháng này. Vui lòng liên hệ hỗ trợ.",
  legal_advice_redirect:
    "Câu hỏi này cần tư vấn pháp lý chuyên môn. Kael có thể cảnh báo về an toàn nhưng không tư vấn pháp lý. Vui lòng tham vấn luật sư.",
  emergency_redirect:
    "Kael nhận thấy tình huống này có vẻ khẩn cấp. Vui lòng gọi 113 hoặc 115 ngay lập tức.",
};

const SERVICE_TOPICS: readonly KaelTopic[] = [
  "electrical_repair",
  "plumbing_repair",
  "home_cleaning",
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
  scope_change: ["review_scope_change"],
  post_job_learning: ["write_memory", "create_learning_candidate"],
  educational_response: ["generate_advisory", "read_context"],
};

export function evaluateKaelPermissionGate(
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
    if (request.purpose === "scope_change" && request.jobRelation === "own_worker_job") {
      return allow(request, "ALLOW_WORKER_SCOPE_CHANGE");
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

export function renderDeclineTemplate(
  key: DeclineTemplateKey,
  values: { alternative?: string; seconds?: number } = {},
) {
  return DECLINE_TEMPLATES[key]
    .replace(
      "{alternative}",
      values.alternative ?? "Bạn có thể tiếp tục trong luồng hỗ trợ phù hợp.",
    )
    .replace("{seconds}", String(values.seconds ?? 60));
}

export async function auditKaelPermissionDecision(
  client: AuditClient,
  decision: KaelPermissionGateDecision,
) {
  if (decision.reasonCode === "COST_CAP_HIT") {
    await client.from("kael_advisory_audit").insert({
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
        ...(decision.safeMetadata ?? {}),
      },
    });
    return;
  }

  await client.from("kael_permission_audit").insert({
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
      ...(decision.safeMetadata ?? {}),
    },
  });
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
): KaelPermissionGateDecision {
  return {
    ...request,
    allowed: false,
    decision: "deny",
    reasonCode,
    declineTemplateKey,
    responseText: renderDeclineTemplate(declineTemplateKey),
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
