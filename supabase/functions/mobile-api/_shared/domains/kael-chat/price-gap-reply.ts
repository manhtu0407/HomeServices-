import type { PipelineStageLog } from "../../kael/contracts/types.ts";

type GapReason =
  | "no_published_price"
  | "too_few_trusted_sources"
  | "mixed_units"
  | "stale_sources"
  | "sources_disagree"
  | "lookup_unavailable";

export type PriceGapReply = {
  text: string;
  metadata: Record<string, unknown>;
};

// Built only from what the market stage actually recorded, so the customer hears why this
// case has no grounded price and what would let Kael search again, never a guessed price.
export function priceEvidenceGapReply(input: {
  stageLogs: readonly PipelineStageLog[];
  language: "vi" | "en";
}): PriceGapReply {
  const metadata = input.stageLogs.find((stage) => stage.stage === "market")?.safeMetadata ?? {};
  const cachedGap = metadata.kael_price_knowledge_result === "recent_gap";
  const highTrust = nonNegativeInteger(metadata.source_trust_tier_1_2_count);
  const reason = gapReason(metadata);
  const language = input.language;
  const opening = cachedGap
    ? reason === "lookup_unavailable"
      ? (language === "en"
        ? "Kael's last price search did not finish, and there is no new result yet."
        : "Lần tìm giá trước của Kael chưa hoàn tất và hiện chưa có kết quả mới.")
      : (language === "en"
      ? "Kael already searched this problem a short while ago and the result has not changed."
      : "Kael đã tìm giá cho vấn đề này cách đây không lâu và kết quả chưa thay đổi.")
    : reason === "lookup_unavailable"
    ? (language === "en"
      ? "Kael could not complete the price search for this problem."
      : "Kael chưa hoàn tất việc tìm giá cho vấn đề này.")
    : (language === "en"
      ? "Kael searched verified Ho Chi Minh City price tables for this problem."
      : "Kael đã tìm trong các bảng giá đã kiểm chứng tại TP.HCM cho vấn đề này.");
  const outcome = language === "en"
    ? "Kael cannot give a grounded price from this result."
    : "Kael chưa thể đưa ra giá có căn cứ từ kết quả này.";
  const next = language === "en"
    ? "You can add a clear photo of the area and describe the number of items or the scope of work; Kael will search again with that information. Kael does not guess a price without sources."
    : "Bạn có thể gửi thêm ảnh rõ khu vực cần xử lý, cho biết số lượng vật dụng hoặc phạm vi công việc; Kael sẽ tìm lại với thông tin đó. Kael không đoán giá khi chưa có nguồn.";
  return {
    text: [
      opening,
      outcome,
      ...(reason === "lookup_unavailable" ? [] : [reasonSentence(reason, highTrust, language)]),
      next,
    ].join(" "),
    metadata: {
      price_gap_reason: reason,
      price_gap_cached: cachedGap,
      ...(highTrust === null ? {} : { price_gap_high_trust_source_count: highTrust }),
    },
  };
}

function gapReason(metadata: Record<string, unknown>): GapReason {
  const rejections = new Set<string>([
    ...stringList(metadata.kael_price_knowledge_rejection_reasons),
    ...rejectionReasons(metadata.source_trust_source_rejections),
  ]);
  const gapReasonText = typeof metadata.kael_price_knowledge_gap_reason === "string"
    ? metadata.kael_price_knowledge_gap_reason
    : "";
  if (rejections.has("mixed_unit") || rejections.has("unsupported_unit")) return "mixed_units";
  if (rejections.has("stale_price_evidence")) return "stale_sources";
  if (rejections.has("outlier_over_40_percent")) return "sources_disagree";
  if (
    metadata.source_trust_aggregation_result === "weak_quorum" ||
    metadata.source_trust_aggregation_result === "insufficient_tier_1_2_quorum" ||
    gapReasonText.includes("quorum")
  ) {
    return "too_few_trusted_sources";
  }
  if (gapReasonText.includes("TIMEOUT") || gapReasonText.includes("AI call failed")) {
    return "lookup_unavailable";
  }
  return "no_published_price";
}

function reasonSentence(
  reason: GapReason,
  highTrust: number | null,
  language: "vi" | "en",
): string {
  switch (reason) {
    case "mixed_units":
      return language === "en"
        ? "The sources found price this work in different units (per visit, per repair point), so they cannot be combined."
        : "Các nguồn tìm được tính giá theo đơn vị khác nhau (theo lượt, theo điểm sửa), nên không gộp được.";
    case "stale_sources":
      return language === "en"
        ? "Some of the price tables found are older than 12 months."
        : "Một số bảng giá tìm được đã cũ hơn 12 tháng.";
    case "sources_disagree":
      return language === "en"
        ? "The prices found differ too much from each other to form a reliable range."
        : "Các mức giá tìm được chênh nhau quá nhiều để tạo khoảng giá đáng tin.";
    case "too_few_trusted_sources":
      return language === "en"
        ? `Only ${highTrust ?? 0} trusted source matched; at least 2 are required.`
        : `Mới có ${highTrust ?? 0} nguồn tin cậy phù hợp, cần ít nhất 2 nguồn.`;
    case "lookup_unavailable":
      return language === "en"
        ? "The price search did not complete this time."
        : "Lần tìm giá này chưa hoàn tất.";
    case "no_published_price":
      return language === "en"
        ? "The verified price tables do not yet publish a price for this exact work."
        : "Các bảng giá đã kiểm chứng chưa công bố giá cho đúng loại việc này.";
  }
}

function rejectionReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const reason = typeof item === "object" && item !== null
      ? (item as Record<string, unknown>).reason
      : null;
    return typeof reason === "string" ? [reason] : [];
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
