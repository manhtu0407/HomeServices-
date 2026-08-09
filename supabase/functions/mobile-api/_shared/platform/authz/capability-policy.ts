import type { UserRole } from "../../../../_shared/domain.ts";
import type { HarnessOperationClass } from "../../../../_shared/harness/reliability-registry.ts";
import type { ActorContext } from "./actor-context.ts";
import {
  CAPABILITY_POLICIES,
  type RegisteredRouteKind,
} from "./capability-registry.ts";

export type CapabilityRisk =
  | "read"
  | "write"
  | "sensitive"
  | "money"
  | "administrative";

export type MobileCapability = `mobile.route.${string}`;

export type CapabilityPolicy = Readonly<{
  capability: MobileCapability;
  risk: CapabilityRisk;
  operationClass: HarnessOperationClass;
  privileged: boolean;
  allowedMethods: readonly string[];
  requiresResourceCheck: boolean;
  resourceType: CapabilityResource["type"];
  confirmationGate: "none" | "offer" | "proposed_worker" | "scope_change" |
    "completion" | "payment";
  envelopeTtlMs: number;
  allowedRoles: readonly UserRole[];
}>;

export type CapabilityResource = Readonly<{
  type: "self" | "job" | "session" | "conversation" | "candidate" |
    "scope_change" | "dispute" | "notification" | "catalog" | "system";
  id: string | null;
}>;

export type CapabilityEnvelope = Readonly<{
  envelopeId: string;
  actor: ActorContext;
  routeKind: RegisteredRouteKind;
  method: string;
  capability: MobileCapability;
  risk: CapabilityRisk;
  operationClass: HarnessOperationClass;
  privileged: boolean;
  requiresResourceCheck: boolean;
  confirmationGate: CapabilityPolicy["confirmationGate"];
  resource: CapabilityResource;
  environment: string;
  releaseId: string;
  issuedAt: string;
  expiresAt: string;
}>;

export type AuthorizedRoute = {
  readonly kind: string;
  readonly method?: string;
  readonly roles?: readonly UserRole[];
  readonly [key: string]: unknown;
};

export class CapabilityAuthorizationError extends Error {
  readonly code: "CAPABILITY_UNDECLARED" | "CAPABILITY_FORBIDDEN" |
    "CAPABILITY_METHOD_FORBIDDEN" |
    "CAPABILITY_STALE" | "CAPABILITY_SCOPE_MISMATCH" | "ACCOUNT_NOT_ACTIVE";
  readonly status = 403;

  constructor(
    code: CapabilityAuthorizationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "CapabilityAuthorizationError";
    this.code = code;
  }
}

export function authorizeRouteCapability(
  actor: ActorContext,
  route: AuthorizedRoute,
  now = Date.now(),
): CapabilityEnvelope {
  const policy = capabilityPolicyForRoute(route);
  if (!policy) {
    throw new CapabilityAuthorizationError(
      "CAPABILITY_UNDECLARED",
      `No capability policy is registered for route ${route.kind}.`,
    );
  }
  if (actor.accountState !== "active" && route.kind !== "me.accountDeletion") {
    throw new CapabilityAuthorizationError(
      "ACCOUNT_NOT_ACTIVE",
      "The actor account is not active for this capability.",
    );
  }
  if (!policy.allowedRoles.includes(actor.role)) {
    throw new CapabilityAuthorizationError(
      "CAPABILITY_FORBIDDEN",
      `Role ${actor.role} cannot use ${policy.capability}.`,
    );
  }
  const method = route.method?.trim().toUpperCase();
  if (!method || !policy.allowedMethods.includes(method)) {
    throw new CapabilityAuthorizationError(
      "CAPABILITY_METHOD_FORBIDDEN",
      `Method ${method || "(missing)"} is not registered for ${policy.capability}.`,
    );
  }
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + policy.envelopeTtlMs).toISOString();
  const resource = Object.freeze(resourceForRoute(route, policy.resourceType));

  return Object.freeze({
    envelopeId: crypto.randomUUID(),
    actor,
    routeKind: route.kind as RegisteredRouteKind,
    method,
    capability: policy.capability,
    risk: policy.risk,
    operationClass: policy.operationClass,
    privileged: policy.privileged,
    requiresResourceCheck: policy.requiresResourceCheck,
    confirmationGate: policy.confirmationGate,
    resource,
    environment: actor.environment,
    releaseId: actor.releaseId,
    issuedAt,
    expiresAt,
  });
}

export function capabilityPolicyForRoute(
  route: AuthorizedRoute,
): CapabilityPolicy | null {
  const raw = CAPABILITY_POLICIES[route.kind as RegisteredRouteKind];
  if (!raw || raw.public || !raw.capability) return null;
  return Object.freeze({
    capability: raw.capability as MobileCapability,
    risk: raw.risk as CapabilityRisk,
    operationClass: raw.operationClass as HarnessOperationClass,
    privileged: raw.privileged,
    allowedMethods: Object.freeze([...raw.methods]),
    requiresResourceCheck: raw.requiresResourceCheck,
    resourceType: raw.resourceType as CapabilityResource["type"],
    confirmationGate: raw.confirmationGate as CapabilityPolicy["confirmationGate"],
    envelopeTtlMs: raw.envelopeTtlMs,
    allowedRoles: Object.freeze([...raw.roles] as UserRole[]),
  });
}

export function assertCapabilityEnvelope(
  envelope: CapabilityEnvelope,
  input: {
    readonly actor: ActorContext;
    readonly route?: AuthorizedRoute;
    readonly expectedCapability?: MobileCapability;
    readonly now?: number;
  },
): CapabilityEnvelope {
  const now = input.now ?? Date.now();
  if (Date.parse(envelope.issuedAt) > now + 5_000 || Date.parse(envelope.expiresAt) <= now) {
    throw new CapabilityAuthorizationError(
      "CAPABILITY_STALE",
      "The capability envelope is stale or has invalid time bounds.",
    );
  }
  if (
    envelope.actor.actorId !== input.actor.actorId ||
    envelope.actor.role !== input.actor.role ||
    envelope.environment !== input.actor.environment ||
    envelope.releaseId !== input.actor.releaseId
  ) {
    throw new CapabilityAuthorizationError(
      "CAPABILITY_SCOPE_MISMATCH",
      "The capability envelope does not belong to this actor, environment, or release.",
    );
  }
  if (input.expectedCapability && envelope.capability !== input.expectedCapability) {
    throw new CapabilityAuthorizationError(
      "CAPABILITY_FORBIDDEN",
      `Required capability ${input.expectedCapability} was not issued.`,
    );
  }
  if (input.route) {
    const expected = capabilityPolicyForRoute(input.route);
    const resource = expected ? resourceForRoute(input.route, expected.resourceType) : null;
    const method = input.route.method?.trim().toUpperCase();
    if (
      !expected || envelope.routeKind !== input.route.kind ||
      envelope.method !== method || envelope.capability !== expected.capability ||
      resource?.type !== envelope.resource.type || resource?.id !== envelope.resource.id
    ) {
      throw new CapabilityAuthorizationError(
        "CAPABILITY_SCOPE_MISMATCH",
        "The capability envelope does not match the requested route or resource.",
      );
    }
  }
  return envelope;
}

export function requireCapability(
  context: {
    readonly actorContext?: ActorContext;
    readonly capabilityEnvelope?: CapabilityEnvelope;
  },
  expected: MobileCapability,
): CapabilityEnvelope {
  const envelope = context.capabilityEnvelope;
  const actor = context.actorContext;
  if (!envelope || !actor) {
    throw new CapabilityAuthorizationError(
      "CAPABILITY_FORBIDDEN",
      `Required capability ${expected} was not issued for this operation.`,
    );
  }
  return assertCapabilityEnvelope(envelope, {
    actor,
    expectedCapability: expected,
  });
}

export function safeCapabilityMetadata(
  envelope: CapabilityEnvelope,
): Record<string, unknown> {
  return {
    envelope_id: envelope.envelopeId,
    route_kind: envelope.routeKind,
    capability: envelope.capability,
    risk: envelope.risk,
    operation_class: envelope.operationClass,
    privileged: envelope.privileged,
    resource_type: envelope.resource.type,
    resource_id: envelope.resource.id,
    actor_role: envelope.actor.role,
    environment: envelope.environment,
    release_id: envelope.releaseId,
    confirmation_gate: envelope.confirmationGate,
    expires_at: envelope.expiresAt,
  };
}

function resourceForRoute(
  route: AuthorizedRoute,
  expectedType: CapabilityResource["type"],
): CapabilityResource {
  const keys: Record<CapabilityResource["type"], string[]> = {
    job: ["jobId"],
    session: ["sessionId"],
    conversation: ["conversationId"],
    candidate: ["candidateId"],
    scope_change: ["scopeChangeId"],
    dispute: ["disputeId"],
    notification: ["notificationId"],
    self: [],
    catalog: [],
    system: [],
  };
  for (const key of keys[expectedType]) {
    const value = route[key];
    if (typeof value === "string" && value) return { type: expectedType, id: value };
  }
  return { type: expectedType, id: null };
}
