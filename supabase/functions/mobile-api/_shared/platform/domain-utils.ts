import type { MobileApiContext } from "./auth.ts";
import { asNumber } from "./coercions.ts";

type SourceTrustSecrets = {
  sourceTrustPerplexityFilterEnabled?: boolean;
  sourceTrustPerplexityFilterExplicit?: boolean;
  supabaseUrl?: string;
};

const STAGING_PROJECT_REF = "xyylanuyflrjzbjzhqfl";

export function compactMetadata(input: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      result[key] = value.filter((item) => typeof item === "string");
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function secondsRemaining(
  expiresAt: string | null,
  now: Date,
): number | null {
  if (!expiresAt) return null;
  return Math.max(
    0,
    Math.round((new Date(expiresAt).getTime() - now.getTime()) / 1000),
  );
}

export function maskBankAccount(account: string | null): string | null {
  if (!account || account.length < 4) return null;
  return `****${account.slice(-4)}`;
}

export function blankWorkerProfile(workerId: string) {
  return {
    id: workerId,
    avatar_url: null,
    active_minutes: 0,
    last_active_at: null,
    verification_status: "draft" as const,
    is_available: false,
    is_approved: false,
    is_suspended: false,
    service_types: [],
    active_service_types: [],
    selected_service_types: [],
    service_quality: [],
    districts: [],
    home_lat: null,
    home_lng: null,
    service_radius_km: null,
    problem_specializations: [],
    years_experience: 0,
    rating: 0,
    total_jobs: 0,
    legal_name: null,
    date_of_birth: null,
    gender: null,
    bank_account_masked: null,
    bank_name: null,
    has_cccd: false,
    has_cccd_front: false,
    has_cccd_back: false,
    has_selfie: false,
  };
}

export function clampServiceRadius(value: unknown): number {
  const radius = Math.round(asNumber(value) || 8);
  return Math.min(30, Math.max(1, radius));
}

export function sourceTrustSecretsForRequest<T extends SourceTrustSecrets>(
  secrets: T,
  ctx: MobileApiContext,
): T {
  if (secrets.sourceTrustPerplexityFilterEnabled === true) return secrets;
  if (secrets.sourceTrustPerplexityFilterExplicit === true) return secrets;
  if (!isStagingSourceTrustRequest(secrets, ctx)) return secrets;
  return { ...secrets, sourceTrustPerplexityFilterEnabled: true };
}

function isStagingSourceTrustRequest<T extends SourceTrustSecrets>(
  secrets: T,
  ctx: MobileApiContext,
): boolean {
  return [
    secrets.supabaseUrl,
    ctx.requestProjectRef,
    ctx.requestHost,
    ctx.requestUrl,
  ].some((value) =>
    typeof value === "string" && value.includes(STAGING_PROJECT_REF)
  );
}
