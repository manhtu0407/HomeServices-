// Edge service kael-memory domain (C4 6a, services/* split): the user's own Kael memory CRUD
// (read/edit/delete; customer L3 + worker L4) with memory-audit logging. Imported by services.ts.

import { db, dbQuery } from "./db.ts";
import { logMemoryAudit } from "./audit.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import type { UpdateKaelMemoryInput } from "../../../_shared/domain.ts";
import { sanitizeMemoryObject, scrubSensitiveForLLM } from "../kael/index.ts";

export async function getMyKaelMemory(ctx: MobileApiContext) {
  if (ctx.role === "worker") return getWorkerKaelMemory(ctx);
  const client = db(ctx);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("customer_kael_memory")
      .select("customer_id, language, preference_summary, service_preferences, trust_signals, memory_version, last_observed_at")
      .eq("customer_id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải bộ nhớ Kael", 500);
  await logMemoryAudit(client, {
    subjectType: "customer",
    subjectId: ctx.user.id,
    actorId: ctx.user.id,
    operation: "read",
    layer: "L3",
    purpose: "self_view",
  });
  return {
    subject_type: "customer" as const,
    memory: result.data ? sanitizeMemoryObject(result.data) : null,
  };
}

export async function getWorkerKaelMemory(ctx: MobileApiContext) {
  const client = db(ctx);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_kael_memory")
      .select("worker_id, language, service_skill_summary, service_skill_proficiency, reliability_signals, red_flags, memory_version, last_observed_at")
      .eq("worker_id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải bộ nhớ Kael", 500);
  await logMemoryAudit(client, {
    subjectType: "worker",
    subjectId: ctx.user.id,
    actorId: ctx.user.id,
    operation: "read",
    layer: "L4",
    purpose: "self_view",
  });
  return {
    subject_type: "worker" as const,
    memory: result.data ? sanitizeMemoryObject(result.data) : null,
  };
}

export async function deleteMyKaelMemory(ctx: MobileApiContext) {
  const client = db(ctx);
  const subjectType: "customer" | "worker" = ctx.role === "worker" ? "worker" : "customer";
  const table = subjectType === "worker" ? "worker_kael_memory" : "customer_kael_memory";
  const column = subjectType === "worker" ? "worker_id" : "customer_id";
  const result = await dbQuery<null>(
    client.from(table).delete().eq(column, ctx.user.id),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể xóa bộ nhớ Kael", 500);
  await logMemoryAudit(client, {
    subjectType,
    subjectId: ctx.user.id,
    actorId: ctx.user.id,
    operation: "delete",
    layer: subjectType === "worker" ? "L4" : "L3",
    purpose: "self_delete",
  });
  return {
    subject_type: subjectType,
    deleted: true as const,
  };
}

export async function updateMyKaelMemory(
  ctx: MobileApiContext,
  input: UpdateKaelMemoryInput,
) {
  const client = db(ctx);
  const now = new Date().toISOString();

  if (ctx.role === "worker") {
    if (input.language !== undefined) {
      const result = await dbQuery<null>(
        client.from("worker_kael_memory").upsert({
          worker_id: ctx.user.id,
          language: input.language,
          updated_at: now,
        }),
      );
      if (result.error) {
        apiFailure("DB_ERROR", "Không thể cập nhật bộ nhớ Kael", 500);
      }
      await logMemoryAudit(client, {
        subjectType: "worker",
        subjectId: ctx.user.id,
        actorId: ctx.user.id,
        operation: "write",
        layer: "L4",
        purpose: "self_edit",
      });
    }
    return getWorkerKaelMemory(ctx);
  }

  const payload: Record<string, unknown> = {
    customer_id: ctx.user.id,
    updated_at: now,
  };
  if (input.language !== undefined) payload.language = input.language;
  if (input.preference_summary !== undefined) {
    // PII-scrub the user's free text before it can ever reach a Kael prompt.
    payload.preference_summary = scrubSensitiveForLLM(input.preference_summary)
      .slice(0, 600);
  }
  const result = await dbQuery<null>(
    client.from("customer_kael_memory").upsert(payload),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật bộ nhớ Kael", 500);
  }
  await logMemoryAudit(client, {
    subjectType: "customer",
    subjectId: ctx.user.id,
    actorId: ctx.user.id,
    operation: "write",
    layer: "L3",
    purpose: "self_edit",
  });
  return getMyKaelMemory(ctx);
}
