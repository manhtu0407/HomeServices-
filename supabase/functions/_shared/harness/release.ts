import type { HarnessEnvironmentDescriptor } from "./environment.ts";

export type HarnessRuntimeRelease = {
  readonly releaseId: string;
  readonly deploymentId: string | null;
  readonly gitSha: string;
  readonly manifestSha256: string;
  readonly bundleSha256: string;
  readonly sourceBundleSha256: string;
  readonly mobileBuildFingerprintSha256: string;
  readonly productionUiSourceSha256: string;
  readonly edgeBundleSha256: string;
  readonly migrationInventorySha256: string;
  readonly serviceIntakePolicyBundleSha256: string;
  readonly priceEvidenceBundleSha256: string;
  readonly providerReadinessFingerprintSha256: string;
  readonly releaseLane?: 'verification' | 'plan55-production-only';
  readonly providerReadiness?: RuntimeProviderReadiness;
  readonly clientCompatibility?: {
    readonly gitSha: string;
    readonly releaseId: string;
    readonly contractEpoch: number | null;
    readonly ios: RuntimeClientPlatformIdentity;
    readonly android: RuntimeClientPlatformIdentity;
  };
  readonly registered: boolean;
};

type RuntimeClientPlatformIdentity = {
  readonly applicationId: string | null;
  readonly minimumBuildNumber: number | null;
  readonly easBuildId: string | null;
  readonly runtimeVersion: string | null;
};

type RuntimeProviderReadiness = {
  readonly android_fcm_v1: boolean;
  readonly anthropic: boolean;
  readonly deepseek: boolean;
  readonly durable_guards: boolean;
  readonly global_ai_enabled: boolean;
  readonly ios_apns: boolean;
  readonly perplexity: boolean;
  readonly push_receipt_reconciler: boolean;
  readonly vietmap: boolean;
};

export function readHarnessRuntimeRelease(
  getEnv: (name: string) => string | undefined,
): HarnessRuntimeRelease {
  const releaseId = readValue(getEnv("HARNESS_RELEASE_ID"), 128) ?? "unreleased";
  const deploymentId = readDeploymentId(getEnv("DENO_DEPLOYMENT_ID"));
  const gitSha = readDigest(getEnv("HARNESS_GIT_SHA"), 40) ?? "unknown";
  const manifestSha256 = readDigest(getEnv("HARNESS_MANIFEST_SHA256"), 64) ??
    "unknown";
  const bundleSha256 = readDigest(getEnv("HARNESS_BUNDLE_SHA256"), 64) ??
    "unknown";
  const sourceBundleSha256 = readDigest(getEnv("HARNESS_SOURCE_BUNDLE_SHA256"), 64) ?? "unknown";
  const mobileBuildFingerprintSha256 = readDigest(getEnv("HARNESS_MOBILE_BUILD_FINGERPRINT_SHA256"), 64) ?? "unknown";
  const productionUiSourceSha256 = readDigest(getEnv("HARNESS_PRODUCTION_UI_SOURCE_SHA256"), 64) ?? "unknown";
  const edgeBundleSha256 = readDigest(getEnv("HARNESS_EDGE_BUNDLE_SHA256"), 64) ?? "unknown";
  const migrationInventorySha256 = readDigest(getEnv("HARNESS_MIGRATION_INVENTORY_SHA256"), 64) ?? "unknown";
  const serviceIntakePolicyBundleSha256 = readDigest(getEnv("HARNESS_SERVICE_INTAKE_POLICY_BUNDLE_SHA256"), 64) ?? "unknown";
  const priceEvidenceBundleSha256 = readDigest(getEnv("HARNESS_PRICE_EVIDENCE_BUNDLE_SHA256"), 64) ?? "unknown";
  const providerReadinessFingerprintSha256 = readDigest(getEnv("HARNESS_PROVIDER_READINESS_FINGERPRINT_SHA256"), 64) ?? "unknown";
  const rawReleaseLane = getEnv("HARNESS_RELEASE_LANE")?.trim();
  const environmentName = getEnv("NESTSCOUT_ENVIRONMENT")?.trim();
  const releaseLane = rawReleaseLane === "verification" || rawReleaseLane === "plan55-production-only"
    ? rawReleaseLane
    : undefined;
  const releaseLaneValid = !rawReleaseLane || (environmentName === "production" && releaseLane !== undefined);
  const activeClientGitSha = readDigest(getEnv("HARNESS_CLIENT_COMPAT_GIT_SHA"), 40);
  const activeClientReleaseId = readValue(getEnv("HARNESS_CLIENT_COMPAT_RELEASE_ID"), 128);
  const plan55ClientIdentityValid = rawReleaseLane !== "plan55-production-only" ||
    (activeClientGitSha !== null && activeClientReleaseId !== null &&
      new RegExp(`^harness-${activeClientGitSha.slice(0, 12)}-[0-9a-f]{12}$`, "i").test(activeClientReleaseId));
  const providerReadiness = readRuntimeProviderReadiness(getEnv);
  const clientCompatibility = {
    gitSha: rawReleaseLane === "plan55-production-only" ? activeClientGitSha ?? "unknown" : gitSha,
    releaseId: rawReleaseLane === "plan55-production-only" ? activeClientReleaseId ?? "unreleased" : releaseId,
    contractEpoch: readPositiveInteger(getEnv("NESTSCOUT_STAGE1_CLIENT_CONTRACT_EPOCH")),
    ios: readRuntimeClientPlatform(getEnv, "IOS"),
    android: readRuntimeClientPlatform(getEnv, "ANDROID"),
  };
  const requiredDigests = [
    gitSha,
    manifestSha256,
    bundleSha256,
    sourceBundleSha256,
    mobileBuildFingerprintSha256,
    productionUiSourceSha256,
    edgeBundleSha256,
    migrationInventorySha256,
    serviceIntakePolicyBundleSha256,
    priceEvidenceBundleSha256,
    providerReadinessFingerprintSha256,
  ];
  return Object.freeze({
    releaseId,
    deploymentId,
    gitSha,
    manifestSha256,
    bundleSha256,
    sourceBundleSha256,
    mobileBuildFingerprintSha256,
    productionUiSourceSha256,
    edgeBundleSha256,
    migrationInventorySha256,
    serviceIntakePolicyBundleSha256,
    priceEvidenceBundleSha256,
    providerReadinessFingerprintSha256,
    ...(releaseLane ? { releaseLane } : {}),
    providerReadiness,
    clientCompatibility,
    registered: releaseId !== "unreleased" && requiredDigests.every((value) => value !== "unknown") &&
      runtimeClientCompatibilityComplete(clientCompatibility) && providerRuntimeReady(providerReadiness) &&
      releaseLaneValid && plan55ClientIdentityValid,
  });
}

export function harnessHealthPayload(input: {
  readonly environment: HarnessEnvironmentDescriptor;
  readonly release: HarnessRuntimeRelease;
}) {
  return {
    service: "mobile-api",
    status: input.release.registered ? "ok" : "degraded",
    environment: {
      name: input.environment.name,
      project_ref: input.environment.projectRef,
      host: input.environment.host,
      provider_configuration_class: input.environment.providerConfigurationClass,
      webhook_configuration_class: input.environment.webhookConfigurationClass,
    },
    release: {
      release_id: input.release.releaseId,
      deployment_id: input.release.deploymentId,
      git_sha: input.release.gitSha,
      manifest_sha256: input.release.manifestSha256,
      bundle_sha256: input.release.bundleSha256,
      source_bundle_sha256: input.release.sourceBundleSha256,
      mobile_build_fingerprint_sha256: input.release.mobileBuildFingerprintSha256,
      production_ui_source_sha256: input.release.productionUiSourceSha256,
      edge_bundle_sha256: input.release.edgeBundleSha256,
      migration_inventory_sha256: input.release.migrationInventorySha256,
      service_intake_policy_bundle_sha256: input.release.serviceIntakePolicyBundleSha256,
      price_evidence_bundle_sha256: input.release.priceEvidenceBundleSha256,
      provider_readiness_fingerprint_sha256: input.release.providerReadinessFingerprintSha256,
      provider_readiness: input.release.providerReadiness ?? null,
      client_compatibility: input.release.clientCompatibility ?? null,
      release_lane: input.release.releaseLane ?? null,
      registered: input.release.registered,
    },
  } as const;
}

function readDigest(value: string | undefined, length: 40 | 64): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && new RegExp(`^[0-9a-f]{${length}}$`).test(normalized)
    ? normalized
    : null;
}

function readRuntimeClientPlatform(
  getEnv: (name: string) => string | undefined,
  platform: "IOS" | "ANDROID",
): RuntimeClientPlatformIdentity {
  return {
    applicationId: readValue(getEnv(`NESTSCOUT_STAGE1_${platform}_APPLICATION_ID`), 160),
    minimumBuildNumber: readPositiveInteger(getEnv(`NESTSCOUT_STAGE1_${platform}_MINIMUM_BUILD_NUMBER`)),
    easBuildId: readUuid(getEnv(`NESTSCOUT_STAGE1_${platform}_EAS_BUILD_ID`)),
    runtimeVersion: readValue(getEnv(`NESTSCOUT_STAGE1_${platform}_RUNTIME_VERSION`), 80),
  };
}

function runtimeClientCompatibilityComplete(value: NonNullable<HarnessRuntimeRelease["clientCompatibility"]>): boolean {
  return /^[0-9a-f]{40}$/i.test(value.gitSha) &&
    /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/i.test(value.releaseId) &&
    value.contractEpoch === 2 && [value.ios, value.android].every((platform) =>
    Boolean(platform.applicationId && platform.minimumBuildNumber && platform.easBuildId && platform.runtimeVersion)
  );
}

function readRuntimeProviderReadiness(
  getEnv: (name: string) => string | undefined,
): RuntimeProviderReadiness {
  const enabled = (name: string) => Boolean(getEnv(name)?.trim());
  const trueFlag = (name: string) => ["1", "true", "yes", "on"].includes(
    getEnv(name)?.trim().toLowerCase() ?? "",
  );
  return {
    android_fcm_v1: trueFlag("NESTSCOUT_ANDROID_FCM_V1_READY"),
    anthropic: enabled("ANTHROPIC_API_KEY"),
    deepseek: enabled("DEEPSEEK_API_KEY"),
    durable_guards: trueFlag("KAEL_DURABLE_GUARDS_ENABLED"),
    global_ai_enabled: !trueFlag("KAEL_AI_KILL_SWITCH"),
    ios_apns: trueFlag("NESTSCOUT_IOS_APNS_READY"),
    perplexity: enabled("PERPLEXITY_API_KEY"),
    push_receipt_reconciler: trueFlag("NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY"),
    vietmap: enabled("VIETMAP_API_KEY") || enabled("VIETMAP_MAPS_API_KEY"),
  };
}

function providerRuntimeReady(value: RuntimeProviderReadiness): boolean {
  return value.anthropic && value.durable_guards && value.global_ai_enabled &&
    value.perplexity && value.vietmap;
}

function readDeploymentId(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized &&
      /^[a-z0-9]{20}_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[1-9][0-9]*$/.test(normalized)
    ? normalized
    : null;
}

function readValue(value: string | undefined, maxLength: number): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length <= maxLength &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)
    ? normalized
    : null;
}

function readPositiveInteger(value: string | undefined): number | null {
  const normalized = value?.trim();
  if (!normalized || !/^[1-9][0-9]{0,8}$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function readUuid(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)
    ? normalized
    : null;
}
