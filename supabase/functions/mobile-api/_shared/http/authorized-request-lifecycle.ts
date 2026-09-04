import {
  beginHarnessAuthorizedRequest,
  finishHarnessAuthorizedRequest,
  type HarnessTraceContext,
} from "../../../_shared/harness/trace.ts";
import { apiFailure } from "../platform/api-failure.ts";
import type { MobileApiContext } from "./contracts.ts";

export async function beginBatchedAuthorizedRequest(
  trace: HarnessTraceContext,
  ctx: MobileApiContext,
  routeKind: string,
): Promise<boolean> {
  const envelope = ctx.capabilityEnvelope;
  if (routeKind !== "kael.chat.confirm" || !trace.client?.rpc || !envelope) {
    return false;
  }
  const started = await beginHarnessAuthorizedRequest(trace, {
    actorRole: ctx.role,
    routeKind,
    capability: envelope.capability,
    risk: envelope.risk,
    operationClass: envelope.operationClass,
    privileged: envelope.privileged,
    confirmationGate: envelope.confirmationGate,
    resourceType: envelope.resource.type,
    resourceId: envelope.resource.id,
  });
  if (!started) {
    apiFailure(
      "PRIVILEGED_AUDIT_UNAVAILABLE",
      "Hệ thống đang bận, vui lòng thử lại",
      503,
    );
  }
  return true;
}

export async function finishBatchedAuthorizedRequest(
  trace: HarnessTraceContext,
  ctx: MobileApiContext,
  routeKind: string,
): Promise<void> {
  const envelope = ctx.capabilityEnvelope;
  if (!envelope) {
    apiFailure("PRIVILEGED_AUDIT_UNAVAILABLE", "Hệ thống đang bận, vui lòng thử lại", 503);
  }
  const completed = await finishHarnessAuthorizedRequest(trace, {
    actorRole: ctx.role,
    routeKind,
    capability: envelope.capability,
    privileged: envelope.privileged,
    resourceType: envelope.resource.type,
    resourceId: envelope.resource.id,
  });
  if (!completed) {
    apiFailure(
      "TRACE_FINALIZATION_UNAVAILABLE",
      "Yêu cầu đã được tiếp nhận và đang được đối soát. Vui lòng làm mới trạng thái.",
      503,
    );
  }
}
