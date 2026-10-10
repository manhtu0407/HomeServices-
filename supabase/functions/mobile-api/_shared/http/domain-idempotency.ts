import {
  recordHarnessEvent,
  type HarnessTraceContext,
} from "../../../_shared/harness/trace.ts";

export type DomainIdempotencyStrategy =
  | "domain_response_replay"
  | "matching_retry_command_id";

export function domainIdempotencyStrategy(
  routeKind: string,
): DomainIdempotencyStrategy | null {
  if (routeKind === "kael.chat.create" || routeKind === "kael.chat.confirm") {
    return "domain_response_replay";
  }
  if (routeKind === "jobs.confirmSearch") return "matching_retry_command_id";
  return null;
}

export async function delegateDomainIdempotency(
  routeKind: string,
  trace: HarnessTraceContext,
): Promise<boolean> {
  const strategy = domainIdempotencyStrategy(routeKind);
  if (!strategy) return false;
  if (routeKind === "kael.chat.confirm") return true;
  await recordHarnessEvent(trace, {
    eventClass: "idempotency.delegated",
    stage: routeKind,
    status: "succeeded",
    safeMetadata: { strategy },
  });
  return true;
}
