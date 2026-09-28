import type { UserRole } from "../../../../_shared/domain.ts";

export type AdminRoute =
  | { kind: "admin.marketCache.invalidate"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.ambassadorProgram.get"; method: "GET"; roles: UserRole[] }
  | { kind: "admin.discipline.cases"; method: "GET"; roles: UserRole[] }
  | { kind: "admin.discipline.case"; method: "GET"; roles: UserRole[]; caseId: string }
  | { kind: "admin.discipline.decide"; method: "POST"; roles: UserRole[]; caseId: string }
  | { kind: "admin.discipline.suspend"; method: "POST"; roles: UserRole[]; caseId: string }
  | { kind: "admin.discipline.holdExtend"; method: "POST"; roles: UserRole[]; caseId: string }
  | { kind: "admin.compensation.list"; method: "GET"; roles: UserRole[] }
  | { kind: "admin.compensation.paid"; method: "POST"; roles: UserRole[]; negotiationId: string }
  | { kind: "admin.compensation.payee"; method: "GET"; roles: UserRole[]; negotiationId: string }
  | { kind: "admin.discipline.appealDecide"; method: "POST"; roles: UserRole[]; caseId: string }
  | { kind: "admin.discipline.blocklist"; method: "GET"; roles: UserRole[] }
  | { kind: "admin.discipline.blocklistLift"; method: "POST"; roles: UserRole[]; blockId: string }
  | { kind: "admin.discipline.identityNumber"; method: "PUT"; roles: UserRole[]; workerId: string }
  | { kind: "admin.ambassadorProgram.saveDraft"; method: "PUT"; roles: UserRole[] }
  | { kind: "admin.ambassadorProgram.approve"; method: "POST"; roles: UserRole[]; versionId: string }
  | { kind: "admin.kaelAb.priceSynthesis"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.processQueue"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.processBatchResults"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.monitorRules"; method: "POST"; roles: UserRole[] }
  | { kind: "admin.kaelLearning.candidates.list"; method: "GET"; roles: UserRole[] }
  | { kind: "admin.kaelQueue.list"; method: "GET"; roles: UserRole[] }
  | { kind: "admin.kaelModelHealth.get"; method: "GET"; roles: UserRole[] }
  | { kind: "admin.kaelEstimateAccuracy.list"; method: "GET"; roles: UserRole[] }
  | {
    kind: "admin.kaelQueue.resolve";
    method: "POST";
    queueId: string;
    roles: UserRole[];
  }
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
  if (method === "GET" && path === "/admin/kael-model-health") {
    return {
      kind: "admin.kaelModelHealth.get",
      method: "GET",
      roles: ["admin"],
    };
  }
  if (method === "GET" && path === "/admin/kael-estimate-accuracy") {
    return {
      kind: "admin.kaelEstimateAccuracy.list",
      method: "GET",
      roles: ["admin"],
    };
  }
  if (method === "GET" && path === "/admin/kael-queue") {
    return {
      kind: "admin.kaelQueue.list",
      method: "GET",
      roles: ["admin"],
    };
  }
  // Sub Admins reach these too; each RPC checks the matching workers.* capability.
  const disciplineCase = path.match(/^\/admin\/discipline\/cases\/([0-9a-f-]{36})(?:\/(decision|suspend|hold-extension|appeal-decision))?$/);
  if (method === "GET" && path === "/admin/discipline/cases") {
    return { kind: "admin.discipline.cases", method: "GET", roles: ["admin", "admin_operator"] };
  }
  if (disciplineCase) {
    const caseId = disciplineCase[1] ?? "";
    const action = disciplineCase[2];
    if (method === "GET" && !action) return { kind: "admin.discipline.case", method: "GET", roles: ["admin", "admin_operator"], caseId };
    if (method === "POST" && action === "decision") return { kind: "admin.discipline.decide", method: "POST", roles: ["admin", "admin_operator"], caseId };
    if (method === "POST" && action === "suspend") return { kind: "admin.discipline.suspend", method: "POST", roles: ["admin", "admin_operator"], caseId };
    if (method === "POST" && action === "hold-extension") return { kind: "admin.discipline.holdExtend", method: "POST", roles: ["admin", "admin_operator"], caseId };
    if (method === "POST" && action === "appeal-decision") return { kind: "admin.discipline.appealDecide", method: "POST", roles: ["admin", "admin_operator"], caseId };
  }
  if (method === "GET" && path === "/admin/discipline/compensation") {
    return { kind: "admin.compensation.list", method: "GET", roles: ["admin", "admin_operator"] };
  }
  const compensationPaid = path.match(/^\/admin\/discipline\/compensation\/([0-9a-f-]{36})\/paid$/);
  if (compensationPaid && method === "POST") {
    return { kind: "admin.compensation.paid", method: "POST", roles: ["admin", "admin_operator"], negotiationId: compensationPaid[1] ?? "" };
  }
  const compensationPayee = path.match(/^\/admin\/discipline\/compensation\/([0-9a-f-]{36})\/payee$/);
  if (compensationPayee && method === "GET") {
    return { kind: "admin.compensation.payee", method: "GET", roles: ["admin", "admin_operator"], negotiationId: compensationPayee[1] ?? "" };
  }
  if (method === "GET" && path === "/admin/discipline/blocklist") {
    return { kind: "admin.discipline.blocklist", method: "GET", roles: ["admin", "admin_operator"] };
  }
  const blockLift = path.match(/^\/admin\/discipline\/blocklist\/([0-9a-f-]{36})\/lift$/);
  if (blockLift && method === "POST") {
    return { kind: "admin.discipline.blocklistLift", method: "POST", roles: ["admin", "admin_operator"], blockId: blockLift[1] ?? "" };
  }
  const identityNumber = path.match(/^\/admin\/discipline\/workers\/([0-9a-f-]{36})\/identity-number$/);
  if (identityNumber && method === "PUT") {
    return { kind: "admin.discipline.identityNumber", method: "PUT", roles: ["admin", "admin_operator"], workerId: identityNumber[1] ?? "" };
  }
  // Sub Admins reach these too; the RPC checks the workers.bonus.manage capability.
  if (method === "GET" && path === "/admin/ambassador-program") {
    return { kind: "admin.ambassadorProgram.get", method: "GET", roles: ["admin", "admin_operator"] };
  }
  if (method === "PUT" && path === "/admin/ambassador-program/draft") {
    return { kind: "admin.ambassadorProgram.saveDraft", method: "PUT", roles: ["admin", "admin_operator"] };
  }
  const programApprove = path.match(/^\/admin\/ambassador-program\/([^/]+)\/approve$/);
  if (programApprove && method === "POST") {
    const versionId = decodeSegment(programApprove[1] ?? "");
    if (!versionId) return null;
    return { kind: "admin.ambassadorProgram.approve", method: "POST", roles: ["admin", "admin_operator"], versionId };
  }
  const queueResolve = path.match(/^\/admin\/kael-queue\/([^/]+)\/resolve$/);
  if (queueResolve && method === "POST") {
    const queueId = decodeSegment(queueResolve[1] ?? "");
    if (!queueId) return null;
    return {
      kind: "admin.kaelQueue.resolve",
      method: "POST",
      queueId,
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
