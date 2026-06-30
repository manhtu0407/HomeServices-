import type { EdgeAiSecrets } from "./kael/index.ts";

export type EdgeEnv = EdgeAiSecrets & {
  supabaseUrl: string;
  supabaseSecretKey: string;
  sepayWebhookApiKey?: string;
  sepayQrBaseUrl?: string;
};

export function readEdgeEnv(
  getEnv: (name: string) => string | undefined,
): EdgeEnv {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const sourceTrustFlag = getEnv("KAEL_TRUST_PERPLEXITY_FILTER_ENABLED") ??
    getEnv("KAEL_OPT_SOURCE_TRUST_ENABLED");
  const sourceTrustExplicit = sourceTrustFlag !== undefined;
  const supabaseSecretKey = readSupabaseSecretKey(getEnv);
  if (!supabaseUrl) throw new Error("SUPABASE_URL is required");
  if (!supabaseSecretKey) throw new Error("SUPABASE secret key is required");

  return {
    supabaseUrl,
    supabaseSecretKey,
    anthropicApiKey: getEnv("ANTHROPIC_API_KEY"),
    perplexityApiKey: getEnv("PERPLEXITY_API_KEY"),
    deepseekApiKey: getEnv("DEEPSEEK_API_KEY"),
    vietmapApiKey: getEnv("VIETMAP_API_KEY") ?? getEnv("VIETMAP_MAPS_API_KEY"),
    googleMapsApiKey: getEnv("GOOGLE_MAPS_API_KEY") ?? getEnv("GOOGLE_MAP_KEY"),
    sepayWebhookApiKey: getEnv("SEPAY_WEBHOOK_API_KEY"),
    sepayQrBaseUrl: getEnv("SEPAY_QR_BASE_URL"),
    learningEnabled:
      readBooleanFlag(getEnv("LEARNING_ENABLED")) ||
      readBooleanFlag(getEnv("KAEL_OPT_BATCH_LEARNING_ENABLED")),
    knowledgeRetrievalEnabled: readBooleanFlag(
      getEnv("KAEL_OPT_KNOWLEDGE_RETRIEVAL_ENABLED"),
    ),
    sourceTrustPerplexityFilterEnabled: !sourceTrustExplicit
      ? isStagingProjectUrl(supabaseUrl)
      : envFlag(sourceTrustFlag),
    sourceTrustPerplexityFilterExplicit: sourceTrustExplicit,
  };
}

function readSupabaseSecretKey(
  getEnv: (name: string) => string | undefined,
): string | undefined {
  const current = getEnv("SUPABASE_SECRET_KEYS");
  if (current) {
    try {
      const parsed = JSON.parse(current) as Record<string, string>;
      if (parsed.default) return parsed.default;
      const first = Object.values(parsed)[0];
      if (first) return first;
    } catch {
      throw new Error("SUPABASE_SECRET_KEYS must be valid JSON");
    }
  }
  return getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? getEnv("SUPABASE_SECRET_KEY") ??
    getEnv("APP_SECRET_KEY");
}

function readBooleanFlag(value: string | undefined): boolean {
  return typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const envFlag = readBooleanFlag;

function isStagingProjectUrl(value: string): boolean {
  return value.includes("xyylanuyflrjzbjzhqfl");
}
