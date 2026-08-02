import type { fetchBaselineCandidates } from "./synthesis.ts";
import type { analyzeDescription } from "./vision.ts";
import type { searchMarketPrice } from "./market.ts";

export type EstimateParallelValue =
  | { kind: "vision"; result: Awaited<ReturnType<typeof analyzeDescription>> }
  | { kind: "market"; result: Awaited<ReturnType<typeof searchMarketPrice>> }
  | {
    kind: "baseline";
    result: Awaited<ReturnType<typeof fetchBaselineCandidates>>;
  };
