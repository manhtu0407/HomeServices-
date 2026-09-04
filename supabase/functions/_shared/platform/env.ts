import type { EdgeAiSecrets } from "../../mobile-api/_shared/kael/index.ts";
import {
  resolveHarnessEnvironment,
  type HarnessEnvironmentDescriptor,
} from "../harness/environment.ts";
import {
  readHarnessRuntimeRelease,
  type HarnessRuntimeRelease,
} from "../harness/release.ts";

export type SePayVietQrConfig = {
  enabled: boolean;
  bankCode?: string;
  accountNumber?: string;
  accountHolder?: string;
  webhookSecret?: string;
};

export type PlatformManualBankConfig = {
  enabled: boolean;
  bankCode?: string;
  accountNumber?: string;
  accountHolder?: string;
};

export type MobileClientPlatformCompatibility = {
  applicationId: string;
  minimumBuildNumber: number | null;
  easBuildId: string | null;
  runtimeVersion: string | null;
};

export type MobileClientCompatibility = {
  contractEpoch: number;
  releaseId: string;
  gitSha: string;
  ios: MobileClientPlatformCompatibility;
  android: MobileClientPlatformCompatibility;
};

export type EdgeEnv = EdgeAiSecrets & {
  supabaseUrl: string;
  supabaseSecretKey: string;
  supabasePublicKey?: string;
  harnessEnvironment: HarnessEnvironmentDescriptor;
  harnessRelease: HarnessRuntimeRelease;
  releaseId: string;
  minimumClientBuildNumber: number | null;
  clientCompatibility: MobileClientCompatibility;
  manualBank: PlatformManualBankConfig;
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
  const supabasePublicKey = getEnv("SUPABASE_PUBLISHABLE_KEY") ??
    getEnv("SUPABASE_ANON_KEY");
  const harnessEnvironment = resolveHarnessEnvironment({
    url: supabaseUrl,
    environment: getEnv("NESTSCOUT_ENVIRONMENT"),
    projectRef: getEnv("SUPABASE_PROJECT_REF"),
    publishableKey: supabasePublicKey,
    secretKey: supabaseSecretKey,
    mutationIntent: "read-only",
  });
  const harnessRelease = readHarnessRuntimeRelease(getEnv);
  const releaseId = harnessRelease.releaseId;

  return {
    supabaseUrl,
    supabaseSecretKey,
    supabasePublicKey,
    harnessEnvironment,
    harnessRelease,
    releaseId,
    minimumClientBuildNumber: readPositiveInteger(getEnv("NESTSCOUT_MINIMUM_CLIENT_BUILD_NUMBER")),
    clientCompatibility: {
      contractEpoch: readPositiveInteger(getEnv("NESTSCOUT_STAGE1_CLIENT_CONTRACT_EPOCH")) ?? 2,
      releaseId,
      gitSha: harnessRelease.gitSha,
      ios: readMobileClientPlatformCompatibility(getEnv, "IOS", "com.phanmanhtu.homeservices"),
      android: readMobileClientPlatformCompatibility(getEnv, "ANDROID", "com.phanmanhtu.nestscout"),
    },
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
      ? harnessEnvironment.name === "staging"
      : envFlag(sourceTrustFlag),
    sourceTrustPerplexityFilterExplicit: sourceTrustExplicit,
    durableGuardsEnabled: readBooleanFlag(
      getEnv("KAEL_DURABLE_GUARDS_ENABLED"),
    ),
    stagingPaymentRailEnabled:
      harnessEnvironment.name === "staging" &&
      readBooleanFlag(getEnv("NESTSCOUT_STAGING_PAYMENT_RAIL_ENABLED")),
    manualBank: readPlatformManualBankConfig(getEnv, harnessEnvironment.name),
    sepayVietQr: readSePayVietQrConfig(getEnv, harnessEnvironment.name),
    aiKillSwitch: readBooleanFlag(getEnv("KAEL_AI_KILL_SWITCH")),
  };
}

export function assertProductionReleaseRegistered(
  env: Pick<EdgeEnv, "harnessEnvironment" | "harnessRelease">,
): void {
  if (env.harnessEnvironment.name !== "production" || env.harnessRelease.registered) return;
  throw new Error("Production release identity is incomplete");
}

function readPlatformManualBankConfig(
  getEnv: (name: string) => string | undefined,
  environment: HarnessEnvironmentDescriptor["name"],
): PlatformManualBankConfig {
  const bankCode = readVietQrBankCode(getEnv("PLATFORM_MANUAL_BANK_CODE"));
  const accountNumber = readVietQrAccountNumber(
    getEnv("PLATFORM_MANUAL_BANK_ACCOUNT_NUMBER"),
  );
  const accountHolder = readBoundedText(
    getEnv("PLATFORM_MANUAL_BANK_ACCOUNT_HOLDER"),
    120,
  );
  const enabled = environment !== "staging" &&
    readBooleanFlag(getEnv("NESTSCOUT_PLATFORM_MANUAL_BANK_ENABLED")) &&
    Boolean(bankCode && accountNumber && accountHolder);

  return {
    enabled,
    ...(bankCode ? { bankCode } : {}),
    ...(accountNumber ? { accountNumber } : {}),
    ...(accountHolder ? { accountHolder } : {}),
  };
}

function readSePayVietQrConfig(
  getEnv: (name: string) => string | undefined,
  environment: HarnessEnvironmentDescriptor["name"],
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
  const enabled = environment !== "staging" &&
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

function readMobileClientPlatformCompatibility(
  getEnv: (name: string) => string | undefined,
  platform: "IOS" | "ANDROID",
  defaultApplicationId: string,
): MobileClientPlatformCompatibility {
  const applicationId = readBoundedText(
    getEnv(`NESTSCOUT_STAGE1_${platform}_APPLICATION_ID`),
    160,
  ) ?? defaultApplicationId;
  return {
    applicationId,
    minimumBuildNumber: readPositiveInteger(
      getEnv(`NESTSCOUT_STAGE1_${platform}_MINIMUM_BUILD_NUMBER`),
    ),
    easBuildId: readUuid(getEnv(`NESTSCOUT_STAGE1_${platform}_EAS_BUILD_ID`)),
    runtimeVersion: readBoundedText(
      getEnv(`NESTSCOUT_STAGE1_${platform}_RUNTIME_VERSION`),
      80,
    ) ?? null,
  };
}

function readPositiveInteger(value: string | undefined): number | null {
  const normalized = value?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readUuid(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}

const envFlag = readBooleanFlag;
