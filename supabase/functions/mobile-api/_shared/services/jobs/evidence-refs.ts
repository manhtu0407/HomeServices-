// Edge evidence-reference validation: bind private job-media refs to the routed job,
// expected workflow stages, and (when required) the actor who attached the asset.

import { apiFailure } from "../../router.ts";
import {
  JOB_MEDIA_STAGES,
} from "../../../../_shared/domain-evidence.ts";
import { dbQuery, type DbClient } from "../db.ts";

const JOB_MEDIA_REF_PATTERN = new RegExp(
  `^supabase://job-media/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/(${JOB_MEDIA_STAGES.join("|")})/((?!.*(?:\\.\\.|//))[^\\s?#/]+)$`,
  "i",
);

export type JobEvidenceStage = (typeof JOB_MEDIA_STAGES)[number];

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
