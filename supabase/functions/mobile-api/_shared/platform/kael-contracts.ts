import { z } from "zod";
import { SERVICE_TYPES } from "../../../_shared/service-taxonomy.ts";

export type AIProvider = "anthropic" | "perplexity" | "deepseek";

export const priceSynthesisAbCaseSchema = z.object({
  case_key: z.string().min(4).max(160),
  service_type: z.enum(SERVICE_TYPES),
  problem_slug: z.string().min(1).max(100),
  district_code: z.string().min(1).max(80),
  complexity: z.enum(["small", "medium", "large"]),
  baseline_min: z.number().int().positive(),
  baseline_max: z.number().int().positive(),
  market_range_min: z.number().int().positive(),
  market_range_max: z.number().int().positive(),
  market_confidence: z.number().min(0).max(1),
  actual_final_price: z.number().int().positive().optional(),
}).refine((data) => data.baseline_max >= data.baseline_min, {
  path: ["baseline_max"],
  message: "baseline_max must be >= baseline_min",
}).refine((data) => data.market_range_max >= data.market_range_min, {
  path: ["market_range_max"],
  message: "market_range_max must be >= market_range_min",
});

export type PriceSynthesisAbCaseInput = z.infer<
  typeof priceSynthesisAbCaseSchema
>;

export type PriceSynthesisAbProviderEvaluation = {
  provider: AIProvider;
  model: string;
  schema_valid: boolean;
  price_min: number | null;
  price_max: number | null;
  confidence: number | null;
  failure_reason: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
};

export type PriceSynthesisAbEvaluation = {
  case_key: string;
  purpose: "price_synthesis";
  perplexity: PriceSynthesisAbProviderEvaluation;
  anthropic: PriceSynthesisAbProviderEvaluation;
  fallback_used: boolean;
};

export type KaelPublicCharterResponse = {
  readonly charter_version: string;
  readonly identity_summary: string;
  readonly locked_files: readonly string[];
  readonly tunable_files: readonly string[];
  readonly forbidden_categories: readonly string[];
  readonly mission_values: readonly string[];
};

export const KAEL_PERFORMANCE_PROFILE_IDS = [
  "electric_diagnose",
  "water_diagnose",
  "clean_scope",
  "air_scope",
  "fabric_scope",
  "task_scope",
] as const;

export type KaelPerformanceProfileId = (typeof KAEL_PERFORMANCE_PROFILE_IDS)[number];
