import type { fetchBaselineCandidates } from "../tools/synthesis.ts";
import type { analyzeDescription } from "../tools/vision.ts";
import type { searchMarketPrice } from "../tools/market.ts";
import type { PriceKnowledgeState } from "../evidence/live-price-knowledge.ts";

export type EstimateParallelValue =
  | { kind: "vision"; result: Awaited<ReturnType<typeof analyzeDescription>> }
  | { kind: "market"; result: Awaited<ReturnType<typeof searchMarketPrice>> }
  | { kind: "price_knowledge"; result: PriceKnowledgeState }
  | {
    kind: "baseline";
    result: Awaited<ReturnType<typeof fetchBaselineCandidates>>;
  };
