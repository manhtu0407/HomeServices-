// Edge evidence-reference validation: bind private job-media refs to the routed job,
// expected workflow stages, and (when required) the actor who attached the asset.

import { apiFailure } from "../router.ts";
import {
  JOB_MEDIA_STAGES,
} from "../../../_shared/domain-evidence.ts";
import type { JobStatus } from "../../../_shared/domain.ts";
import { dbQuery, type DbClient } from "./db.ts";
import { storageRef } from "./_shared.ts";

const WORKER_EVIDENCE_RELEASE_STATUSES = new Set<JobStatus>([
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
  "reviewed",
]);

const JOB_MEDIA_REF_PATTERN = new RegExp(
  `^supabase://job-media/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/(${JOB_MEDIA_STAGES.join("|")})/((?!.*(?:\\.\\.|//))[^\\s?#/]+)$`,
  "i",
);

export type JobEvidenceStage = (typeof JOB_MEDIA_STAGES)[number];

export function canReleaseJobEvidenceToWorker(
  status: unknown,
  matchedAt?: unknown,
): boolean {
  if (status === "cancelled") {
    return typeof matchedAt === "string" && matchedAt.trim().length > 0;
  }
  return typeof status === "string" &&
    WORKER_EVIDENCE_RELEASE_STATUSES.has(status as JobStatus);
}

type ListJobEvidenceRefsInput = {
  jobIds: string[];
  stage: JobEvidenceStage;
  ownerId?: string;
};

export async function listJobEvidenceRefsByStage(
  client: DbClient,
  input: ListJobEvidenceRefsInput,
): Promise<Map<string, string[]>> {
  const jobIds = [...new Set(input.jobIds.map((jobId) => jobId.trim()).filter(Boolean))];
  const refsByJob = new Map<string, string[]>();
  if (jobIds.length === 0) return refsByJob;
  const requestedJobIds = new Set(jobIds);

  let query = client
    .from("job_media_assets")
    .select("job_id, object_path, created_at")
    .in("job_id", jobIds)
    .eq("stage", input.stage)
    .order("created_at", { ascending: true });
  if (input.ownerId) query = query.eq("owner_id", input.ownerId);

  const result = await dbQuery<Array<Record<string, unknown>>>(query);
  if (result.error) {
    apiFailure(
      "DB_ERROR",
      "Không thể tải bằng chứng công việc",
      500,
    );
  }

  for (const row of result.data ?? []) {
    const jobId = typeof row.job_id === "string" ? row.job_id : null;
    const objectPath = typeof row.object_path === "string" ? row.object_path : null;
    const ref = objectPath ? storageRef(objectPath) : null;
    if (
      !jobId ||
      !requestedJobIds.has(jobId) ||
      !objectPath ||
      !objectPath.startsWith(`${jobId}/${input.stage}/`) ||
      !ref ||
      !JOB_MEDIA_REF_PATTERN.test(ref)
    ) {
      apiFailure("DB_ERROR", "Bằng chứng công việc không hợp lệ", 500);
    }
    const refs = refsByJob.get(jobId) ?? [];
    if (!refs.includes(ref)) refs.push(ref);
    refsByJob.set(jobId, refs);
  }

  return refsByJob;
}

type ValidateJobEvidenceRefsInput = {
  jobId: string;
  mediaRefs: string[];
  allowedStages: readonly JobEvidenceStage[];
  ownerId?: string;
};

export async function validateJobEvidenceRefs(
  client: DbClient,
  input: ValidateJobEvidenceRefsInput,
): Promise<string[]> {
  const normalizedRefs = [...new Set(input.mediaRefs.map((ref) => ref.trim()).filter(Boolean))];
  if (normalizedRefs.length === 0) return [];
  if (normalizedRefs.length > 5) invalidEvidenceRef();

  const allowedStages = new Set<JobEvidenceStage>(input.allowedStages);
  const expectedByPath = new Map<string, JobEvidenceStage>();
  for (const ref of normalizedRefs) {
    const match = ref.match(JOB_MEDIA_REF_PATTERN);
    const refJobId = match?.[1]?.toLowerCase();
    const stage = match?.[2] as JobEvidenceStage | undefined;
    const suffix = match?.[3];
    if (
      !refJobId ||
      !stage ||
      !suffix ||
      refJobId !== input.jobId.toLowerCase() ||
      !allowedStages.has(stage)
    ) {
      invalidEvidenceRef();
    }
    expectedByPath.set(`${match[1]}/${stage}/${suffix}`, stage);
  }

  const objectPaths = [...expectedByPath.keys()];
  let query = client
    .from("job_media_assets")
    .select("object_path, stage, owner_id")
    .eq("job_id", input.jobId)
    .in("object_path", objectPaths);
  if (input.ownerId) query = query.eq("owner_id", input.ownerId);

  const result = await dbQuery<Array<Record<string, unknown>>>(query);
  if (result.error) {
    apiFailure(
      "MEDIA_VALIDATION_UNAVAILABLE",
      "Chưa thể xác minh bằng chứng riêng tư. Vui lòng thử lại.",
      503,
    );
  }

  const validatedPaths = new Set<string>();
  for (const row of result.data ?? []) {
    const objectPath = typeof row.object_path === "string" ? row.object_path : null;
    const stage = typeof row.stage === "string" ? row.stage : null;
    const ownerId = typeof row.owner_id === "string" ? row.owner_id : null;
    if (
      objectPath &&
      expectedByPath.get(objectPath) === stage &&
      (!input.ownerId || ownerId?.toLowerCase() === input.ownerId.toLowerCase())
    ) {
      validatedPaths.add(objectPath);
    }
  }
  if (validatedPaths.size !== objectPaths.length) invalidEvidenceRef();
  return normalizedRefs;
}

function invalidEvidenceRef(): never {
  apiFailure(
    "INVALID_JOB_MEDIA_REF",
    "Bằng chứng không thuộc công việc, bước xử lý hoặc người gửi hiện tại.",
    400,
  );
}
