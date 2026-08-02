import type { ServiceType } from "./types.ts";
import type { CustomerAssistantSuggestedAction } from "./customer-assistant-provider-output.ts";
import type { KaelTopic } from "./kael-guardrails/permission-gate.ts";
import { getKaelPerformanceProfile } from "./performance-profiles.ts";
import type { ProviderChoice } from "./kael-providers/routing.ts";
import { buildNoProviderTrace, buildProviderAttemptTrace } from "./trace.ts";
import { scrubSensitiveForLLM } from "./utils.ts";

export type CustomerAssistantSurface = "customer_normal" | "customer_case";

export type CustomerAssistantJobContext = {
  readonly id: string;
  readonly status?: string | null;
  readonly service_type?: string | null;
  readonly description?: string | null;
  readonly address_district?: string | null;
  readonly kael_problem_identified?: string | null;
  readonly kael_complexity?: string | null;
  readonly kael_advisory?: string | null;
  readonly payment_status?: string | null;
};

export function shouldRetrieveGeneralKnowledge(topic: KaelTopic) {
  return topic === "worker_qualification_explain" ||
    topic === "service_trust_safety" ||
    topic === "legal_safety_awareness" ||
    topic === "service_pricing_general_info" ||
    topic === "support_redirect";
}

export function assistantSafeText(value: unknown, maxLength: number) {
  return scrubSensitiveForLLM(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .slice(0, maxLength)
    .trim();
}

export function buildCustomerAssistantNoProviderTrace(surface: CustomerAssistantSurface) {
  const path = customerAssistantPath(surface);
  return buildNoProviderTrace({
    workflowPhase: path.workflowPhase,
    actorRole: "customer",
    action: path.action,
    policyId: path.policyId,
    purpose: "educational_response",
    reasonCode: "NO_PROVIDER_AVAILABLE",
    safeMetadata: { surface },
  });
}

export function buildCustomerAssistantProviderTrace(
  surface: CustomerAssistantSurface,
  route: ProviderChoice,
  result: "success" | "error" | "schema_invalid",
  options: {
    readonly code?: string;
    readonly latencyMs?: number;
    readonly costUsd?: number;
    readonly fallbackUsed: boolean;
  },
) {
  const path = customerAssistantPath(surface);
  return buildProviderAttemptTrace({
    workflowPhase: path.workflowPhase,
    actorRole: "customer",
    action: path.action,
    policyId: path.policyId,
    purpose: "educational_response",
    provider: route.provider,
    model: route.model,
    latencyMs: options.latencyMs,
    costUsd: options.costUsd,
    result,
    code: options.code,
    fallbackUsed: options.fallbackUsed,
    safeMetadata: { surface },
  });
}

export function normalizeCitations(
  values: readonly string[],
  allowlistedValues: readonly string[],
) {
  const allowlist = new Set(allowlistedValues
    .map((value) => assistantSafeText(value, 180))
    .filter(Boolean));
  return Array.from(new Set(values
    .map((value) => assistantSafeText(value, 180))
    .filter((value) => Boolean(value) && allowlist.has(value))))
    .slice(0, 5);
}

export function normalizeActions(
  actions: readonly CustomerAssistantSuggestedAction[],
  surface: CustomerAssistantSurface,
  topic: KaelTopic,
) {
  const defaults: CustomerAssistantSuggestedAction[] = surface === "customer_case"
    ? ["check_job", "message_worker"]
    : topic === "service_pricing_general_info"
    ? ["open_booking"]
    : [];
  return Array.from(new Set([...actions, ...defaults])).slice(0, 3);
}

export function inferAssistantServiceType(
  text: string,
  job?: CustomerAssistantJobContext | null,
): ServiceType | null {
  const jobProfile = getKaelPerformanceProfile(job?.service_type ?? "");
  if (jobProfile) return jobProfile.service_type;
  const normalized = normalizeText(text);
  if (/\b(dieu hoa|may lanh|dan lanh|dan nong|khong mat|lam lanh yeu|ma loi|air conditioner|air conditioning|hvac|ac unit|not cooling)\b/.test(normalized)) {
    return "hvac";
  }
  if (/\b(sofa|nem|rem|tham|vai boc|giat sofa|giat nem|vet ban|mui hoi|am moc|upholstery|mattress|curtain|carpet|fabric stain)\b/.test(normalized)) {
    return "upholstery";
  }
  if (/\b(khoan tuong|lap ke|lap thanh rem|ban le|tay nam|treo tv|lap tv|sua vat|handyman|mount shelf|hang tv|door hinge|cabinet handle)\b/.test(normalized)) {
    return "handyman";
  }
  if (/\b(dien|day dien|o cam|o dien|cong tac|cau dao|aptomat|mat dien|den|chap|electrical|wire|wiring|outlet|socket|circuit breaker|power outage|light switch)\b/.test(normalized)) {
    return "electrical";
  }
  if (/\b(nuoc|ong|voi|lavabo|bon|toilet|ro|ri|tac|ap nuoc|plumbing|pipe|pipes|faucet|leak|clog|water pressure)\b/.test(normalized)) {
    return "plumbing";
  }
  if (/\b(don dep|ve sinh|lau don|bep|phong tam|cua kinh|sau sua chua|rac|bui|cleaning|housekeeping|kitchen|bathroom|dust|trash)\b/.test(normalized)) {
    return "cleaning";
  }
  return null;
}

export function classifyAssistantTopic(text: string, serviceType: ServiceType | null): KaelTopic {
  const normalized = normalizeText(text);
  if (/\b(lua dao|scam|fraud|gia mao|mao danh|otp|ma xac nhan|duong dan la|link la|qr la|dat coc|chuyen khoan truoc|ngoai ung dung|ngoai luong|tai khoan ca nhan|tai khoan khac|ep thanh toan|doi gia|thu them phi|giu giay to|xin can cuoc|chup can cuoc)\b/.test(normalized)) {
    return "service_trust_safety";
  }
  if (/\b(son nha|khoa cua|chuyen nha|diet con trung|internet|camera|tu lanh|house painting|locksmith|moving service|pest control|refrigerator)\b/.test(normalized)) {
    return "out_of_scope_services_anything";
  }
  if (/\b(co phieu|chung khoan|dau tu|tien ao|crypto|forex|lai suat|stock|investment|cryptocurrency)\b/.test(normalized)) {
    return "financial_advice";
  }
  if (/\b(chuan doan benh|don thuoc|lieu thuoc|benh gi|medical diagnosis|prescription|dosage)\b/.test(normalized)) {
    return "medical_advice";
  }
  if (/\b(chinh tri|bau cu|ung cu vien|dang phai|politics|election|political party)\b/.test(normalized)) {
    return "political_opinion";
  }
  if (/\b(truoc khi tho den|truoc luc tho den|cho tho toi|sau khi tho xong|nghiem thu voi tho|tho lam co an toan|before the worker visits|before a worker visits|after the worker finishes|worker visit|service visit)\b/.test(normalized)) {
    return "service_trust_safety";
  }
  if (/\b(khoi kien|luat su|toa an|don kien|hop dong phap ly|legal advice|lawyer|attorney|sue|lawsuit|court filing)\b/.test(normalized)) {
    return "legal_advice";
  }
  if (/\b(luat|phap ly|trach nhiem|bao hanh|boi thuong|hoa don|bien ban|legal awareness|warranty|liability|compensation|invoice)\b/.test(normalized)) {
    return "legal_safety_awareness";
  }
  if (/\b(gia|bao nhieu|uoc tinh|phi|tien cong|bao gia|price|pricing|estimate|cost|fee|quote)\b/.test(normalized)) {
    return "service_pricing_general_info";
  }
  if (
    /\b(xac minh tho|ho so tho|thong tin tho|tay nghe|danh gia tho|chap nhan viec|huy viec|worker verification|worker profile|worker rating)\b/.test(normalized) ||
    /\btho\b.{0,36}\b(xac minh|danh gia|tay nghe|uy tin)\b/.test(normalized) ||
    /\bworker\b.{0,36}\b(verified|verification|rating|qualified)\b/.test(normalized)
  ) {
    return "worker_qualification_explain";
  }
  if (serviceType === "electrical") return "electrical_repair";
  if (serviceType === "plumbing") return "plumbing_repair";
  if (serviceType === "cleaning") return "home_cleaning";
  if (serviceType === "hvac") return "hvac_service";
  if (serviceType === "upholstery") return "upholstery_care";
  if (serviceType === "handyman") return "handyman_service";
  if (/\b(cach dat lich|dat lich|huy lich|cach dung|ung dung|ho so|ho tro|trang thai cong viec|thanh toan|vietqr|hoan tien|how to book|booking|cancel booking|how to use|app help|job status|payment|refund)\b/.test(normalized)) {
    return "app_usage_help";
  }
  if (/^(xin chao|chao|hello|hi|hey|kael|giup toi|help me)[.!? ]*$/.test(normalized)) {
    return "support_redirect";
  }
  return "out_of_scope_services_anything";
}

export function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function customerAssistantPath(surface: CustomerAssistantSurface) {
  return surface === "customer_case"
    ? {
      workflowPhase: "offer_ready",
      action: "customer.open_case_chat",
      policyId: "kael.path.customer_case_chat_revision.v1",
    } as const
    : {
      workflowPhase: "intake",
      action: "customer.submit_intake",
      policyId: "kael.path.customer_intake_to_estimate.v1",
    } as const;
}
