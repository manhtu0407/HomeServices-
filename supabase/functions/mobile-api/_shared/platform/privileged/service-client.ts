import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "../../../../_shared/domain.ts";
import type { HarnessEnvironmentDescriptor } from "../../../../_shared/harness/environment.ts";
import { fetchBufferedWithTimeout } from "../../../../_shared/network.ts";
import {
  JOB_MEDIA_STORAGE_TIMEOUT_MS,
  MAX_JOB_MEDIA_BYTES,
} from "../../../../_shared/job-media-contract.ts";

export type PrivilegedClientReason =
  | "actor_authentication"
  | "workflow_service"
  | "background_monitor"
  | "provider_webhook"
  | "retention_worker";

export type PrivilegedClientContext = {
  readonly reason: PrivilegedClientReason;
  readonly environment: HarnessEnvironmentDescriptor["name"] | "unknown";
  readonly projectRef: string | null;
  readonly releaseId: string;
  readonly actorId: string | null;
  readonly actorRole: UserRole | "system" | null;
};

const contexts = new WeakMap<object, PrivilegedClientContext>();

export type SupabaseClientFactory = typeof createClient;

export const createPrivilegedSupabaseClient: SupabaseClientFactory = createClient;

export function createUserScopedSupabaseClient(input: {
  readonly url: string;
  readonly publicKey: string;
  readonly accessToken: string;
  readonly createClient?: SupabaseClientFactory;
}) {
  const factory = input.createClient ?? createClient;
  return factory(input.url, input.publicKey, {
    global: {
      fetch: timeoutFetch,
      headers: { Authorization: `Bearer ${input.accessToken}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function bindPrivilegedClientContext(
  client: unknown,
  context: PrivilegedClientContext,
): void {
  if (!client || typeof client !== "object") return;
  contexts.set(client, Object.freeze({ ...context }));
}

export function privilegedClientContext(
  client: unknown,
): PrivilegedClientContext | null {
  return client && typeof client === "object"
    ? contexts.get(client) ?? null
    : null;
}

export function safePrivilegedClientMetadata(
  client: unknown,
): Record<string, unknown> {
  const context = privilegedClientContext(client);
  return context
    ? {
      privileged_reason: context.reason,
      environment: context.environment,
      project_ref: context.projectRef,
      release_id: context.releaseId,
      actor_role: context.actorRole,
    }
    : {
      privileged_reason: "unbound",
      environment: "unknown",
      project_ref: null,
      release_id: "unreleased",
      actor_role: null,
    };
}

function timeoutFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetchBufferedWithTimeout(input, init, {
    maxResponseBytes: MAX_JOB_MEDIA_BYTES,
    timeoutMs: JOB_MEDIA_STORAGE_TIMEOUT_MS,
    validateJsonResponses: true,
  });
}