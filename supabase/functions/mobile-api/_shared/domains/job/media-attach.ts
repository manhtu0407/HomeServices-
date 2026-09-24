import {
  asServiceType,
  asStringArray,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { logJobEvent } from "../../platform/audit.ts";
import {
  canAttachJobMediaStage,
  mergeLimitedRefs,
  storageRef,
  validateJobMediaPath,
} from "../../platform/job-media.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { validateWorkflowCommand } from "../../workflow-orchestrator.ts";
import type {
  JobMediaAttachInput,
  JobStatus,
} from "../../../../_shared/domain.ts";
import { normalizeDeclaredJobMediaMime } from "./media-content.ts";
import {
  consumeJobMediaIntents,
  failJobMediaIntents,
  type JobMediaRow,
  jobMediaStorageBucket,
  removeJobMediaObjectsBestEffort,
  verifyStoredJobMedia,
} from "./media-support.ts";

export async function attachJobMedia(
  ctx: MobileApiContext,
  jobId: string,
  input: JobMediaAttachInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select:
      "id, status, service_type, customer_id, worker_id, photo_urls, completion_photo_urls",
  });
  const status = job.status as JobStatus;
  const customerId = nullableString(job.customer_id);
  const workerId = nullableString(job.worker_id);
  const isCustomer = customerId === ctx.user.id;
  const isWorker = workerId === ctx.user.id;
  const isAdmin = ctx.role === "admin";
  if (!isCustomer && !isWorker && !isAdmin) {
    apiFailure(
      "FORBIDDEN",
      "Bạn không có quyền gắn media cho yêu cầu này",
      403,
    );
  }

  for (const asset of input.assets) {
    const command = validateWorkflowCommand({
      event: "job_media_attached",
      status,
      mediaStage: asset.stage,
    });
    if (!command.valid) apiFailure("INVALID_STATUS", command.error, 409);
  }

  const serviceType = asServiceType(job.service_type);
  const rows = buildJobMediaRows({
    ctx, jobId, input, serviceType, isCustomer, isWorker, isAdmin,
  });
  const { rowsToInsert, responseRows } = await persistJobMediaRows({
    client, ctx, jobId, rows,
  });
  const beforeRefs = rows
    .filter((row) =>
      row.stage === "before" || (row.stage === "kael_reference" && isCustomer)
    )
    .map((row) => storageRef(row.object_path));
  const afterRefs = rows
    .filter((row) => row.stage === "after")
    .map((row) => storageRef(row.object_path));
  let photoUrls = asStringArray(job.photo_urls);

  if (beforeRefs.length > 0) {
    photoUrls = mergeLimitedRefs(photoUrls, beforeRefs, 5);
    const updated = await dbQuery(
      client
        .from("jobs")
        .update({ photo_urls: photoUrls })
        .eq("id", jobId)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error || !updated.data) {
      apiFailure("DB_ERROR", "Không thể cập nhật media yêu cầu", 500);
    }
  }

  if (afterRefs.length > 0) {
    const completionPhotoUrls = mergeLimitedRefs(
      asStringArray(job.completion_photo_urls),
      afterRefs,
      10,
    );
    const updated = await dbQuery(
      client
        .from("jobs")
        .update({ completion_photo_urls: completionPhotoUrls })
        .eq("id", jobId)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error || !updated.data) {
      apiFailure("DB_ERROR", "Không thể cập nhật media hoàn tất", 500);
    }
  }

  if (rowsToInsert.length > 0) {
    await logJobEvent(
      client,
      jobId,
      "job_media_attached",
      ctx,
      status,
      status,
      {
        count: rowsToInsert.length,
        stages: Array.from(new Set(rowsToInsert.map((row) => row.stage))),
      },
    );
  }

  return {
    job_id: jobId,
    photo_urls: photoUrls,
    media: responseRows.map((row) => ({
      bucket_id: "job-media" as const,
      object_path: row.object_path,
      storage_ref: storageRef(row.object_path),
      stage: row.stage,
    })),
  };
}

function buildJobMediaRows(input: {
  ctx: MobileApiContext;
  jobId: string;
  input: JobMediaAttachInput;
  serviceType: ReturnType<typeof asServiceType>;
  isCustomer: boolean;
  isWorker: boolean;
  isAdmin: boolean;
}): JobMediaRow[] {
  return input.input.assets.map((asset) => {
    validateJobMediaPath(input.jobId, asset.stage, asset.object_path);
    if (!canAttachJobMediaStage(asset.stage, input.isCustomer, input.isWorker, input.isAdmin)) {
      apiFailure("FORBIDDEN", "Vai trò hiện tại không được gắn media ở bước này", 403);
    }
    return {
      job_id: input.jobId,
      owner_id: input.ctx.user.id,
      service_type: input.serviceType,
      stage: asset.stage,
      bucket_id: "job-media",
      object_path: asset.object_path,
      mime_type: normalizeDeclaredJobMediaMime(asset.mime_type),
      file_size_bytes: asset.file_size_bytes ?? null,
      safe_metadata: {},
    };
  });
}

async function persistJobMediaRows(input: {
  client: ReturnType<typeof db>;
  ctx: MobileApiContext;
  jobId: string;
  rows: JobMediaRow[];
}) {
  const objectPaths = Array.from(new Set(input.rows.map((row) => row.object_path)));
  const existingAssets = await dbQuery<Array<Record<string, unknown>>>(
    input.client.from("job_media_assets").select("object_path").eq("job_id", input.jobId).in("object_path", objectPaths),
  );
  if (existingAssets.error) apiFailure("DB_ERROR", "Không thể kiểm tra media đã gắn", 500);
  const existingObjectPaths = new Set(
    (existingAssets.data ?? []).map((asset) => nullableString(asset.object_path)).filter(Boolean),
  );
  const nextObjectPaths = new Set<string>();
  let rowsToInsert = input.rows.filter((row) => {
    if (existingObjectPaths.has(row.object_path) || nextObjectPaths.has(row.object_path)) return false;
    nextObjectPaths.add(row.object_path);
    return true;
  });
  const responseObjectPaths = new Set<string>();
  const responseRows = input.rows.filter((row) => {
    if (responseObjectPaths.has(row.object_path)) return false;
    responseObjectPaths.add(row.object_path);
    return true;
  });
  if (rowsToInsert.length > 0) {
    await consumeJobMediaIntents(input.client, input.jobId, input.ctx.user.id, rowsToInsert.map((row) => row.object_path));
  }
  const storage = rowsToInsert.length > 0 ? jobMediaStorageBucket(input.ctx) : null;
  if (rowsToInsert.length > 0 && !storage) {
    await failJobMediaIntents(input.client, input.jobId, input.ctx.user.id, rowsToInsert.map((row) => row.object_path));
    apiFailure("MEDIA_VALIDATION_UNAVAILABLE", "Chưa thể xác minh tệp media an toàn", 503);
  }
  if (storage) {
    const verifiedRows: JobMediaRow[] = [];
    for (const row of rowsToInsert) {
      const verified = await verifyStoredJobMedia(storage, row);
      if ("code" in verified) {
        const cleanupPaths = await failJobMediaIntents(
          input.client, input.jobId, input.ctx.user.id, rowsToInsert.map((candidate) => candidate.object_path),
        );
        await removeJobMediaObjectsBestEffort(storage, cleanupPaths);
        apiFailure(verified.code, verified.message, verified.status);
      }
      verifiedRows.push(verified.row);
    }
    rowsToInsert = verifiedRows;
  }
  if (rowsToInsert.length > 0) {
    const inserted = await dbQuery(input.client.from("job_media_assets").insert(rowsToInsert).select("id"));
    if (inserted.error) {
      const insertedPaths = rowsToInsert.map((row) => row.object_path);
      const outcome = await readJobMediaInsertOutcome(input.client, input.jobId, insertedPaths);
      // A client-side timeout can land after the insert committed; those rows now reference the
      // stored objects, so the attach stands and nothing may be cleaned up.
      if (outcome === "committed") return { rowsToInsert, responseRows };
      // Only a confirmed absent insert may release intents and delete the uploaded objects.
      if (outcome === "absent") {
        const cleanupPaths = await failJobMediaIntents(
          input.client, input.jobId, input.ctx.user.id, insertedPaths,
        );
        if (storage) await removeJobMediaObjectsBestEffort(storage, cleanupPaths);
      }
      apiFailure("DB_ERROR", "Không thể lưu thông tin media", 500);
    }
  }
  return { rowsToInsert, responseRows };
}

async function readJobMediaInsertOutcome(
  client: ReturnType<typeof db>,
  jobId: string,
  objectPaths: string[],
): Promise<"committed" | "absent" | "unknown"> {
  const stored = await dbQuery<Array<Record<string, unknown>>>(
    client.from("job_media_assets").select("object_path").eq("job_id", jobId).in("object_path", objectPaths),
  );
  if (stored.error || !Array.isArray(stored.data)) return "unknown";
  if (stored.data.length === 0) return "absent";
  return stored.data.length === objectPaths.length ? "committed" : "unknown";
}
