import type { UserRole } from "../../../../_shared/domain.ts";

export type AccountState = "active" | "deletion_processing" | "deleted";

export type ActorContext = Readonly<{
  actorId: string;
  role: UserRole;
  accountState: AccountState;
  subjectType: "customer" | "worker" | "admin";
  authenticated: true;
  authenticatedAt: string;
  environment: string;
  releaseId: string;
}>;

export function createActorContext(input: {
  readonly userId: string;
  readonly role: UserRole;
  readonly accountState?: unknown;
  readonly authenticatedAt?: string;
  readonly environment?: string;
  readonly releaseId?: string;
}): ActorContext {
  const authenticatedAt = input.authenticatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(authenticatedAt))) {
    throw new Error("ActorContext authenticatedAt is invalid.");
  }
  return Object.freeze({
    actorId: input.userId,
    role: input.role,
    accountState: normalizeAccountState(input.accountState),
    subjectType: input.role,
    authenticated: true as const,
    authenticatedAt,
    environment: input.environment?.trim() || "local",
    releaseId: input.releaseId?.trim() || "unreleased",
  });
}

function normalizeAccountState(value: unknown): AccountState {
  return value === "deletion_processing" || value === "deleted"
    ? value
    : "active";
}