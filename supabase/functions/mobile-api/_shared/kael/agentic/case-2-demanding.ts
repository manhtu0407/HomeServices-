import type {
  DemandingCustomerDetection,
  DemandingCustomerEscalationLevel,
} from "./demanding-customer-detect.ts";
import { renderEmpathyTemplateV2 } from "../decline-templates.ts";
import { detectForbiddenAiDecisionText } from "../ai-boundary-contract.ts";

export type DemandingCustomerStrategyId =
  | "transparency_expansion"
  | "empathy_factual"
  | "soft_escalation"
  | "hard_escalation"
  | "defensive_documentation";

export type DemandingCustomerResponseContext = {
  readonly priceReasoning?: string;
  readonly marketSource?: string;
  readonly workerCredentials?: {
    readonly completedJobs: number;
    readonly rating: number;
  };
};

export type DemandingCustomerCaseResponse = {
  readonly strategyIds: readonly DemandingCustomerStrategyId[];
  readonly responseText: string;
  readonly adminQueuePriority: "none" | "medium" | "high";
  readonly stopAiLoop: boolean;
  readonly defensiveLogRequired: true;
  readonly showTransparency: boolean;
};

export type DemandingInteractionDbClient = {
  from(table: string): {
    insert(value: unknown): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  };
};

export type RecordDemandingCustomerInteractionInput = {
  readonly jobId: string | null;
  readonly actorId: string | null;
  readonly actorRole: "customer" | "worker" | "admin" | "system";
  readonly message: string;
  readonly detection: DemandingCustomerDetection;
  readonly response: DemandingCustomerCaseResponse;
};

export function buildDemandingCustomerResponse(
  detection: DemandingCustomerDetection,
  context: DemandingCustomerResponseContext = {},
  language: "vi" | "en" = "vi",
): DemandingCustomerCaseResponse {
  if (detection.escalationLevel === "hard") {
    return {
      strategyIds: ["hard_escalation", "defensive_documentation"],
      responseText: safeDemandingResponseText(
        language === "en"
          ? "I understand that you need a clear review. Kael has paused the automatic response loop and sent the collected information for human support review."
          : renderEmpathyTemplateV2("complaint_threat_acknowledge"),
        language,
      ),
      adminQueuePriority: "high",
      stopAiLoop: true,
      defensiveLogRequired: true,
      showTransparency: false,
    };
  }

  if (detection.escalationLevel === "soft") {
    return {
      strategyIds: ["empathy_factual", "soft_escalation", "defensive_documentation"],
      responseText: safeDemandingResponseText(
        language === "en"
          ? "I understand that you need clearer information. Kael has recorded the concern and will keep the case in its current phase while the details are reviewed."
          : renderEmpathyTemplateV2("pressure_acknowledge"),
        language,
      ),
      adminQueuePriority: "medium",
      stopAiLoop: false,
      defensiveLogRequired: true,
      showTransparency: false,
    };
  }

  const credentialText = context.workerCredentials
    ? language === "en"
      ? `The worker has completed ${context.workerCredentials.completedJobs} jobs with a ${context.workerCredentials.rating}/5 rating.`
      : `Thợ đã hoàn tất ${context.workerCredentials.completedJobs} việc với rating ${context.workerCredentials.rating}/5.`
    : "";
  const sourceText = context.marketSource
    ? language === "en"
      ? " Reference source: governed market evidence."
      : ` Nguồn tham chiếu: ${context.marketSource}.`
    : "";
  const reasoning = language === "en"
    ? "Kael uses the description, area, complexity, and available governed pricing evidence."
    : context.priceReasoning ??
      "Kael dựa trên mô tả, khu vực, độ phức tạp và dữ liệu giá nền hiện có.";
  const templateKey = detection.legitimateConcernSignals.includes("wait_time_concern")
    ? "wait_time_concern"
    : detection.legitimateConcernSignals.includes("service_quality_concern")
    ? "service_quality_concern"
    : detection.legitimateConcernSignals.includes("request_credentials") &&
        !detection.legitimateConcernSignals.includes("request_breakdown")
    ? "worker_concern"
    : "price_concern";
  const responseText = language === "en"
    ? englishDemandingResponse(templateKey, reasoning, credentialText, sourceText)
    : templateKey === "worker_concern"
    ? renderEmpathyTemplateV2(templateKey, {
      worker_summary: credentialText || "Kael sẽ chỉ hiển thị thông tin thợ sau khi có dữ liệu phù hợp.",
    })
    : renderEmpathyTemplateV2(templateKey, { reasoning }) + sourceText +
      (credentialText ? ` ${credentialText}` : "");
  return {
    strategyIds: ["transparency_expansion", "empathy_factual", "defensive_documentation"],
    responseText: safeDemandingResponseText(responseText, language),
    adminQueuePriority: "none",
    stopAiLoop: false,
    defensiveLogRequired: true,
    showTransparency: true,
  };
}

function safeDemandingResponseText(text: string, language: "vi" | "en" = "vi") {
  if (detectForbiddenAiDecisionText(text).allowed) return text;
  return language === "en"
    ? "I understand that you need clearer information. Kael has recorded the concern for review."
    : renderEmpathyTemplateV2("pressure_acknowledge");
}

function englishDemandingResponse(
  templateKey: "wait_time_concern" | "service_quality_concern" | "worker_concern" | "price_concern",
  reasoning: string,
  credentialText: string,
  sourceText: string,
) {
  if (templateKey === "wait_time_concern") {
    return "I understand that the arrival time matters. Kael only shows timing from the real job state and will not invent an ETA.";
  }
  if (templateKey === "service_quality_concern") {
    return "I understand that service quality matters. Kael keeps the evidence and confirmed scope available for review before the workflow moves forward.";
  }
  if (templateKey === "worker_concern") {
    return credentialText ||
      "I understand that you want to review the worker. Kael will only show a real eligible worker profile when one is available.";
  }
  return `I understand that you want a clear price explanation. ${reasoning}${sourceText}${
    credentialText ? ` ${credentialText}` : ""
  }`;
}

export async function recordDemandingCustomerInteraction(
  client: DemandingInteractionDbClient,
  input: RecordDemandingCustomerInteractionInput,
) {
  const safeMetadata = {
    strategy_ids: input.response.strategyIds,
    pressure_score: input.detection.pressureScore,
    pressure_signal_count: input.detection.pressureSignals.length,
    legitimate_signal_count: input.detection.legitimateConcernSignals.length,
    stop_ai_loop: input.response.stopAiLoop,
  };
  await client.from("kael_interaction_log").insert({
    job_id: input.jobId,
    actor_id: input.actorId,
    actor_role: input.actorRole,
    interaction_type: "demanding_customer",
    nuance: input.detection.nuance,
    expected_nuance: input.detection.expectedNuance,
    escalation_level: input.detection.escalationLevel,
    legitimate_concern_signals: input.detection.legitimateConcernSignals,
    pressure_signals: input.detection.pressureSignals,
    strategy_ids: input.response.strategyIds,
    sanitized_excerpt: sanitizeInteractionExcerpt(input.message),
    safe_metadata: safeMetadata,
  });

  if (input.response.adminQueuePriority === "none") return;
  await client.from("kael_admin_queue").insert({
    job_id: input.jobId,
    actor_id: input.actorId,
    actor_role: input.actorRole,
    queue_type: "demanding_customer",
    priority: input.response.adminQueuePriority,
    status: "open",
    escalation_level: input.detection.escalationLevel,
    reason_code: reasonCode(input.detection),
    response_summary: responseSummary(input.detection.escalationLevel),
    safe_metadata: safeMetadata,
  });
}

function reasonCode(detection: DemandingCustomerDetection): string {
  return detection.pressureSignals[0] ?? detection.legitimateConcernSignals[0] ?? "demanding_customer";
}

function responseSummary(level: DemandingCustomerEscalationLevel): string {
  if (level === "hard") return "admin_contact_within_30_minutes";
  if (level === "soft") return "admin_background_review_customer_continues";
  return "defensive_log_only";
}

function sanitizeInteractionExcerpt(message: string): string {
  return message
    .replace(/\d{7,}/g, "[redacted-number]")
    .replace(/[^\S\r\n]+/g, " ")
    .trim()
    .slice(0, 240);
}
