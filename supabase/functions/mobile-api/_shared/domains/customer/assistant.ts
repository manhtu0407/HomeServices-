import { requireJobAccess } from "../../platform/access.ts";
import { takeDurableKaelChatRateLimit } from "../../kael/kael-guardrails/durable-guards.ts";
import {
  buildKaelL2L3MemorySummary,
  runCustomerAssistant,
  type EdgeAiSecrets,
  type KaelReasoningReporter,
  type KaelResponseReporter,
} from "../../kael/index.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { AI_SESSION_LIMIT, checkRateLimit } from "../../platform/rate-limit.ts";
import type { JobStatus, KaelAssistantInput } from "../../../../_shared/domain.ts";
import { asString, nullableString } from "../../platform/coercions.ts";
import { db } from "../../platform/db.ts";

const CUSTOMER_CASE_ACTIVE_STATUSES: readonly JobStatus[] = [
  "awaiting_customer_confirm",
  "broadcasting",
  "worker_candidate_pending",
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
  "confirmed_by_customer",
  "payment_pending",
  "paid",
];

const CUSTOMER_ASSISTANT_JOB_SELECT =
  "id, status, customer_id, worker_id, service_type, description, address_district, kael_problem_identified, kael_complexity, kael_advisory, payment_status";

export async function answerKaelAssistant(
  ctx: MobileApiContext,
  input: KaelAssistantInput,
  secrets: EdgeAiSecrets,
  options: {
    reasoning?: KaelReasoningReporter;
    response?: KaelResponseReporter;
  } = {},
) {
  const client = db(ctx);
  if (input.surface === "customer_case" && !input.job_id) {
    apiFailure(
      "VALIDATION",
      input.language === "en" ? "Invalid request data" : "Dữ liệu không hợp lệ",
      400,
    );
  }

  const job = input.job_id
    ? await requireJobAccess(client, input.job_id, ctx, {
      requiredRole: "customer",
      ...(input.surface === "customer_case"
        ? { statuses: CUSTOMER_CASE_ACTIVE_STATUSES }
        : {}),
      select: CUSTOMER_ASSISTANT_JOB_SELECT,
    })
    : null;

  const rate = secrets.durableGuardsEnabled
    ? await takeDurableKaelChatRateLimit(
      secrets.durableGuardClient,
      `customer_assistant:${ctx.user.id}`,
    )
    : checkRateLimit(
      `kael_customer_assistant:${ctx.user.id}`,
      AI_SESSION_LIMIT,
    );
  if (!rate.allowed) {
    apiFailure(
      "RATE_LIMITED",
      input.language === "en" ? "Please try again later" : "Vui lòng thử lại sau",
      429,
    );
  }

  const memorySummary = await buildKaelL2L3MemorySummary(client, {
    customerId: ctx.user.id,
    jobId: input.job_id ?? null,
    includeCustomer: true,
    maxTotalTokens: 1000,
  });
  const answer = await runCustomerAssistant({
    actorId: ctx.user.id,
    client,
    job: job
      ? {
        id: asString(job.id),
        status: nullableString(job.status),
        service_type: nullableString(job.service_type),
        description: nullableString(job.description),
        address_district: nullableString(job.address_district),
        kael_problem_identified: nullableString(job.kael_problem_identified),
        kael_complexity: nullableString(job.kael_complexity),
        kael_advisory: nullableString(job.kael_advisory),
        payment_status: nullableString(job.payment_status),
      }
      : null,
    serviceType: input.service_type ?? null,
    language: input.language,
    memorySummary,
    message: input.message,
    reasoning: options.reasoning,
    response: options.response,
    secrets,
    surface: input.surface,
  });
  return {
    answer: answer.answer,
    safety_notes: answer.safety_notes,
    citations: answer.citations,
    suggested_actions: answer.suggested_actions,
    boundary: answer.boundary,
    fallback_used: answer.fallback_used,
    public_reasoning_summary: answer.public_reasoning_summary,
  };
}
