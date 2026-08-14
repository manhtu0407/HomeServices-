export type DemandingCustomerLegitimateConcern =
  | "qa_loop_above_3"
  | "request_credentials"
  | "request_breakdown"
  | "request_alternatives"
  | "wait_time_concern"
  | "service_quality_concern";

export type DemandingCustomerPressureSignal =
  | "demand_discount"
  | "threat_complaint"
  | "demand_refund_no_reason"
  | "aggressive_language"
  | "multiple_cancel_pattern";

export type DemandingCustomerExpectedNuance =
  | "detail_oriented"
  | "pressure"
  | "none";

export type DemandingCustomerNuance =
  | DemandingCustomerExpectedNuance
  | "mixed";

export type DemandingCustomerEscalationLevel = "none" | "soft" | "hard";

export type DemandingCustomerDetectionInput = {
  readonly message: string;
  readonly qaCount: number;
  readonly cancelCount?: number;
  // Prior-turn sentiment only fills a keyword gap;
  // only to fill a keyword gap (soft); keyword detection stays the primary path.
  readonly llmSentiment?: "neutral" | "detail_oriented" | "pressure";
};

export type DemandingCustomerDetection = {
  readonly nuance: DemandingCustomerNuance;
  readonly expectedNuance: DemandingCustomerExpectedNuance;
  readonly legitimateConcernSignals: readonly DemandingCustomerLegitimateConcern[];
  readonly pressureSignals: readonly DemandingCustomerPressureSignal[];
  readonly pressureScore: number;
  readonly escalationLevel: DemandingCustomerEscalationLevel;
  readonly llmAssisted: boolean;
};

const LEGITIMATE_PATTERNS: ReadonlyArray<{
  signal: DemandingCustomerLegitimateConcern;
  patterns: readonly string[];
}> = [
  {
    signal: "request_breakdown",
    patterns: ["bang gia", "bảng giá", "ly do", "lý do", "chi tiet", "chi tiết", "co so", "cơ sở", "nguon", "nguồn"],
  },
  {
    signal: "request_credentials",
    patterns: ["chung chi", "chứng chỉ", "giay to", "giấy tờ", "kinh nghiem", "kinh nghiệm", "tho nay", "thợ này"],
  },
  {
    signal: "request_alternatives",
    patterns: ["phuong an", "phương án", "cach khac", "cách khác", "lua chon", "lựa chọn"],
  },
  {
    signal: "wait_time_concern",
    patterns: ["dung gio", "tre", "cho lau", "phai cho", "dang cho", "doi bao lau", "khi nao"],
  },
  {
    signal: "service_quality_concern",
    patterns: [
      "chat luong",
      "chất lượng",
      "toi lo",
      "tôi lo",
      "lo lang",
      "lo lắng",
      "lo rang",
      "lo rằng",
      "yen tam",
      "yên tâm",
      "moi lo",
      "mối lo",
    ],
  },
];

const PRESSURE_PATTERNS: ReadonlyArray<{
  signal: DemandingCustomerPressureSignal;
  patterns: readonly string[];
}> = [
  {
    signal: "demand_discount",
    patterns: [
      "giam gia",
      "giảm giá",
      "re hon",
      "rẻ hơn",
      "bot tien",
      "bớt tiền",
      "gia thap nhat",
      "giá thấp nhất",
      "muc gia thap nhat",
      "mức giá thấp nhất",
      "chot gia thap nhat",
      "chốt giá thấp nhất",
    ],
  },
  {
    signal: "threat_complaint",
    patterns: ["khieu nai", "khiếu nại", "dang bai", "đăng bài", "to kael", "tố kael", "boc phot", "bóc phốt"],
  },
  {
    signal: "demand_refund_no_reason",
    patterns: ["hoan tien ngay", "hoan tien cho toi", "tra lai tien", "tra tien lai"],
  },
  {
    signal: "aggressive_language",
    patterns: ["lay tien a", "lua dao", "dinh lua", "lua toi", "vo van", "te qua"],
  },
  {
    signal: "multiple_cancel_pattern",
    patterns: ["huy di", "hủy đi", "huy het", "hủy hết"],
  },
];

export function detectDemandingCustomerPatterns(
  input: DemandingCustomerDetectionInput,
): DemandingCustomerDetection {
  const normalized = normalize(input.message);
  const legitimateConcernSignals = unique([
    ...matchSignals(normalized, LEGITIMATE_PATTERNS),
    ...(input.qaCount > 3 ? ["qa_loop_above_3" as const] : []),
  ]);
  const pressureSignals = unique([
    ...matchSignals(normalized, PRESSURE_PATTERNS),
    ...((input.cancelCount ?? 0) >= 2 ? ["multiple_cancel_pattern" as const] : []),
  ]);
  const pressureScore = scorePressure(pressureSignals, input);
  const escalationLevel = resolveEscalation(pressureSignals, pressureScore, input.qaCount);
  const keywordNuance: DemandingCustomerExpectedNuance = pressureSignals.length > 0 ||
      pressureScore >= 0.5
    ? "pressure"
    : legitimateConcernSignals.length > 0
    ? "detail_oriented"
    : "none";
  // In an established conversation, let the
  // intake-diagnosis sentiment fill a keyword gap. Soft only — hard escalation still
  // depends on deterministic keyword signals via escalationLevel above, so the LLM
  // can make Kael more attentive but never trigger a hard stop on its own.
  const llmAssisted = keywordNuance === "none" &&
    input.qaCount >= 2 &&
    input.llmSentiment !== undefined &&
    input.llmSentiment !== "neutral";
  const expectedNuance: DemandingCustomerExpectedNuance = llmAssisted
    ? (input.llmSentiment as DemandingCustomerExpectedNuance)
    : keywordNuance;
  const nuance: DemandingCustomerNuance =
    expectedNuance === "pressure" && legitimateConcernSignals.length > 0
      ? "mixed"
      : expectedNuance;

  return {
    nuance,
    expectedNuance,
    legitimateConcernSignals,
    pressureSignals,
    pressureScore,
    escalationLevel,
    llmAssisted,
  };
}

function matchSignals<T extends string>(
  normalized: string,
  configs: ReadonlyArray<{ signal: T; patterns: readonly string[] }>,
): T[] {
  return configs.flatMap((config) =>
    config.patterns.some((pattern) => matchesNormalizedPhrase(normalized, pattern))
      ? [config.signal]
      : []
  );
}

function matchesNormalizedPhrase(input: string, phrase: string): boolean {
  const words = normalize(phrase)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length === 0) return false;
  return new RegExp(`(^|[^a-z0-9])${words.join("\\s+")}([^a-z0-9]|$)`).test(input);
}

function scorePressure(
  signals: readonly DemandingCustomerPressureSignal[],
  input: DemandingCustomerDetectionInput,
): number {
  if (signals.length === 0) return 0;
  const base = Math.min(1, signals.length * 0.5);
  const qaBoost = input.qaCount >= 5 ? 0.15 : 0;
  const cancelBoost = (input.cancelCount ?? 0) > 0 ? 0.15 : 0;
  return Math.min(1, Number((base + qaBoost + cancelBoost).toFixed(2)));
}

function resolveEscalation(
  signals: readonly DemandingCustomerPressureSignal[],
  pressureScore: number,
  qaCount: number,
): DemandingCustomerEscalationLevel {
  if (
    signals.includes("threat_complaint") ||
    signals.includes("demand_refund_no_reason") ||
    signals.includes("aggressive_language")
  ) {
    return "hard";
  }
  if (signals.length > 0 && qaCount >= 5) return "hard";
  if (pressureScore >= 0.5) return "soft";
  return "none";
}

function unique<T extends string>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}
