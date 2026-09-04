import { apiFailure } from "./api-failure.ts";
import { dbQuery, type Chain, type DbClient } from "./db.ts";

const SYNTHETIC_COHORT_ID_PATTERN = /^synthetic-[a-z0-9-]{8,100}$/;

export type SyntheticActorScope = {
  cohortId: string | null;
};

export async function resolveSyntheticActorScope(
  client: DbClient,
  profileId: string,
  memberRole: "customer" | "worker",
): Promise<SyntheticActorScope> {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("synthetic_matching_cohort_members")
      .select("cohort_id")
      .eq("profile_id", profileId)
      .eq("member_role", memberRole)
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể xác minh phạm vi dữ liệu thử nghiệm", 500);
  }
  if (!result.data) return { cohortId: null };
  const cohortId = result.data.cohort_id;
  if (typeof cohortId !== "string" || !SYNTHETIC_COHORT_ID_PATTERN.test(cohortId)) {
    apiFailure("DB_ERROR", "Phạm vi dữ liệu thử nghiệm không hợp lệ", 500);
  }
  return { cohortId };
}

export async function requireRealTrafficActor(
  client: DbClient,
  profileId: string,
  memberRole: "customer" | "worker",
): Promise<void> {
  const scope = await resolveSyntheticActorScope(client, profileId, memberRole);
  if (scope.cohortId !== null) {
    apiFailure(
      "SYNTHETIC_COHORT_RESTRICTED",
      "Tài khoản thử nghiệm không được dùng chức năng tài chính",
      403,
    );
  }
}

export function scopeQueryToSyntheticActor(
  query: Chain,
  scope: SyntheticActorScope,
  column = "synthetic_cohort_id",
): Chain {
  return scope.cohortId === null
    ? query.is(column, null)
    : query.eq(column, scope.cohortId);
}

export function scopeQueryToRealTraffic(
  query: Chain,
  column = "synthetic_cohort_id",
): Chain {
  return query.is(column, null);
}
