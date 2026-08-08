export const HARNESS_LOCAL_URL = "http://127.0.0.1:55321";
export const HARNESS_STAGING_PROJECT_REF = "xyylanuyflrjzbjzhqfl";
export const HARNESS_PRODUCTION_PROJECT_REF = "iwevizmsedyqozxlawwl";

export type HarnessEnvironmentName =
  | "local"
  | "preview"
  | "staging"
  | "production";

export type HarnessKeyClass =
  | "local-demo-anon"
  | "local-demo-service-role"
  | "publishable"
  | "secret"
  | "jwt-anon"
  | "jwt-service-role"
  | "unknown"
  | "absent";

export type HarnessMutationIntent = "read-only" | "mutate";

export type HarnessProviderConfigurationClass =
  | "local-development"
  | "preview-isolated"
  | "staging-isolated"
  | "production-locked";

export type HarnessWebhookConfigurationClass =
  | "local-loopback"
  | "preview-disabled"
  | "staging-sandbox"
  | "production-signed";

export type HarnessRemoteMutationApproval = {
  readonly approvalId: string;
  readonly environment: Exclude<HarnessEnvironmentName, "local">;
  readonly projectRef: string;
  readonly releaseId: string;
  readonly source: "ci" | "operator";
  readonly allowProduction?: boolean;
};

export type HarnessEnvironmentDescriptor = {
  readonly name: HarnessEnvironmentName;
  readonly origin: string;
  readonly host: string;
  readonly projectRef: string | null;
  readonly isLocal: boolean;
  readonly isRemote: boolean;
  readonly mutationIntent: HarnessMutationIntent;
  readonly providerConfigurationClass: HarnessProviderConfigurationClass;
  readonly webhookConfigurationClass: HarnessWebhookConfigurationClass;
  readonly mutationAllowed: boolean;
  readonly approvalId: string | null;
  readonly releaseId: string | null;
  readonly keyClasses: {
    readonly publishable: HarnessKeyClass;
    readonly secret: HarnessKeyClass;
  };
};

export type HarnessEnvironmentInput = {
  readonly url?: string | null;
  readonly environment?: string | null;
  readonly projectRef?: string | null;
  readonly publishableKey?: string | null;
  readonly secretKey?: string | null;
  readonly mutationIntent?: HarnessMutationIntent;
  readonly approval?: HarnessRemoteMutationApproval | null;
};

const LOCAL_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
]);

const LOCAL_DEMO_ISSUER = "supabase-demo";

export class HarnessEnvironmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HarnessEnvironmentError";
    this.code = code;
  }
}

export function resolveHarnessEnvironment(
  input: HarnessEnvironmentInput,
): HarnessEnvironmentDescriptor {
  const urlValue = normalizedText(input.url) ?? HARNESS_LOCAL_URL;
  const parsed = parseUrl(urlValue);
  const local = LOCAL_HOSTS.has(parsed.hostname);
  const inferredProjectRef = projectRefFromHostname(parsed.hostname);
  const projectRef = normalizedText(input.projectRef) ?? inferredProjectRef;
  const explicitEnvironment = normalizeEnvironment(input.environment);
  const name = resolveEnvironmentName({
    explicitEnvironment,
    local,
    projectRef,
  });
  assertEnvironmentProjectMatch(name, projectRef, local);

  const publishableClass = classifySupabaseKey(input.publishableKey);
  const secretClass = classifySupabaseKey(input.secretKey);
  assertKnownRemoteKeyClass(local, "publishable", input.publishableKey, publishableClass);
  assertKnownRemoteKeyClass(local, "secret", input.secretKey, secretClass);
  assertKeyPlacement("publishable", publishableClass);
  assertKeyPlacement("secret", secretClass);
  if (!local && isLocalDemoKey(publishableClass, secretClass)) {
    throw new HarnessEnvironmentError(
      "LOCAL_KEY_REMOTE_HOST",
      "Local Supabase demo keys cannot be sent to a remote host.",
    );
  }
  if (!local && !projectRef) {
    throw new HarnessEnvironmentError(
      "REMOTE_PROJECT_IDENTITY_REQUIRED",
      "Remote Supabase targets require an explicit or host-derived project reference.",
    );
  }

  const mutationIntent = input.mutationIntent ?? "read-only";
  const mutation = resolveMutationAuthorization({
    name,
    projectRef,
    local,
    mutationIntent,
    approval: input.approval ?? null,
  });

  return Object.freeze({
    name,
    origin: parsed.origin,
    host: parsed.host,
    projectRef,
    isLocal: local,
    isRemote: !local,
    mutationIntent,
    providerConfigurationClass: providerConfigurationClass(name),
    webhookConfigurationClass: webhookConfigurationClass(name),
    mutationAllowed: mutation.allowed,
    approvalId: mutation.approvalId,
    releaseId: mutation.releaseId,
    keyClasses: Object.freeze({
      publishable: publishableClass,
      secret: secretClass,
    }),
  });
}

export function assertHarnessMutationAllowed(
  descriptor: HarnessEnvironmentDescriptor,
): void {
  if (descriptor.mutationAllowed) return;
  throw new HarnessEnvironmentError(
    "REMOTE_MUTATION_NOT_APPROVED",
    `Remote mutation is not approved for ${descriptor.name}.`,
  );
}

export function projectRefFromSupabaseUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    return projectRefFromHostname(new URL(value).hostname);
  } catch {
    return null;
  }
}

export function classifySupabaseKey(
  value: string | null | undefined,
): HarnessKeyClass {
  const key = normalizedText(value);
  if (!key) return "absent";
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("sb_secret_")) return "secret";
  const claims = decodeJwtClaims(key);
  const role = claims?.role;
  const issuer = claims?.iss;
  if (issuer === LOCAL_DEMO_ISSUER && role === "anon") {
    return "local-demo-anon";
  }
  if (issuer === LOCAL_DEMO_ISSUER && role === "service_role") {
    return "local-demo-service-role";
  }
  if (role === "anon") return "jwt-anon";
  if (role === "service_role") return "jwt-service-role";
  return "unknown";
}

export function safeEnvironmentMetadata(
  descriptor: HarnessEnvironmentDescriptor,
): Record<string, unknown> {
  return {
    environment: descriptor.name,
    project_ref: descriptor.projectRef,
    host: descriptor.host,
    mutation_intent: descriptor.mutationIntent,
    mutation_allowed: descriptor.mutationAllowed,
    provider_configuration_class: descriptor.providerConfigurationClass,
    webhook_configuration_class: descriptor.webhookConfigurationClass,
    approval_id: descriptor.approvalId,
    release_id: descriptor.releaseId,
    publishable_key_class: descriptor.keyClasses.publishable,
    secret_key_class: descriptor.keyClasses.secret,
  };
}

function resolveEnvironmentName(input: {
  explicitEnvironment: HarnessEnvironmentName | null;
  local: boolean;
  projectRef: string | null;
}): HarnessEnvironmentName {
  if (input.local) {
    if (input.explicitEnvironment && input.explicitEnvironment !== "local") {
      throw new HarnessEnvironmentError(
        "LOCAL_ENVIRONMENT_MISMATCH",
        "A local host cannot be labeled as a remote environment.",
      );
    }
    return "local";
  }
  if (!input.explicitEnvironment) {
    throw new HarnessEnvironmentError(
      "REMOTE_ENVIRONMENT_REQUIRED",
      "Remote targets require NESTSCOUT_ENVIRONMENT or an equivalent explicit environment.",
    );
  }
  return input.explicitEnvironment;
}

function assertEnvironmentProjectMatch(
  environment: HarnessEnvironmentName,
  projectRef: string | null,
  local: boolean,
): void {
  if (local) return;
  if (environment === "staging" && projectRef !== HARNESS_STAGING_PROJECT_REF) {
    throw new HarnessEnvironmentError(
      "STAGING_PROJECT_MISMATCH",
      "The staging environment must target the registered staging project.",
    );
  }
  if (
    environment === "production" &&
    projectRef !== HARNESS_PRODUCTION_PROJECT_REF
  ) {
    throw new HarnessEnvironmentError(
      "PRODUCTION_PROJECT_MISMATCH",
      "The production environment must target the registered production project.",
    );
  }
  if (
    environment !== "production" &&
    projectRef === HARNESS_PRODUCTION_PROJECT_REF
  ) {
    throw new HarnessEnvironmentError(
      "PRODUCTION_REFERENCE_MISMATCH",
      "The production project cannot be labeled as preview or staging.",
    );
  }
  if (
    environment !== "staging" &&
    projectRef === HARNESS_STAGING_PROJECT_REF
  ) {
    throw new HarnessEnvironmentError(
      "STAGING_REFERENCE_MISMATCH",
      "The staging project must be labeled as staging.",
    );
  }
}

function resolveMutationAuthorization(input: {
  name: HarnessEnvironmentName;
  projectRef: string | null;
  local: boolean;
  mutationIntent: HarnessMutationIntent;
  approval: HarnessRemoteMutationApproval | null;
}): { allowed: boolean; approvalId: string | null; releaseId: string | null } {
  if (input.mutationIntent === "read-only") {
    return { allowed: true, approvalId: null, releaseId: null };
  }
  if (input.local) {
    return { allowed: true, approvalId: "local", releaseId: "local" };
  }
  const approval = input.approval;
  if (!approval) {
    return { allowed: false, approvalId: null, releaseId: null };
  }
  if (
    approval.environment !== input.name ||
    approval.projectRef !== input.projectRef ||
    !normalizedText(approval.approvalId) ||
    !normalizedText(approval.releaseId)
  ) {
    throw new HarnessEnvironmentError(
      "REMOTE_APPROVAL_MISMATCH",
      "Remote mutation approval does not match the selected environment and release.",
    );
  }
  if (input.name === "production") {
    if (approval.source !== "operator" || approval.allowProduction !== true) {
      throw new HarnessEnvironmentError(
        "PRODUCTION_MUTATION_REQUIRES_OPERATOR",
        "Production mutation requires an operator approval that explicitly permits production.",
      );
    }
  }
  return {
    allowed: true,
    approvalId: approval.approvalId,
    releaseId: approval.releaseId,
  };
}

function assertKeyPlacement(
  slot: "publishable" | "secret",
  keyClass: HarnessKeyClass,
): void {
  if (keyClass === "absent" || keyClass === "unknown") return;
  const publishable = keyClass === "publishable" ||
    keyClass === "jwt-anon" || keyClass === "local-demo-anon";
  const secret = keyClass === "secret" ||
    keyClass === "jwt-service-role" || keyClass === "local-demo-service-role";
  if (slot === "publishable" && secret) {
    throw new HarnessEnvironmentError(
      "SECRET_IN_PUBLISHABLE_SLOT",
      "A service-role or secret key was supplied in the publishable-key slot.",
    );
  }
  if (slot === "secret" && publishable) {
    throw new HarnessEnvironmentError(
      "PUBLISHABLE_IN_SECRET_SLOT",
      "An anon or publishable key was supplied in the secret-key slot.",
    );
  }
}

function assertKnownRemoteKeyClass(
  local: boolean,
  slot: "publishable" | "secret",
  rawValue: string | null | undefined,
  keyClass: HarnessKeyClass,
): void {
  if (local || !normalizedText(rawValue) || keyClass !== "unknown") return;
  throw new HarnessEnvironmentError(
    "REMOTE_KEY_CLASS_UNKNOWN",
    `The remote ${slot}-key class could not be verified.`,
  );
}

function providerConfigurationClass(
  environment: HarnessEnvironmentName,
): HarnessProviderConfigurationClass {
  switch (environment) {
    case "local":
      return "local-development";
    case "preview":
      return "preview-isolated";
    case "staging":
      return "staging-isolated";
    case "production":
      return "production-locked";
  }
}

function webhookConfigurationClass(
  environment: HarnessEnvironmentName,
): HarnessWebhookConfigurationClass {
  switch (environment) {
    case "local":
      return "local-loopback";
    case "preview":
      return "preview-disabled";
    case "staging":
      return "staging-sandbox";
    case "production":
      return "production-signed";
  }
}

function isLocalDemoKey(...classes: HarnessKeyClass[]): boolean {
  return classes.some((value) => value.startsWith("local-demo-"));
}

function projectRefFromHostname(hostname: string): string | null {
  const parts = hostname.toLowerCase().split(".");
  if (parts.length < 3 || parts.slice(1).join(".") !== "supabase.co") {
    return null;
  }
  return normalizedText(parts[0]) ?? null;
}

function normalizeEnvironment(value: string | null | undefined):
  | HarnessEnvironmentName
  | null {
  const normalized = normalizedText(value)?.toLowerCase();
  if (!normalized) return null;
  if (
    normalized === "local" || normalized === "preview" ||
    normalized === "staging" || normalized === "production"
  ) {
    return normalized;
  }
  throw new HarnessEnvironmentError(
    "ENVIRONMENT_INVALID",
    `Unsupported Harness environment: ${normalized}.`,
  );
}

function parseUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new HarnessEnvironmentError(
      "URL_INVALID",
      "The Supabase target URL is invalid.",
    );
  }
}

function decodeJwtClaims(value: string): Record<string, unknown> | null {
  const payload = value.split(".")[1];
  if (!payload) return null;
  try {
    const decoded = decodeBase64Url(payload);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  if (typeof atob === "function") {
    const binary = atob(padded);
    return new TextDecoder().decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  }
  const buffer = (globalThis as {
    Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } };
  }).Buffer;
  if (buffer) return buffer.from(padded, "base64").toString("utf8");
  throw new Error("BASE64_DECODER_UNAVAILABLE");
}

function normalizedText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
