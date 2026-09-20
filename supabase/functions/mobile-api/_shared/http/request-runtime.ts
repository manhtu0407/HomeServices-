import type {
  MobileApiContext,
  MobileApiHandlerDeps,
} from "./contracts.ts";
import { apiFailure } from "../platform/api-failure.ts";

const CLIENT_IDENTITY_HEADERS = [
  "x-client-platform",
  "x-client-application-id",
  "x-client-build-number",
  "x-client-contract-epoch",
  "x-client-eas-build-id",
  "x-client-runtime-version",
  "x-client-git-sha",
  "x-client-release-id",
] as const;
const CUSTOMER_CONVERSATION_COLLECTION_PATH = /(?:^|\/)me\/kael\/conversations\/?$/u;
const CUSTOMER_CONVERSATION_TURN_PATH = /(?:^|\/)me\/kael\/conversations\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/turn\/?$/iu;
const CUSTOMER_CONVERSATION_STREAM_PATH = /(?:^|\/)me\/kael\/conversations\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/stream\/?$/iu;
const CUSTOMER_CONVERSATION_ARCHIVE_PATH = /(?:^|\/)me\/kael\/conversations\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/?$/iu;

export function enforceClientCompatibility(
  request: Request,
  deps: MobileApiHandlerDeps,
): void {
  if (request.method === "GET" || request.method === "OPTIONS") return;
  const compatibility = deps.clientCompatibility;
  if (compatibility) {
    enforceStage1ClientCompatibility(request, compatibility);
    return;
  }
  const minimum = deps.minimumClientBuildNumber;
  if (!minimum) return;
  const clientBuild = positiveHeaderInteger(request, "x-client-build-number");
  if (clientBuild !== null && clientBuild >= minimum) return;
  apiFailure(
    "CLIENT_UPDATE_REQUIRED",
    "Phiên bản NestScout này cần được cập nhật trước khi tiếp tục",
    426,
    { minimum_client_build_number: minimum },
  );
}

function enforceStage1ClientCompatibility(
  request: Request,
  compatibility: NonNullable<MobileApiHandlerDeps["clientCompatibility"]>,
): void {
  if (allowsHeaderlessLegacyCustomerConversation(request)) return;
  const epoch = positiveHeaderInteger(request, "x-client-contract-epoch");
  const platform = request.headers.get("x-client-platform")?.trim().toLowerCase();
  const platformPolicy = platform === "ios" || platform === "android"
    ? compatibility[platform]
    : null;
  const build = positiveHeaderInteger(request, "x-client-build-number");
  const applicationId = request.headers.get("x-client-application-id")?.trim() ?? "";
  if (epoch === null || epoch < compatibility.contractEpoch) {
    if (platformPolicy !== null && platformPolicy.minimumBuildNumber !== null &&
      build !== null && build >= platformPolicy.minimumBuildNumber &&
      applicationId === platformPolicy.applicationId) return;
    rejectIncompatibleClient(compatibility.contractEpoch, platformPolicy?.minimumBuildNumber ?? null, platform);
  }
  const easBuildId = request.headers.get("x-client-eas-build-id")?.trim().toLowerCase() ?? "";
  const runtimeVersion = request.headers.get("x-client-runtime-version")?.trim() ?? "";
  const gitSha = request.headers.get("x-client-git-sha")?.trim().toLowerCase() ?? "";
  const releaseId = request.headers.get("x-client-release-id")?.trim() ?? "";
  if (
    epoch !== compatibility.contractEpoch || !platformPolicy ||
    platformPolicy.minimumBuildNumber === null || build === null ||
    build < platformPolicy.minimumBuildNumber ||
    applicationId !== platformPolicy.applicationId ||
    !platformPolicy.easBuildId || easBuildId !== platformPolicy.easBuildId ||
    !platformPolicy.runtimeVersion || runtimeVersion !== platformPolicy.runtimeVersion ||
    gitSha !== compatibility.gitSha || releaseId !== compatibility.releaseId
  ) {
    rejectIncompatibleClient(compatibility.contractEpoch, platformPolicy?.minimumBuildNumber ?? null, platform);
  }
}

function allowsHeaderlessLegacyCustomerConversation(request: Request): boolean {
  if (CLIENT_IDENTITY_HEADERS.some((name) => request.headers.get(name)?.trim())) return false;
  const pathname = safeRequestUrl(request.url)?.pathname ?? "";
  if (request.method === "POST") {
    return CUSTOMER_CONVERSATION_COLLECTION_PATH.test(pathname) ||
      CUSTOMER_CONVERSATION_TURN_PATH.test(pathname) ||
      CUSTOMER_CONVERSATION_STREAM_PATH.test(pathname);
  }
  return request.method === "DELETE" && CUSTOMER_CONVERSATION_ARCHIVE_PATH.test(pathname);
}

function rejectIncompatibleClient(
  requiredContractEpoch: number,
  minimumBuildNumber: number | null,
  platform: string | undefined,
): never {
  return apiFailure(
    "CLIENT_UPDATE_REQUIRED",
    "Phiên bản NestScout này cần được cập nhật trước khi tiếp tục",
    426,
    {
      required_contract_epoch: requiredContractEpoch,
      minimum_client_build_number: minimumBuildNumber,
      platform: platform ?? null,
    },
  );
}

export function requestRuntimeContext(request: Request): Pick<
  MobileApiContext,
  "requestUrl" | "requestHost" | "requestProjectRef" | "clientPlatform" |
  "clientApplicationId" | "clientBuildNumber" | "clientContractEpoch" |
  "clientEasBuildId" | "clientRuntimeVersion" | "clientGitSha" | "clientReleaseId"
> {
  const parsed = safeRequestUrl(request.url);
  const host = request.headers.get("host") ??
    request.headers.get("x-forwarded-host") ??
    parsed?.host;
  return {
    requestUrl: request.url,
    requestHost: host ?? undefined,
    requestProjectRef: request.headers.get("sb-project-ref") ??
      request.headers.get("x-supabase-project-ref") ??
      projectRefFromHost(host) ??
      projectRefFromHost(parsed?.host),
    ...requestClientIdentity(request),
  };
}

function requestClientIdentity(request: Request): Partial<Pick<
  MobileApiContext,
  "clientPlatform" | "clientApplicationId" | "clientBuildNumber" |
  "clientContractEpoch" | "clientEasBuildId" | "clientRuntimeVersion" |
  "clientGitSha" | "clientReleaseId"
>> {
  const platform = request.headers.get("x-client-platform")?.trim().toLowerCase();
  const clientPlatform: "ios" | "android" | undefined = platform === "ios" || platform === "android"
    ? platform
    : undefined;
  const buildNumber = positiveHeaderInteger(request, "x-client-build-number");
  const contractEpoch = positiveHeaderInteger(request, "x-client-contract-epoch");
  return {
    ...(clientPlatform ? { clientPlatform } : {}),
    ...(request.headers.get("x-client-application-id")?.trim()
      ? { clientApplicationId: request.headers.get("x-client-application-id")!.trim() }
      : {}),
    ...(buildNumber !== null ? { clientBuildNumber: buildNumber } : {}),
    ...(contractEpoch !== null ? { clientContractEpoch: contractEpoch } : {}),
    ...(request.headers.get("x-client-eas-build-id")?.trim()
      ? { clientEasBuildId: request.headers.get("x-client-eas-build-id")!.trim().toLowerCase() }
      : {}),
    ...(request.headers.get("x-client-runtime-version")?.trim()
      ? { clientRuntimeVersion: request.headers.get("x-client-runtime-version")!.trim() }
      : {}),
    ...(request.headers.get("x-client-git-sha")?.trim()
      ? { clientGitSha: request.headers.get("x-client-git-sha")!.trim().toLowerCase() }
      : {}),
    ...(request.headers.get("x-client-release-id")?.trim()
      ? { clientReleaseId: request.headers.get("x-client-release-id")!.trim() }
      : {}),
  };
}

function positiveHeaderInteger(request: Request, name: string): number | null {
  const raw = request.headers.get(name)?.trim() ?? "";
  if (!/^[1-9][0-9]{0,8}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function safeRequestUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function projectRefFromHost(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const hostname = value.split(":")[0] ?? value;
  const [projectRef, ...rest] = hostname.split(".");
  return rest.join(".").endsWith("supabase.co") && projectRef
    ? projectRef
    : undefined;
}
