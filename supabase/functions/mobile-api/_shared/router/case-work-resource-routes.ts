import type { UserRole } from "../../../_shared/domain.ts";

export type CaseWorkResourceRoute =
  | { kind: "kael.chat.mediaUpload"; method: "POST"; roles: UserRole[] }
  | { kind: "kael.chat.mediaRevoke"; method: "POST"; roles: UserRole[] }
  | { kind: "jobs.workerCandidate"; method: "GET"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.workerCandidateConfirm"; method: "POST"; jobId: string; candidateId: string; roles: UserRole[] }
  | { kind: "jobs.workerCandidateReject"; method: "POST"; jobId: string; candidateId: string; roles: UserRole[] }
  | { kind: "me.favoriteWorkerSave"; method: "POST"; workerId: string; roles: UserRole[] }
  | { kind: "me.favoriteWorkerRemove"; method: "DELETE"; workerId: string; roles: UserRole[] }
  | { kind: "workers.routePreview"; method: "GET"; jobId: string; roles: UserRole[] }
  | { kind: "workers.routeMap"; method: "GET"; jobId: string; roles: UserRole[] };

export function matchCaseWorkResourceRoute(
  path: string,
  method: string,
  decodePathSegment: (value: string) => string | null,
): CaseWorkResourceRoute | null {
  if (method === "POST" && path === "/kael/chat/media-upload") {
    return { kind: "kael.chat.mediaUpload", method: "POST", roles: ["customer", "admin"] };
  }
  if (method === "POST" && path === "/kael/chat/media-revoke") {
    return { kind: "kael.chat.mediaRevoke", method: "POST", roles: ["customer", "admin"] };
  }

  const workerRoute = path.match(/^\/workers\/me\/jobs\/([^/]+)\/(route-preview|route-map)$/);
  if (method === "GET" && workerRoute) {
    const jobId = decodePathSegment(workerRoute[1] ?? "");
    if (!jobId) return null;
    return {
      kind: workerRoute[2] === "route-preview" ? "workers.routePreview" : "workers.routeMap",
      method: "GET",
      jobId,
      roles: ["worker"],
    };
  }

  const candidate = path.match(/^\/jobs\/([^/]+)\/candidate$/);
  if (method === "GET" && candidate) {
    const jobId = decodePathSegment(candidate[1] ?? "");
    return jobId
      ? { kind: "jobs.workerCandidate", method: "GET", jobId, roles: ["customer"] }
      : null;
  }

  const favoriteWorker = path.match(/^\/me\/favorite-workers\/([^/]+)$/);
  if ((method === "POST" || method === "DELETE") && favoriteWorker) {
    const workerId = decodePathSegment(favoriteWorker[1] ?? "");
    if (!workerId) return null;
    return method === "POST"
      ? { kind: "me.favoriteWorkerSave", method: "POST", workerId, roles: ["customer"] }
      : { kind: "me.favoriteWorkerRemove", method: "DELETE", workerId, roles: ["customer"] };
  }

  const decision = path.match(/^\/jobs\/([^/]+)\/candidates\/([^/]+)\/(confirm|reject)$/);
  if (method !== "POST" || !decision) return null;
  const jobId = decodePathSegment(decision[1] ?? "");
  const candidateId = decodePathSegment(decision[2] ?? "");
  if (!jobId || !candidateId) return null;
  return {
    kind: decision[3] === "confirm" ? "jobs.workerCandidateConfirm" : "jobs.workerCandidateReject",
    method: "POST",
    jobId,
    candidateId,
    roles: ["customer"],
  };
}
