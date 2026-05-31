// X1 (Plan.md §27.4 — 2026-05-29): pre-pipeline boundary guard for Kael chat.
// Rejects out-of-scope topics, prompt-injection attempts, and messages that
// contradict the customer-selected service_type BEFORE any provider call,
// so cost stays at 0 for declined turns and Kael never returns an estimate
// for content violating RULES.md #6 (service scope) or #8 (no fake/off-topic
// estimates).
//
// Deterministic, server-side, dependency-free. An AI-driven off-topic
// classifier may be layered on top in a later phase; the deterministic gate
// alone covers F-18..F-21 from the 2026-05-28 production audit.

import type { ServiceType } from "../../../_shared/domain.ts";

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

const SUPPORTED_SERVICES: readonly ServiceType[] = [
  "electrical",
  "plumbing",
  "cleaning",
] as const;

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
  "dieu hoa",
  "may lanh",
  "tu lanh",
  "may giat",
  "may say",
  "may rua bat",
  "may rua chen",
  "lo vi song",
  "bep ga",
  "bep tu",
  "binh nong lanh",
  "tivi",
  "ti vi",
  "ti-vi",
  "tv hong",
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
};

const DECLINE_COPY: Record<BoundaryReason, string> = {
  prompt_injection:
    "Kael chỉ hỗ trợ sửa điện, sửa nước và vệ sinh nhà. Bạn vui lòng mô tả vấn đề thực tế trong căn hộ để Kael giúp ước tính.",
  out_of_scope:
    "Hiện Kael chỉ hỗ trợ sửa điện, sửa nước và vệ sinh nhà trong khu vực TP.HCM. Vấn đề bạn nêu nằm ngoài phạm vi hiện tại. Khi Kael mở rộng dịch vụ sẽ thông báo bạn sau.",
  service_mismatch:
    "Mô tả của bạn không khớp với dịch vụ đang chọn. Bạn quay lại chọn đúng dịch vụ (sửa điện, sửa nước hoặc vệ sinh) phù hợp với vấn đề để Kael ước tính chính xác.",
};

const SERVICE_LABEL_VI: Record<ServiceType, string> = {
  electrical: "sửa điện",
  plumbing: "sửa nước",
  cleaning: "vệ sinh nhà",
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
): BoundaryDecision {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: true };

  const injection = detectPromptInjection(trimmed);
  if (injection.detected) {
    return {
      ok: false,
      reason: "prompt_injection",
      declineText: DECLINE_COPY.prompt_injection,
      detectedSignals: injection.signals,
    };
  }

  const outOfScope = detectOutOfScope(trimmed);
  if (outOfScope.detected) {
    return {
      ok: false,
      reason: "out_of_scope",
      declineText: DECLINE_COPY.out_of_scope,
      detectedSignals: outOfScope.signals,
    };
  }

  const mismatch = detectServiceMismatch(trimmed, selectedService);
  if (mismatch.detected) {
    const suggestion = mismatch.suggestedService;
    const declineText = suggestion
      ? `${DECLINE_COPY.service_mismatch} Kael nghĩ vấn đề thuộc dịch vụ ${
        SERVICE_LABEL_VI[suggestion]
      }.`
      : DECLINE_COPY.service_mismatch;
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
