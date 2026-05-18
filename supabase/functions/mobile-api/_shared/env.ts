import type { EdgeAiSecrets } from "./kael.ts";

export type EdgeEnv = EdgeAiSecrets & {
  supabaseUrl: string;
  supabaseSecretKey: string;
};

export function readEdgeEnv(
  getEnv: (name: string) => string | undefined,
): EdgeEnv {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseSecretKey = readSupabaseSecretKey(getEnv);
  if (!supabaseUrl) throw new Error("SUPABASE_URL is required");
  if (!supabaseSecretKey) throw new Error("SUPABASE secret key is required");

  return {
    supabaseUrl,
    supabaseSecretKey,
    anthropicApiKey: getEnv("ANTHROPIC_API_KEY"),
    perplexityApiKey: getEnv("PERPLEXITY_API_KEY"),
    deepseekApiKey: getEnv("DEEPSEEK_API_KEY"),
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
