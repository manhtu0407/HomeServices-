import { createClient } from "@supabase/supabase-js";
import type { EdgeEnv } from "./env.ts";
import type { MobileApiAuthResult } from "./router.ts";
import { USER_ROLES, type UserRole } from "../../_shared/domain.ts";

const SUPABASE_TIMEOUT_MS = 10_000;

export function createEdgeAuthenticator(env: EdgeEnv) {
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

    const supabase = createClient(env.supabaseUrl, env.supabaseSecretKey, {
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

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

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

    if (allowedRoles && !allowedRoles.includes(profile.role)) {
      return {
        success: false,
        error: "Bạn không có quyền thực hiện hành động này",
        status: 403,
      };
    }

    return {
      success: true,
      user: { id: userData.user.id, email: userData.user.email },
      role: profile.role,
      supabase,
    };
  };
}

function isUserRole(role: unknown): role is UserRole {
  return typeof role === "string" &&
    (USER_ROLES as readonly string[]).includes(role);
}

function timeoutFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}
