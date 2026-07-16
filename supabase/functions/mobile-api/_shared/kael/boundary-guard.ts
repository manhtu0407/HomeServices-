// Pre-pipeline boundary guard for Kael chat.
// Rejects out-of-scope topics, prompt-injection attempts, and messages that
// contradict the customer-selected service_type BEFORE any provider call,
// so cost stays at 0 for declined turns and Kael never returns an estimate
// for content violating RULES.md #6 (service scope) or #8 (no fake/off-topic
// estimates).
//
// Deterministic, server-side, dependency-free. An AI-driven off-topic
// classifier may be layered on top; this deterministic gate remains the
// zero-cost baseline.

import type { ServiceType } from "../../../_shared/domain.ts";
import { KAEL_CASE_WORK_SERVICE_TYPES } from "./performance-profiles.ts";

export type BoundaryReason =
  | "prompt_injection"
  | "out_of_scope"
  | "service_mismatch";

export type BoundaryDecision =
  | { ok: true }
  | {
    ok: false;
    reason: BoundaryReason;
    declineText: string;
    detectedSignals: string[];
    suggestedService?: ServiceType;
  };

export type BoundaryInjectionClassifier = (input: {
  readonly text: string;
  readonly normalizedText: string;
  readonly selectedService: ServiceType;
}) => { detected: boolean; signals: readonly string[] };

export type BoundaryGuardOptions = {
  readonly semanticInjectionClassifierEnabled?: boolean;
  readonly injectionClassifier?: BoundaryInjectionClassifier;
  readonly language?: "vi" | "en";
};

const SUPPORTED_SERVICES: readonly ServiceType[] = KAEL_CASE_WORK_SERVICE_TYPES;

// Prompt-injection sentinels. Matched against the raw message (case-insensitive)
// and against the NFD-normalized form to catch unaccented Vietnamese variants.
const INJECTION_PATTERNS: { id: string; pattern: RegExp }[] = [
  {
    id: "ignore_prior",
    pattern:
      /\bignore\s+(?:all\s+|the\s+)?(?:prior|previous|above)\s+(?:instructions?|prompts?|messages?|rules?)\b/i,
  },
  {
    id: "system_prompt_reveal",
    pattern:
      /\b(?:reveal|show|tell|leak|expose|print|return|give)\b[^.\n]{0,40}\bprompt\b/i,
  },
  {
    id: "you_are_now",
    pattern:
      /\byou\s+are\s+(?:now|actually|really)\s+(?:a|an|the)\b/i,
  },
  {
    id: "jailbreak_keyword",
    pattern:
      /\b(?:jailbreak|sudo\s+mode|developer\s+mode|dan\s+mode|godmode)\b/i,
  },
  {
    id: "env_leak",
    pattern:
      /\b(?:print|show|reveal|leak|dump)\s+(?:env|environment|secrets?|api[\s_-]?keys?|tokens?)\b/i,
  },
  {
    id: "vn_bo_qua",
    pattern:
      /(?:bo qua|bỏ qua)\s+(?:moi|mọi|tat ca|tất cả|toan bo|toàn bộ)?\s*(?:chi dan|chỉ dẫn|huong dan|hướng dẫn|prompt|lenh|lệnh|cau lenh|câu lệnh)/i,
  },
  {
    id: "vn_he_thong",
    pattern:
      /(?:tiet lo|tiết lộ|lo ra|lộ ra|in ra|hien thi|hiển thị)\s+(?:system\s+)?(?:prompt|env|api|key|khoa he thong|khóa hệ thống|lenh he thong|lệnh hệ thống)/i,
  },
];

// Out-of-scope keyword catalog: services / topics we explicitly do NOT support.
// Normalized (NFD, lower-case) before comparison.
const OUT_OF_SCOPE_KEYWORDS: readonly string[] = [
  // Unsupported repair services
  "tu lanh",
  "may giat",
  "may say",
  "may rua bat",
  "may rua chen",
  "lo vi song",
  "bep ga",
  "bep tu",
  "binh nong lanh",
  "tv hong",
  "tivi hong",
  "ti vi hong",
  "tv khong len",
  "tivi khong len",
  "tv khong chay",
  "internet",
  "wifi",
  "sua khoa",
  "son nha",
  "son tuong",
  "may bom",
  // Off-topic: food / cooking / general chit-chat
  "cong thuc",
  "nau pho",
  "nau canh",
  "cach lam banh",
  "cong thuc nau",
  "thoi tiet",
  "ty gia",
  "ti gia",
  "viet bai",
  "viet code",
  "lam bai tap",
];

const IN_SCOPE_PLUMBING_PUMP_KEYWORDS: readonly string[] = [
  "may bom nuoc",
  "bom nuoc",
];

// Service-specific keyword catalogue. Used for mismatch heuristic.
const SERVICE_KEYWORDS: Record<ServiceType, readonly string[]> = {
  electrical: [
    "dien",
    "cau dao",
    "cong tac",
    "o cam",
    "o dien",
    "day dien",
    "den",
    "bong den",
    "atomat",
    "aptomat",
    "mat dien",
    "chap dien",
    "ro dien",
    "quat tran",
    "quat dien",
  ],
  plumbing: [
    "nuoc",
    "ong nuoc",
    "ong dan",
    "voi",
    "ro nuoc",
    "ro ri nuoc",
    "tac",
    "nghet",
    "bon cau",
    "bon rua",
    "lavabo",
    "voi sen",
    "duong ong",
    "may bom nuoc",
    "yeu ap",
    "toilet",
  ],
  cleaning: [
    "don dep",
    "ve sinh",
    "lau nha",
    "lau san",
    "bui",
    "moc",
    "vet ban",
    "rac",
    "tong ve sinh",
    "deep clean",
    "tay rua",
    "khu mui",
    "lau kinh",
    "vat tu don dep",
  ],
  hvac: [
    "dieu hoa",
    "may lanh",
    "khong mat",
    "lam lanh yeu",
    "chay nuoc",
    "keu bat thuong",
    "ma loi",
    "dan lanh",
    "dan nong",
    "ve sinh may lanh",
  ],
  upholstery: [
    "sofa",
    "nem",
    "rem",
    "tham",
    "vai boc",
    "vet ban",
    "mui hoi",
    "am moc",
    "giat sofa",
    "giat nem",
  ],
  handyman: [
    "khoan tuong",
    "lap ke",
    "lap thanh rem",
    "lap den",
    "thiet bi nho",
    "ban le",
    "tay nam",
    "lap thiet bi phong tam",
    "treo tv",
    "lap tv",
    "lap noi that",
    "sua vat",
  ],
};

const DECLINE_COPY: Record<"vi" | "en", Record<BoundaryReason, string>> = {
  vi: {
    prompt_injection:
      "Kael chỉ hỗ trợ sáu nhóm dịch vụ nhà ở đang mở trên NestScout. Bạn vui lòng mô tả công việc thực tế trong căn hộ để Kael tiếp tục xử lý.",
    out_of_scope:
      "Vấn đề bạn nêu nằm ngoài phạm vi sáu nhóm dịch vụ nhà ở Kael đang hỗ trợ tại TP.HCM.",
    service_mismatch:
      "Mô tả của bạn không khớp với dịch vụ đang chọn. Bạn quay lại chọn đúng một trong sáu dịch vụ phù hợp để Kael xử lý chính xác.",
  },
  en: {
    prompt_injection:
      "Kael only supports the six home-service categories currently available on NestScout. Describe the actual work needed in the apartment so Kael can continue.",
    out_of_scope:
      "This request is outside the six home-service categories Kael currently supports in Ho Chi Minh City.",
    service_mismatch:
      "Your description does not match the selected service. Go back and choose the matching service so Kael can handle it accurately.",
  },
};

const SERVICE_LABEL: Record<"vi" | "en", Record<ServiceType, string>> = {
  vi: {
    electrical: "sửa điện",
    plumbing: "sửa nước",
    cleaning: "vệ sinh nhà",
    hvac: "điều hòa và không khí",
    upholstery: "vệ sinh sofa, nệm, rèm hoặc thảm",
    handyman: "sửa vặt và lắp đặt nhỏ",
  },
  en: {
    electrical: "electrical repair",
    plumbing: "plumbing repair",
    cleaning: "home cleaning",
    hvac: "air conditioning",
    upholstery: "upholstery care",
    handyman: "minor handyman work",
  },
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsKeyword(normalized: string, keyword: string): boolean {
  const pattern = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(keyword)}(?:[^a-z0-9]|$)`,
  );
  return pattern.test(normalized);
}

function isSupportedWaterPumpMention(normalized: string): boolean {
  return IN_SCOPE_PLUMBING_PUMP_KEYWORDS.some((keyword) =>
    containsKeyword(normalized, keyword)
  );
}

export function detectPromptInjection(
  text: string,
): { detected: boolean; signals: string[] } {
  const signals: string[] = [];
  for (const { id, pattern } of INJECTION_PATTERNS) {
    if (pattern.test(text)) signals.push(id);
  }
  return { detected: signals.length > 0, signals };
}

export function detectOutOfScope(
  text: string,
): { detected: boolean; signals: string[] } {
  const normalized = normalize(text);
  const signals: string[] = [];
  for (const keyword of OUT_OF_SCOPE_KEYWORDS) {
    if (keyword === "may bom" && isSupportedWaterPumpMention(normalized)) {
      continue;
    }
    if (containsKeyword(normalized, keyword)) {
      signals.push(`oos:${keyword}`);
      if (signals.length >= 3) break;
    }
  }
  return { detected: signals.length > 0, signals };
}

export function detectServiceMismatch(
  text: string,
  selectedService: ServiceType,
): {
  detected: boolean;
  signals: string[];
  suggestedService: ServiceType | null;
  hits: Record<ServiceType, number>;
} {
  const normalized = normalize(text);
  const hits: Record<ServiceType, number> = {
    electrical: 0,
    plumbing: 0,
    cleaning: 0,
    hvac: 0,
    upholstery: 0,
    handyman: 0,
  };
  const signals: string[] = [];
  for (const service of SUPPORTED_SERVICES) {
    for (const keyword of SERVICE_KEYWORDS[service]) {
      if (containsKeyword(normalized, keyword)) {
        hits[service]++;
        if (hits[service] <= 2) signals.push(`match:${service}:${keyword}`);
      }
    }
  }
  const selectedHits = hits[selectedService];
  let suggestedService: ServiceType | null = null;
  let otherTop = 0;
  for (const service of SUPPORTED_SERVICES) {
    if (service === selectedService) continue;
    if (hits[service] > otherTop) {
      otherTop = hits[service];
      suggestedService = service;
    }
  }
  // Mismatch when the other service shows >=2 distinct keyword hits
  // AND the selected service shows zero hits.
  const detected = otherTop >= 2 && selectedHits === 0;
  return {
    detected,
    signals,
    suggestedService: detected ? suggestedService : null,
    hits,
  };
}

export function evaluateMessageBoundary(
  text: string,
  selectedService: ServiceType,
  options: BoundaryGuardOptions = {},
): BoundaryDecision {
  const trimmed = text.trim();
  const language = options.language ?? "vi";
  const declineCopy = DECLINE_COPY[language];
  if (trimmed.length === 0) return { ok: true };

  const injection = detectPromptInjection(trimmed);
  if (injection.detected) {
    return {
      ok: false,
      reason: "prompt_injection",
      declineText: declineCopy.prompt_injection,
      detectedSignals: injection.signals,
    };
  }

  if (options.semanticInjectionClassifierEnabled) {
    const normalizedText = normalize(trimmed);
    const semanticInjection = options.injectionClassifier
      ? options.injectionClassifier({ text: trimmed, normalizedText, selectedService })
      : classifySemanticPromptInjection(normalizedText);
    if (semanticInjection.detected) {
      return {
        ok: false,
        reason: "prompt_injection",
        declineText: declineCopy.prompt_injection,
        detectedSignals: [
          "semantic_injection_classifier",
          ...semanticInjection.signals,
        ],
      };
    }
  }

  const outOfScope = detectOutOfScope(trimmed);
  if (outOfScope.detected) {
    return {
      ok: false,
      reason: "out_of_scope",
      declineText: declineCopy.out_of_scope,
      detectedSignals: outOfScope.signals,
    };
  }

  const mismatch = detectServiceMismatch(trimmed, selectedService);
  if (mismatch.detected) {
    const suggestion = mismatch.suggestedService;
    const declineText = suggestion
      ? language === "en"
        ? `${declineCopy.service_mismatch} Kael identified ${SERVICE_LABEL.en[suggestion]} as the closer match.`
        : `${declineCopy.service_mismatch} Kael nghĩ vấn đề thuộc dịch vụ ${SERVICE_LABEL.vi[suggestion]}.`
      : declineCopy.service_mismatch;
    return {
      ok: false,
      reason: "service_mismatch",
      declineText,
      detectedSignals: mismatch.signals,
      suggestedService: suggestion ?? undefined,
    };
  }

  return { ok: true };
}

function classifySemanticPromptInjection(
  normalizedText: string,
): { detected: boolean; signals: string[] } {
  const signals: string[] = [];
  if (/\bnhap vai\b.*\b(?:quan tri vien|admin|nguoi kiem duyet)\b/.test(normalizedText)) {
    signals.push("roleplay_admin");
  }
  if (/\b(?:huong dan|chi dan|lenh|quy tac)\s+an\b/.test(normalizedText)) {
    signals.push("hidden_instruction_request");
  }
  if (/\b(?:xuat|in|doc|tra ve)\b.*\b(?:toan bo|day du)\b.*\b(?:system|prompt|quy tac)\b/.test(normalizedText)) {
    signals.push("system_prompt_exfiltration");
  }
  if (/\btra loi nhu\b.*\b(?:khong co gioi han|khong bi rang buoc)\b/.test(normalizedText)) {
    signals.push("constraint_bypass");
  }
  if (/\b(?:cap quyen|quyen)\s+(?:admin|quan tri)\b/.test(normalizedText)) {
    signals.push("privilege_escalation_prompt");
  }
  return { detected: signals.length > 0, signals };
}
