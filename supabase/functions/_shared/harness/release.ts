import type { HarnessEnvironmentDescriptor } from "./environment.ts";

export type HarnessRuntimeRelease = {
  readonly releaseId: string;
  readonly gitSha: string;
  readonly manifestSha256: string;
  readonly bundleSha256: string;
  readonly registered: boolean;
};

export function readHarnessRuntimeRelease(
  getEnv: (name: string) => string | undefined,
): HarnessRuntimeRelease {
  const releaseId = readValue(getEnv("HARNESS_RELEASE_ID"), 128) ?? "unreleased";
  const gitSha = readDigest(getEnv("HARNESS_GIT_SHA"), 40) ?? "unknown";
  const manifestSha256 = readDigest(getEnv("HARNESS_MANIFEST_SHA256"), 64) ??
    "unknown";
  const bundleSha256 = readDigest(getEnv("HARNESS_BUNDLE_SHA256"), 64) ??
    "unknown";
  return Object.freeze({
    releaseId,
    gitSha,
    manifestSha256,
    bundleSha256,
    registered: releaseId !== "unreleased" && gitSha !== "unknown" &&
      manifestSha256 !== "unknown" && bundleSha256 !== "unknown",
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
      git_sha: input.release.gitSha,
      manifest_sha256: input.release.manifestSha256,
      bundle_sha256: input.release.bundleSha256,
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

function readValue(value: string | undefined, maxLength: number): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length <= maxLength &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)
    ? normalized
    : null;
}
