import type { UserRole } from "../../../../_shared/domain.ts";

export type AdminRoute =
  | { kind: "admin.marketCache.invalidate"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelAb.priceSynthesis"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.processQueue"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.processBatchResults"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.monitorRules"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.candidates.list"; method: "GET"; roles: UserRole[] }
  | {
    kind: "admin.kaelLearning.candidates.approve";
    method: "POST";
    candidateId: string;
    roles: UserRole[];
  }
  | {
    kind: "admin.kaelLearning.candidates.reject";
    method: "POST";
    candidateId: string;
    roles: UserRole[];
  };

export function matchAdminRoute(
  path: string,
  method: string,
  decodeSegment: (segment: string) => string | null,
): AdminRoute | null {
  if (method === "POST" && path === "/admin/market-cache/invalidate") {
    return {
      kind: "admin.marketCache.invalidate",
      method: "POST",
      roles: ["admin"],
    };
  }
  if (method === "POST" && path === "/admin/kael-ab/price-synthesis") {
    return {
      kind: "admin.kaelAb.priceSynthesis",
      method: "POST",
      roles: ["admin"],
    };
  }
  if (method === "POST" && path === "/admin/kael-learning/process-queue") {
    return {
      kind: "admin.kaelLearning.processQueue",
      method: "POST",
      roles: ["admin"],
    };
  }
  if (method === "POST" && path === "/admin/kael-learning/process-batch-results") {
    return {
      kind: "admin.kaelLearning.processBatchResults",
      method: "POST",
      roles: ["admin"],
    };
  }
  if (method === "POST" && path === "/admin/kael-learning/monitor-rules") {
    return {
      kind: "admin.kaelLearning.monitorRules",
      method: "POST",
      roles: ["admin"],
    };
  }
  if (
    method === "GET" &&
    (path === "/admin/kael/learning/candidates" ||
      path === "/admin/kael-learning/candidates")
  ) {
    return {
      kind: "admin.kaelLearning.candidates.list",
      method: "GET",
      roles: ["admin"],
    };
  }
  const learningCandidate = path.match(
    /^\/admin\/(?:kael\/learning|kael-learning)\/candidates\/([^/]+)\/(approve|reject)$/,
  );
  if (learningCandidate && method === "POST") {
    const candidateId = decodeSegment(learningCandidate[1] ?? "");
    const action = learningCandidate[2];
    if (!candidateId) return null;
    return {
      kind: action === "approve"
        ? "admin.kaelLearning.candidates.approve"
        : "admin.kaelLearning.candidates.reject",
      method: "POST",
      candidateId,
      roles: ["admin"],
    };
  }
  return null;
}
