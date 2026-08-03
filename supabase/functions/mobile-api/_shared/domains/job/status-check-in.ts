import { nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";

export async function requireAttachedCheckInMedia(
  client: ReturnType<typeof db>,
  jobId: string,
  workerId: string,
  storageRefs: string[],
) {
  const objectPaths = Array.from(
    new Set(
      storageRefs.map((storageRef) => checkInObjectPath(storageRef, jobId)),
    ),
  );
  if (objectPaths.some((objectPath) => objectPath === null)) {
    apiFailure(
      "VALIDATION",
      "Ảnh check-in không thuộc công việc hiện tại",
      400,
    );
  }
  const validObjectPaths = objectPaths as string[];
  const assets = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_media_assets")
      .select("object_path")
      .eq("job_id", jobId)
      .eq("owner_id", workerId)
      .eq("stage", "access_check_in")
      .in("object_path", validObjectPaths),
  );
  if (assets.error) {
    apiFailure("DB_ERROR", "Không thể xác minh ảnh check-in", 500);
  }
  if (!Array.isArray(assets.data)) {
    apiFailure("DB_ERROR", "Không thể xác minh ảnh check-in", 500);
  }
  const attachedPaths = new Set(
    assets.data
      .map((asset) => nullableString(asset.object_path))
      .filter((objectPath): objectPath is string => objectPath !== null),
  );
  if (
    attachedPaths.size !== validObjectPaths.length ||
    validObjectPaths.some((objectPath) => !attachedPaths.has(objectPath))
  ) {
    apiFailure(
      "CHECK_IN_MEDIA_NOT_ATTACHED",
      "Ảnh check-in chưa được gắn an toàn vào công việc hiện tại",
      400,
    );
  }
}

function checkInObjectPath(storageRef: string, jobId: string): string | null {
  try {
    const url = new URL(storageRef);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "supabase:" ||
      url.hostname !== "job-media" ||
      pathParts.length !== 3 ||
      pathParts[0] !== jobId ||
      pathParts[1] !== "access_check_in" ||
      pathParts.some((part) => part === "." || part === "..")
    ) {
      return null;
    }
    return pathParts.join("/");
  } catch {
    return null;
  }
}
