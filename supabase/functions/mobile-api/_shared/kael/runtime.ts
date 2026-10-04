import type { MobileApiContext } from "../platform/auth.ts";
import type { EdgeAiSecrets, EdgeGuardClient } from "./index.ts";

export function aiRuntime(
  ctx: MobileApiContext,
  secrets: EdgeAiSecrets,
): EdgeAiSecrets {
  const trace = ctx.traceContext
    ? Object.freeze({
      ...ctx.traceContext,
      client: (ctx.privilegedSupabase ?? ctx.supabase) as EdgeGuardClient,
    })
    : undefined;
  return {
    ...secrets,
    ...(ctx.signal ? { requestSignal: ctx.signal } : {}),
    ...(secrets.durableGuardsEnabled
      ? { durableGuardClient: (ctx.privilegedSupabase ?? ctx.supabase) as EdgeGuardClient }
      : {}),
    ...(trace ? { harnessTrace: trace } : {}),
  };
}
