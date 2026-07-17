import { scrubSensitiveForLLM } from "./_runtime/utils.ts";

export function buildAdvisory(
  indicators: string[],
  knowledgeSafetyGuidance: readonly string[] = [],
  language: "vi" | "en" = "vi",
): string | null {
  const joined = indicators.join(" ").toLowerCase();
  if (!joined) return null;
  if (/(cháy|khét|burn|smell|rò điện|giật|ngập|vỡ|tràn|nóng)/i.test(joined)) {
    if (language === "en") {
      return "If there is a burning smell, electrical leakage, overflowing water, or another hazard, switch off the relevant supply and wait for an on-site inspection.";
    }
    const runtimeGuidance = knowledgeSafetyGuidance
      .map(cleanKnowledgeAdvisory)
      .find((line) => line.length > 0);
    if (runtimeGuidance) return runtimeGuidance;
    return "Nếu có mùi khét, rò điện, nước tràn hoặc dấu hiệu nguy hiểm, hãy ngắt nguồn/khóa nước và chờ thợ kiểm tra trực tiếp.";
  }
  return null;
}

function cleanKnowledgeAdvisory(value: string): string {
  return scrubSensitiveForLLM(value)
    .replace(/^Safety\s+(?:urgent|warning|advisory):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}
