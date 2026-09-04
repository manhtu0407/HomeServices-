import {
  recordHarnessEvent,
  type HarnessTraceContext,
} from "../../../_shared/harness/trace.ts";

export async function delegateDomainIdempotency(
  routeKind: string,
  trace: HarnessTraceContext,
): Promise<boolean> {
  if (routeKind !== "kael.chat.create" && routeKind !== "kael.chat.confirm") {
    return false;
  }
  if (routeKind === "kael.chat.confirm") return true;
  await recordHarnessEvent(trace, {
    eventClass: "idempotency.delegated",
    stage: routeKind,
    status: "succeeded",
    safeMetadata: { strategy: "domain_response_replay" },
  });
  return true;
}
