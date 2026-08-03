import type { ComplexityLevel } from "../../../../_shared/domain.ts";
import { customerVisibleKaelProblemSummary } from "../../kael/language/user-facing-copy.ts";

export function formatKaelEstimateText(estimate: {
  problem_summary: string;
  complexity: ComplexityLevel;
  price_min: number;
  price_max: number;
  advisory: string | null;
  disclaimer: string;
}, language: "vi" | "en" = "vi") {
  const problemSummary = customerVisibleKaelProblemSummary(
    estimate.problem_summary,
    language,
  );
  if (language === "en") {
    const complexity = estimate.complexity === "small"
      ? "Small"
      : estimate.complexity === "medium"
      ? "Medium"
      : "Large";
    const advisory = estimate.advisory ? `\nNote: ${estimate.advisory}` : "";
    return `Kael has prepared an estimate after completing the checks.\nIssue: ${problemSummary}.\nComplexity: ${complexity}.\nEstimated range: ${
      estimate.price_min.toLocaleString("en-US")
    }-${
      estimate.price_max.toLocaleString("en-US")
    } VND.\n${estimate.disclaimer}${advisory}`;
  }
  const complexity = estimate.complexity === "small"
    ? "Nhỏ"
    : estimate.complexity === "medium"
    ? "Vừa"
    : "Lớn";
  const advisory = estimate.advisory ? `\nLưu ý: ${estimate.advisory}` : "";
  return `Kael đã hoàn tất đối chiếu.\nHiện trạng: ${problemSummary}.\nMức độ: ${complexity}.\nKhoảng ước tính: ${
    estimate.price_min.toLocaleString("vi-VN")
  }-${
    estimate.price_max.toLocaleString("vi-VN")
  } đ.\n${estimate.disclaimer}${advisory}`;
}
