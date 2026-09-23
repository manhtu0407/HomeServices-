// Edge service Kael feedback/consent domain (C4 6a, services/* split): customer + worker Kael
// feedback submission and worker training-consent get/set. Simple owner-scoped DB writes, no workflow
// coupling. Imported by services.ts for wiring.

import { nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, workflowDb } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { scrubSensitiveForLLM } from "../../kael/index.ts";
import {
  sanitizeForLLM,
  type CustomerKaelFeedbackInput,
  type WorkerKaelFeedbackInput,
  type WorkerKaelTrainingConsentInput,
} from "../../../../_shared/domain.ts";

export async function submitWorkerKaelFeedback(
  ctx: MobileApiContext,
  input: WorkerKaelFeedbackInput,
) {
  const structured = Boolean(input.response_id && input.rating);
  const rawMessage = input.message
    ? sanitizeForLLM(input.message).slice(0, 1200)
    : feedbackRatingMessage(input.rating, input.language);
  const payload = {
    worker_id: ctx.user.id,
    source: input.source,
    language: input.language,
    raw_message: rawMessage,
    scrubbed_message: scrubSensitiveForLLM(rawMessage).slice(0, 1200) || "[scrubbed]",
    response_id: input.response_id ?? null,
    rating: input.rating ?? null,
    reason_scrubbed: input.reason
      ? scrubSensitiveForLLM(input.reason).slice(0, 500) || "[scrubbed]"
      : null,
    status: "new",
    safe_metadata: {
      kael_feedback_version: structured ? "worker.v2" : "worker.v1",
      structured,
    },
  };
  const query = structured
    ? db(ctx).from("worker_kael_feedback").upsert(payload, {
      onConflict: "worker_id,response_id",
    })
    : db(ctx).from("worker_kael_feedback").insert(payload);
  const result = await dbQuery<Record<string, unknown>>(
    query.select("id,created_at").single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể lưu phản hồi Kael", 500);
  }
  return {
    feedback_id: requiredFeedbackString(result.data.id),
    status: "new" as const,
    created_at: requiredFeedbackString(result.data.created_at),
  };
}

export async function getWorkerKaelTrainingConsent(ctx: MobileApiContext) {
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("worker_kael_training_consent")
      .select("worker_id, training_consent, updated_at")
      .eq("worker_id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải tuỳ chọn Kael", 500);
  }
  if (result.data && requiredFeedbackString(result.data.worker_id) !== ctx.user.id) {
    apiFailure("DB_ERROR", "Dữ liệu tuỳ chọn Kael không hợp lệ", 500);
  }
  return {
    worker_id: ctx.user.id,
    training_consent: result.data
      ? requiredFeedbackBoolean(result.data.training_consent)
      : false,
    updated_at: result.data ? nullableString(result.data.updated_at) : null,
  };
}

export async function setWorkerKaelTrainingConsent(
  ctx: MobileApiContext,
  input: WorkerKaelTrainingConsentInput,
) {
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("worker_kael_training_consent")
      .upsert({
        worker_id: ctx.user.id,
        training_consent: input.training_consent,
        source: input.source,
        language: input.language,
        safe_metadata: {
          kael_training_consent_version: "worker.v1",
        },
      })
      .select("worker_id, training_consent, updated_at")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể lưu tuỳ chọn Kael", 500);
  }
  const workerId = requiredFeedbackString(result.data.worker_id);
  if (workerId !== ctx.user.id) {
    apiFailure("DB_ERROR", "Dữ liệu tuỳ chọn Kael không hợp lệ", 500);
  }
  return {
    worker_id: workerId,
    training_consent: requiredFeedbackBoolean(result.data.training_consent),
    updated_at: nullableString(result.data.updated_at),
  };
}

export async function submitCustomerKaelFeedback(
  ctx: MobileApiContext,
  input: CustomerKaelFeedbackInput,
) {
  const structured = Boolean(input.response_id && input.rating);
  const message = input.message?.trim() || feedbackRatingMessage(input.rating, input.language);
  const payload = {
    customer_id: ctx.user.id,
    language: input.language,
    message,
    message_scrubbed: scrubSensitiveForLLM(message).slice(0, 1200) || "[scrubbed]",
    response_id: input.response_id ?? null,
    rating: input.rating ?? null,
    reason_scrubbed: input.reason
      ? scrubSensitiveForLLM(input.reason).slice(0, 500) || "[scrubbed]"
      : null,
    safe_metadata: {
      kael_feedback_version: structured ? "customer.v2" : "customer.v1",
      submitted_from: input.source,
      structured,
    },
    source: input.source,
    status: "new",
  };
  // authenticated has no INSERT on customer_kael_feedback; the row is keyed to ctx.user.id.
  const feedback = workflowDb(ctx).from("customer_kael_feedback");
  const query = structured
    ? feedback.upsert(payload, { onConflict: "customer_id,response_id" })
    : feedback.insert(payload);
  const result = await dbQuery<Record<string, unknown>>(
    query.select("id,created_at").single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể gửi góp ý cho Kael", 500);
  }
  return {
    feedback_id: requiredFeedbackString(result.data.id),
    status: "new" as const,
    created_at: requiredFeedbackString(result.data.created_at),
  };
}

function feedbackRatingMessage(
  rating: "useful" | "not_useful" | undefined,
  language: "vi" | "en",
): string {
  if (language === "en") {
    return rating === "useful"
      ? "Kael response marked useful."
      : "Kael response marked not useful.";
  }
  return rating === "useful"
    ? "Phản hồi Kael được đánh dấu hữu ích."
    : "Phản hồi Kael được đánh dấu chưa hữu ích.";
}

function requiredFeedbackString(value: unknown): string {
  const parsed = nullableString(value);
  if (!parsed?.trim()) {
    apiFailure("DB_ERROR", "Dữ liệu phản hồi Kael không hợp lệ", 500);
  }
  return parsed;
}

function requiredFeedbackBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    apiFailure("DB_ERROR", "Dữ liệu tuỳ chọn Kael không hợp lệ", 500);
  }
  return value;
}
