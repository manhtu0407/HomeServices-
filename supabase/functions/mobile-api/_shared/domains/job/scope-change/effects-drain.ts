import { asRecord, asString, nullableString } from "../../../platform/coercions.ts";
import { type DbClient, dbQuery } from "../../../platform/db.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import { sendPushToUser } from "../../../platform/push.ts";
import type { DirectScopeEffectState, DirectScopeEffectStates } from "./effects-contracts.ts";

export function parseDirectScopeEffectStates(
  value: unknown,
): DirectScopeEffectStates {
  const record = asRecord(value);
  const parsed = {} as Partial<DirectScopeEffectStates>;
  for (const name of ["database", "learning", "push"] as const) {
    const row = asRecord(record[name]);
    const effectId = nullableString(row.effect_id);
    const state = nullableString(row.state);
    if (
      !effectId || !state ||
      !["pending", "in_flight", "completed"].includes(state)
    ) {
      apiFailure(
        "DB_ERROR",
        "Không thể khôi phục trạng thái hoàn tất của yêu cầu thay đổi",
        500,
      );
    }
    parsed[name] = {
      effectId,
      state: state as DirectScopeEffectState["state"],
    };
  }
  return parsed as DirectScopeEffectStates;
}

export async function drainDirectScopeChangeEffects(
  client: DbClient,
  ctx: MobileApiContext,
  job: Record<string, unknown>,
  clientRequestId: string | undefined,
  scopeChangeId: string,
  effects: DirectScopeEffectStates,
) {
  if (!clientRequestId) return;
  const jobId = asString(job.id);
  const common = {
    p_job_id: jobId,
    p_worker_id: ctx.user.id,
    p_client_request_id: clientRequestId,
    p_scope_change_id: scopeChangeId,
  };

  const databaseReady = effects.database.state === "completed" ||
    await applyDirectScopeEffect(
      client,
      "apply_scope_change_database_effect_atomic",
      { ...common, p_effect_id: effects.database.effectId },
      jobId,
    );

  if (effects.learning.state !== "completed") {
    await applyDirectScopeEffect(
      client,
      "apply_scope_change_learning_effect_atomic",
      { ...common, p_effect_id: effects.learning.effectId },
      jobId,
    );
  }

  if (databaseReady && effects.push.state !== "completed") {
    await drainDirectScopePushEffect(
      client,
      common,
      effects.push.effectId,
      jobId,
      scopeChangeId,
    );
  }
}

async function applyDirectScopeEffect(
  client: DbClient,
  rpcName: string,
  args: Record<string, unknown>,
  jobId: string,
) {
  try {
    const result = await dbQuery<Array<Record<string, unknown>>>(
      client.rpc(rpcName, args),
    );
    const row = result.data?.[0];
    if (!result.error && row?.ok === true && row.completed === true) {
      return true;
    }
  } catch {
    // A later replay will retry the durable effect.
  }
  console.warn("mobile-api scope-change durable effect pending", {
    jobId,
    effect: rpcName,
  });
  return false;
}

async function drainDirectScopePushEffect(
  client: DbClient,
  common: Record<string, unknown>,
  effectId: string,
  jobId: string,
  scopeChangeId: string,
) {
  const pushClaimId = crypto.randomUUID();
  let claim: Record<string, unknown> | undefined;
  try {
    const result = await dbQuery<Array<Record<string, unknown>>>(
      client.rpc("claim_scope_change_push_effect_atomic", {
        ...common,
        p_effect_id: effectId,
        p_claim_id: pushClaimId,
      }),
    );
    claim = result.error ? undefined : result.data?.[0];
  } catch {
    claim = undefined;
  }
  if (!claim || claim.completed === true || claim.claimed !== true) return;
  const customerId = nullableString(claim.customer_id);
  if (!customerId || nullableString(claim.effect_id) !== effectId) {
    await releaseDirectScopePushEffect(
      client,
      common,
      effectId,
      pushClaimId,
      "PUSH_CLAIM_INVALID",
    );
    return;
  }

  const title = "Cần duyệt thay đổi phạm vi";
  const body =
    "Thợ vừa gửi thay đổi phạm vi. Phần thay đổi đang tạm dừng đến khi bạn xác nhận hoặc giữ phạm vi cũ.";
  let pushFailed = true;
  try {
    const push = await sendPushToUser(client, customerId, {
      title,
      body,
      data: {
        event_type: "scope_change_requested",
        job_id: jobId,
        scope_change_id: scopeChangeId,
        scope_effect_id: effectId,
        deep_link:
          `/(customer)/history?scope_change=${scopeChangeId}&job_id=${jobId}`,
      },
      sound: "default",
    });
    pushFailed = push.failed > 0;
  } catch {
    pushFailed = true;
  }

  if (pushFailed) {
    await releaseDirectScopePushEffect(
      client,
      common,
      effectId,
      pushClaimId,
      "PUSH_DELIVERY_FAILED",
    );
    return;
  }

  // Expo cannot atomically commit with Postgres. The lease prevents concurrent
  // sends and scope_effect_id lets clients dedupe, but crash-after-accept is
  // intentionally documented as at-least-once rather than fake exactly-once.
  try {
    await dbQuery<Array<Record<string, unknown>>>(
      client.rpc("complete_scope_change_push_effect_atomic", {
        ...common,
        p_effect_id: effectId,
        p_claim_id: pushClaimId,
      }),
    );
  } catch {
    console.warn("mobile-api scope-change push acknowledgement pending", {
      jobId,
    });
  }
}

async function releaseDirectScopePushEffect(
  client: DbClient,
  common: Record<string, unknown>,
  effectId: string,
  claimId: string,
  errorCode: string,
) {
  try {
    await dbQuery<Array<Record<string, unknown>>>(
      client.rpc("release_scope_change_push_effect_atomic", {
        ...common,
        p_effect_id: effectId,
        p_claim_id: claimId,
        p_error_code: errorCode,
      }),
    );
  } catch {
    console.warn("mobile-api scope-change push release pending", {
      jobId: common.p_job_id,
    });
  }
}
