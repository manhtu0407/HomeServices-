import {
  bindPrivilegedClientContext,
  createPrivilegedSupabaseClient,
  createUserScopedSupabaseClient,
  type SupabaseClientFactory,
} from "./privileged/service-client.ts";
import type { ActorContext } from "./authz/actor-context.ts";
import type { CapabilityEnvelope } from "./authz/capability-policy.ts";
import {
  bindHarnessTraceActor,
  createHarnessTraceContext,
  type HarnessTraceClient,
  type HarnessTraceContext,
} from "../../../_shared/harness/trace.ts";
import type { EdgeEnv } from "../../../_shared/platform/env.ts";
import { USER_ROLES, type UserRole } from "../../../_shared/domain.ts";
import {
  JOB_MEDIA_STORAGE_TIMEOUT_MS,
  MAX_JOB_MEDIA_BYTES,
} from "../../../_shared/job-media-contract.ts";
import { fetchBufferedWithTimeout } from "../../../_shared/network.ts";

export type MobileApiAuthResult =
  | {
    success: true;
    user: { id: string; email?: string; lastSignInAt?: string };
    role: UserRole;
    accountState?: "active" | "deletion_processing" | "deleted";
    supabase: unknown;
    privilegedSupabase?: unknown;
    userSupabase?: unknown;
    environment?: string;
    projectRef?: string | null;
    authenticatedAt?: string;
    requestUrl?: string;
    requestHost?: string;
    requestProjectRef?: string;
    releaseId?: string;
    traceId?: string;
    runId?: string;
    traceContext?: HarnessTraceContext;
  }
  | {
    success: false;
    error: string;
    status: 401 | 403;
  };

export type MobileApiContext = Extract<MobileApiAuthResult, { success: true }> & {
  actorContext?: ActorContext;
  capabilityEnvelope?: CapabilityEnvelope;
  traceId?: string;
  runId?: string;
  traceContext?: HarnessTraceContext;
  releaseId?: string;
};

const SUPABASE_TIMEOUT_MS = JOB_MEDIA_STORAGE_TIMEOUT_MS;
const SUPABASE_MAX_RESPONSE_BYTES = MAX_JOB_MEDIA_BYTES;

export function createEdgeAuthenticator(
  env: EdgeEnv,
  createSupabaseClient: SupabaseClientFactory = createPrivilegedSupabaseClient,
) {
  return async function authenticateRequest(
    request: Request,
    allowedRoles?: UserRole[],
  ): Promise<MobileApiAuthResult> {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return { success: false, error: "Vui lòng đăng nhập", status: 401 };
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return { success: false, error: "Vui lòng đăng nhập", status: 401 };
    }

    const supabase = createSupabaseClient(env.supabaseUrl, env.supabaseSecretKey, {
      global: { fetch: timeoutFetch },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser(
      token,
    );
    if (authError || !userData.user) {
      return { success: false, error: "Phiên đăng nhập hết hạn", status: 401 };
    }

    const currentProfile = await supabase
      .from("profiles")
      .select("role, account_state")
      .eq("id", userData.user.id)
      .single();
    let profile = currentProfile.data as AuthProfile | null;
    let profileError: unknown = currentProfile.error;
    if (isMissingAccountStateColumn(profileError)) {
      // Keep the pre-deletion schema usable while its additive migration rolls out.
      const legacyProfile = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();
      profile = legacyProfile.data
        ? { role: legacyProfile.data.role, account_state: "active" }
        : null;
      profileError = legacyProfile.error;
    }

    if (profileError || !profile) {
      return { success: false, error: "Phiên đăng nhập hết hạn", status: 401 };
    }

    if (!isUserRole(profile.role)) {
      return {
        success: false,
        error: "Vai trò tài khoản không hợp lệ",
        status: 403,
      };
    }

    const accountDeletionRetry = request.method === "POST" &&
      new URL(request.url).pathname.endsWith("/me/account-deletion");
    if (
      profile.account_state !== "active" &&
      !(profile.account_state === "deletion_processing" && accountDeletionRetry)
    ) {
      return {
        success: false,
        error: profile.account_state === "deleted"
          ? "Tài khoản này đã được xóa"
          : "Tài khoản đang được xử lý xóa",
        status: 403,
      };
    }

    if (
      allowedRoles && !allowedRoles.includes(profile.role) &&
      profile.role !== "admin"
    ) {
      return {
        success: false,
        error: "Bạn không có quyền thực hiện hành động này",
        status: 403,
      };
    }

    const accountState = normalizeAccountState(profile.account_state);
    const userSupabase = env.supabasePublicKey
      ? createUserScopedSupabaseClient({
        url: env.supabaseUrl,
        publicKey: env.supabasePublicKey,
        accessToken: token,
        createClient: createSupabaseClient,
      })
      : null;
    bindPrivilegedClientContext(supabase, {
      reason: "actor_authentication",
      environment: env.harnessEnvironment?.name ?? "unknown",
      projectRef: env.harnessEnvironment?.projectRef ?? null,
      releaseId: env.releaseId ?? "unreleased",
      actorId: userData.user.id,
      actorRole: profile.role,
    });
    const traceContext = await bindHarnessTraceActor(
      createHarnessTraceContext({
        releaseId: env.releaseId ?? "unreleased",
        environment: env.harnessEnvironment?.name ?? "local",
        client: supabase as HarnessTraceClient,
      }),
      {
        actorId: userData.user.id,
        actorRole: profile.role,
        client: supabase as HarnessTraceClient,
      },
    );

    return {
      success: true,
      user: {
        id: userData.user.id,
        email: userData.user.email,
        lastSignInAt: userData.user.last_sign_in_at,
      },
      role: profile.role,
      accountState,
      releaseId: env.releaseId ?? "unreleased",
      environment: env.harnessEnvironment?.name ?? "unknown",
      traceId: traceContext.traceId,
      runId: traceContext.runId,
      traceContext,
      projectRef: env.harnessEnvironment?.projectRef ?? null,
      authenticatedAt: new Date().toISOString(),
      privilegedSupabase: supabase,
      userSupabase: userSupabase ?? undefined,
      supabase,
    };
  };
}

type AuthProfile = {
  role: unknown;
  account_state: unknown;
};

function isMissingAccountStateColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === "42703" &&
    typeof candidate.message === "string" &&
    candidate.message.includes("account_state");
}

function isUserRole(role: unknown): role is UserRole {
  return typeof role === "string" &&
    (USER_ROLES as readonly string[]).includes(role);
}

function timeoutFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetchBufferedWithTimeout(input, init, {
    maxResponseBytes: SUPABASE_MAX_RESPONSE_BYTES,
    timeoutMs: SUPABASE_TIMEOUT_MS,
    validateJsonResponses: true,
  });
}

function normalizeAccountState(
  value: unknown,
): "active" | "deletion_processing" | "deleted" {
  return value === "deletion_processing" || value === "deleted"
    ? value
    : "active";
}
