import {
  recordHarnessEvent,
  type HarnessTraceContext,
} from "../../../_shared/harness/trace.ts";

export async function delegateDomainIdempotency(
  routeKind: string,
  trace: HarnessTraceContext,
): Promise<boolean> {
  if (routeKind !== "kael.chat.create") return false;
  await recordHarnessEvent(trace, {
    eventClass: "idempotency.delegated",
    stage: routeKind,
    status: "succeeded",
    safeMetadata: { strategy: "domain_response_replay" },
  });
  return true;
}
