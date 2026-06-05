import { scrubSensitiveForLLM } from "./utils.ts";

export function buildAdvisory(
  indicators: string[],
  knowledgeSafetyGuidance: readonly string[] = [],
): string | null {
  const joined = indicators.join(" ").toLowerCase();
  if (!joined) return null;
  if (/(chÃ¡y|khÃ©t|burn|smell|rÃ² Ä‘iá»‡n|giáº­t|ngáº­p|vá»¡|trÃ n|nÃ³ng)/i.test(joined)) {
    const runtimeGuidance = knowledgeSafetyGuidance
      .map(cleanKnowledgeAdvisory)
      .find((line) => line.length > 0);
    if (runtimeGuidance) return runtimeGuidance;
    return "Náº¿u cÃ³ mÃ¹i khÃ©t, rÃ² Ä‘iá»‡n, nÆ°á»›c trÃ n hoáº·c dáº¥u hiá»‡u nguy hiá»ƒm, hÃ£y ngáº¯t nguá»“n/khÃ³a nÆ°á»›c vÃ  chá» thá»£ kiá»ƒm tra trá»±c tiáº¿p.";
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
