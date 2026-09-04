import { apiFailure } from "../../platform/api-failure.ts";

export type Stage1ReleaseLane = "candidate" | "active" | "previous";
export type Stage1RuntimeBehavior = "governed" | "previous";
export const STAGE1_CLIENT_CONTRACT_EPOCH = 2;

export type Stage1ReleaseLaneClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export async function resolveStage1ReleaseLane(
  client: Stage1ReleaseLaneClient,
  input: {
    environment: string;
    releaseId: string;
    sessionId: string;
    deploymentId?: string;
  },
): Promise<Stage1ReleaseLane> {
  if (
    (input.environment !== "staging" && input.environment !== "production") ||
    !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(input.releaseId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      input.sessionId,
    )
  ) {
    releaseControlUnavailable();
  }
  if (!isDeploymentIdentity(input.deploymentId)) return "previous";
  let result: { data: unknown; error: unknown };
  try {
    result = await client.rpc("resolve_stage1_release_lane_attested", {
      p_environment: input.environment,
      p_release_id: input.releaseId,
      p_session_id: input.sessionId,
      p_deployment_id: input.deploymentId,
    });
  } catch {
    releaseControlUnavailable();
  }
  const lane = Array.isArray(result.data) ? result.data[0] : result.data;
  if (
    result.error ||
    (lane !== "candidate" && lane !== "active" && lane !== "previous")
  ) {
    releaseControlUnavailable();
  }
  return lane;
}

export async function resolveStage1RuntimeBehavior(
  client: Stage1ReleaseLaneClient,
  input: {
    environment?: string;
    releaseId?: string;
    sessionId: string;
    deploymentId?: string;
    clientContractEpoch?: number;
  },
): Promise<Stage1RuntimeBehavior> {
  if (input.environment !== "production") return "governed";
  if (input.clientContractEpoch !== STAGE1_CLIENT_CONTRACT_EPOCH) {
    return "previous";
  }
  const lane = await resolveStage1ReleaseLane(client, {
    environment: input.environment,
    releaseId: input.releaseId ?? "",
    sessionId: input.sessionId,
    deploymentId: input.deploymentId,
  });
  return lane === "candidate" || lane === "active" ? "governed" : "previous";
}

function isDeploymentIdentity(value: string | undefined): value is string {
  return typeof value === "string" &&
    /^[a-z0-9]{20}_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[1-9][0-9]*$/iu.test(
      value,
    );
}

function releaseControlUnavailable(): never {
  apiFailure(
    "RELEASE_CONTROL_UNAVAILABLE",
    "Không thể xác minh phiên bản dịch vụ an toàn. Vui lòng thử lại sau.",
    503,
  );
}
