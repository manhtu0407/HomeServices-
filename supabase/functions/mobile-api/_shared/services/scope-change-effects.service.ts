// Durable direct scope-change effects. Database and learning effects are
// transactionally replayable; external Expo delivery uses a leased outbox row.

import {
  asRecord,
  asServiceType,
  asString,
  nullableNumber,
  nullableString,
} from "./coercions.ts";
import { dbQuery, type DbClient } from "./db.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { sendPushToUser } from "../push.ts";
import {
  buildKaelOptimizationMetricRows,
  readKaelOptimizationFlags,
} from "../kael/kael-usage/cost-tracking.ts";
import {
  planLearningSkillTriggers,
  type LearningSkillInput,
  type ScopeChangeKaelEstimate,
} from "../kael/index.ts";

type PricedScopeChangeEstimate = Extract<
  ScopeChangeKaelEstimate,
  { fallback_used: false }
>;

type DirectScopeEffectName = "database" | "learning" | "push";

type DirectScopeEffectState = {
  effectId: string;
  state: "pending" | "in_flight" | "completed";
};

export type DirectScopeEffectStates = Record<
  DirectScopeEffectName,
  DirectScopeEffectState
>;

export function buildScopeChangeLearningInput(
  ctx: MobileApiContext,
  job: Record<string, unknown>,
  jobId: string,
  evidencePhotoRefs: string[],
  estimate: PricedScopeChangeEstimate,
  originalPriceMax: number,
  challengeRequired: boolean,
): LearningSkillInput {
  return {
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    job_id: jobId,
    customer_id: nullableString(job.customer_id) ?? undefined,
    worker_id: ctx.user.id,
    service_type: asServiceType(job.service_type),
    problem_slug: nullableString(job.kael_problem_identified) ?? undefined,
    district_code: nullableString(job.address_district) ?? undefined,
    complexity: estimate.complexity_assessment,
    baseline_min: nullableNumber(job.kael_price_min) ?? undefined,
    baseline_max: originalPriceMax,
    scope_change_requested: true,
    worker_report: {
      has_photos: evidencePhotoRefs.length > 0,
      reported_complexity: estimate.complexity_assessment,
      challenge_required: challengeRequired,
    },
  };
}

export function buildDirectScopeEffectPayloads(
  jobId: string,
  estimate: PricedScopeChangeEstimate,
  learningInput: LearningSkillInput,
) {
  const databaseEffectId = crypto.randomUUID();
  const apiLogs = buildDurableScopeApiLogs(jobId, estimate, databaseEffectId);
  return {
    database: {
      effectId: databaseEffectId,
      payload: {
        api_logs: apiLogs,
        optimization_metrics: buildKaelOptimizationMetricRows(apiLogs),
      },
    },
    learning: {
      effectId: crypto.randomUUID(),
      payload: buildDurableScopeLearningPayload(learningInput),
    },
    push: { effectId: crypto.randomUUID() },
  };
}

function buildDurableScopeApiLogs(
  jobId: string,
  estimate: ScopeChangeKaelEstimate,
  effectId: string,
): Array<Record<string, unknown>> {
  const traceRows = (estimate.trace ?? [])
    .filter((trace) =>
      trace.purpose === "scope_change" &&
      trace.provider !== null &&
      trace.model !== null
    )
    .map((trace, index) => ({
      job_id: jobId,
      request_id: `scope-effect:${effectId}:${index}`,
      purpose: "scope_change",
      provider: trace.provider,
      model: trace.model,
      input_tokens: null,
      output_tokens: null,
      cost_usd: trace.cost_usd,
      latency_ms: trace.latency_ms ?? 0,
      success: trace.validation.status === "pass",
      error_code: trace.validation.reason_code ?? null,
      prompt_version: null,
      fallback_used: false,
      safe_metadata: trace.safe_metadata,
    }));
  if (traceRows.length > 0) return traceRows;
  if (!estimate.provider || !estimate.model) return [];
  return [{
    job_id: jobId,
    request_id: `scope-effect:${effectId}:0`,
    purpose: "scope_change",
    provider: estimate.provider,
    model: estimate.model,
    input_tokens: null,
    output_tokens: null,
    cost_usd: estimate.cost_usd,
    latency_ms: estimate.latency_ms ?? 0,
    success: !estimate.fallback_used,
    error_code: estimate.failure_reason ?? null,
    prompt_version: null,
    fallback_used: estimate.fallback_used,
    safe_metadata: {},
  }];
}

function buildDurableScopeLearningPayload(input: LearningSkillInput) {
  const planned = planLearningSkillTriggers("post-B6", input);
  const item = planned[0];
  if (!item) return { destination: "none" };
  return {
    destination: readKaelOptimizationFlags().KAEL_OPT_BATCH_LEARNING_ENABLED
      ? "batch"
      : "lifecycle",
    input_payload: input,
    candidate_payload: item.candidate,
    queue_state: item.queue_state,
    audit: item.audit ? { reason: item.audit.reason } : null,
  };
}

export function parseDirectScopeEffectStates(
  value: unknown,
): DirectScopeEffectStates {
  const record = asRecord(value);
  const parsed = {} as Partial<DirectScopeEffectStates>;
  for (const name of ["database", "learning", "push"] as const) {
    const row = asRecord(record[name]);
    const effectId = nullableString(row.effect_id);
    const state = nullableString(row.state);
    if (!effectId || !state || !["pending", "in_flight", "completed"].includes(state)) {
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
    if (!result.error && row?.ok === true && row.completed === true) return true;
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
  const body = "Thợ vừa gửi thay đổi phạm vi. Phần thay đổi đang tạm dừng đến khi bạn xác nhận hoặc giữ phạm vi cũ.";
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
        deep_link: `/(customer)/history?scope_change=${scopeChangeId}&job_id=${jobId}`,
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
    console.warn("mobile-api scope-change push acknowledgement pending", { jobId });
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
