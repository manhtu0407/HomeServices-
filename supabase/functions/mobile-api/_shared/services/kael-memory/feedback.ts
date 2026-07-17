// Edge service Kael feedback/consent domain (C4 6a, services/* split): customer + worker Kael
// feedback submission and worker training-consent get/set. Simple owner-scoped DB writes, no workflow
// coupling. Imported by services.ts for wiring.

import { nullableString } from "../_runtime/coercions.ts";
import { db, dbQuery } from "../_runtime/db.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import { scrubSensitiveForLLM } from "../../kael/index.ts";
import { sanitizeForLLM, type CustomerKaelFeedbackInput, type WorkerKaelFeedbackInput, type WorkerKaelTrainingConsentInput } from "../../../../_shared/domain.ts";

export async function submitWorkerKaelFeedback(
  ctx: MobileApiContext,
  input: WorkerKaelFeedbackInput,
) {
  const client = db(ctx);
  const rawMessage = sanitizeForLLM(input.message).slice(0, 1200);
  const scrubbedMessage = scrubSensitiveForLLM(rawMessage).slice(0, 1200);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_kael_feedback")
      .insert({
        worker_id: ctx.user.id,
        source: input.source,
        language: input.language,
        raw_message: rawMessage,
        scrubbed_message: scrubbedMessage || "[scrubbed]",
        status: "new",
        safe_metadata: {
          kael_feedback_version: "worker.v1",
        },
      })
      .select("id, created_at")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 l\u01b0u ph\u1ea3n h\u1ed3i Kael", 500);
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
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 t\u1ea3i tu\u1ef3 ch\u1ecdn Kael", 500);
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
    apiFailure("DB_ERROR", "Kh\u00f4ng th\u1ec3 l\u01b0u tu\u1ef3 ch\u1ecdn Kael", 500);
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
  const client = db(ctx);
  const message = input.message.trim();
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("customer_kael_feedback")
      .insert({
        customer_id: ctx.user.id,
        language: input.language,
        message,
        message_scrubbed: scrubSensitiveForLLM(message),
        safe_metadata: {
          kael_feedback_version: "v1",
          submitted_from: "customer_profile",
        },
        source: input.source,
        status: "new",
      })
      .select("id, status, created_at")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể gửi góp ý cho Kael", 500);
  }
  if (!result.data) {
    apiFailure("DB_ERROR", "Không thể gửi góp ý cho Kael", 500);
  }

  return {
    feedback_id: requiredFeedbackString(result.data.id),
    status: "new" as const,
    created_at: requiredFeedbackString(result.data.created_at),
  };
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
