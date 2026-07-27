import type { EdgeAiSecrets } from "./kael/index.ts";

export type SePayVietQrConfig = {
  enabled: boolean;
  bankCode?: string;
  accountNumber?: string;
  accountHolder?: string;
  webhookSecret?: string;
};

export type EdgeEnv = EdgeAiSecrets & {
  supabaseUrl: string;
  supabaseSecretKey: string;
  sepayVietQr: SePayVietQrConfig;
  // S4/F1 (§38): global hard-stop for customer-facing AI during an incident.
  // Default false. Enforced at the callAI chokepoint (kael/spend-gate.ts).
  aiKillSwitch: boolean;
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
    durableGuardsEnabled: readBooleanFlag(
      getEnv("KAEL_DURABLE_GUARDS_ENABLED"),
    ),
    stagingPaymentRailEnabled:
      isStagingProjectUrl(supabaseUrl) &&
      readBooleanFlag(getEnv("NESTSCOUT_STAGING_PAYMENT_RAIL_ENABLED")),
    sepayVietQr: readSePayVietQrConfig(getEnv, supabaseUrl),
    aiKillSwitch: readBooleanFlag(getEnv("KAEL_AI_KILL_SWITCH")),
  };
}

function readSePayVietQrConfig(
  getEnv: (name: string) => string | undefined,
  supabaseUrl: string,
): SePayVietQrConfig {
  const bankCode = readVietQrBankCode(getEnv("SEPAY_VIETQR_BANK_CODE"));
  const accountNumber = readVietQrAccountNumber(
    getEnv("SEPAY_VIETQR_ACCOUNT_NUMBER"),
  );
  const accountHolder = readBoundedText(
    getEnv("SEPAY_VIETQR_ACCOUNT_HOLDER"),
    120,
  );
  const webhookSecret = readBoundedText(getEnv("SEPAY_WEBHOOK_SECRET"), 256);
  const enabled = !isStagingProjectUrl(supabaseUrl) &&
    readBooleanFlag(getEnv("NESTSCOUT_SEPAY_VIETQR_ENABLED")) &&
    Boolean(bankCode && accountNumber && accountHolder && webhookSecret);

  return {
    enabled,
    ...(bankCode ? { bankCode } : {}),
    ...(accountNumber ? { accountNumber } : {}),
    ...(accountHolder ? { accountHolder } : {}),
    ...(webhookSecret ? { webhookSecret } : {}),
  };
}

function readVietQrBankCode(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z0-9]{2,32}$/.test(normalized)
    ? normalized
    : undefined;
}

function readVietQrAccountNumber(
  value: string | undefined,
): string | undefined {
  const normalized = value?.replace(/\s+/g, "").trim();
  return normalized && /^[A-Za-z0-9]{1,19}$/.test(normalized)
    ? normalized
    : undefined;
}

function readBoundedText(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function readSupabaseSecretKey(
  getEnv: (name: string) => string | undefined,
): string | undefined {
  const current = getEnv("SUPABASE_SECRET_KEYS");
  if (current) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(current);
    } catch {
      throw new Error("SUPABASE_SECRET_KEYS must be valid JSON");
    }
    if (!isNonEmptyStringRecord(parsed)) {
      throw new Error(
        "SUPABASE_SECRET_KEYS must be a JSON object of non-empty strings",
      );
    }
    if (parsed.default) return parsed.default;
    return Object.values(parsed)[0];
  }
  return getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? getEnv("SUPABASE_SECRET_KEY") ??
    getEnv("APP_SECRET_KEY");
}

function isNonEmptyStringRecord(
  value: unknown,
): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([, item]) =>
    typeof item === "string" && item.trim().length > 0
  );
}

function readBooleanFlag(value: string | undefined): boolean {
  return typeof value === "string" &&
    ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const envFlag = readBooleanFlag;

function isStagingProjectUrl(value: string): boolean {
  return value.includes("xyylanuyflrjzbjzhqfl");
}
