import type { UserRole } from "../../../../_shared/domain.ts";

export type WorkerRoute =
  | { kind: "workerApplications.submit"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "workerApplications.me"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.register"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "workers.registrationDraft"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.registrationCommand.submit"; method: "POST"; roles: UserRole[] }
  | { kind: "workers.registrationCommand.get"; method: "GET"; roles: UserRole[]; clientRequestId: string }
  | { kind: "workers.me"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.avatarUpload"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "workers.avatar"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.activityMinute"; method: "POST"; roles: UserRole[] }
  | { kind: "workers.performanceInsights"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.serviceArea"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.servicePreferences"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.kaelMemory"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.kaelMemory.update"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.kaelFeedback"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "workers.kaelTrainingConsent.get"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.kaelTrainingConsent.set"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.availability"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.broadcasts"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.matchingHeartbeat"; method: "POST"; roles: UserRole[] }
  | { kind: "workers.broadcastSeen"; method: "POST"; roles: UserRole[]; broadcastId: string }
  | {
    kind: "workers.broadcastProposal";
    method: "POST";
    roles: UserRole[];
    broadcastId: string;
    successStatus: 201;
  }
  | { kind: "workers.jobs"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.earnings"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.payoutMethod.get"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.payoutMethod.save"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.withdrawalRequests.list"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.ambassador.get"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.violations.list"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.compensation.list"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.compensation.respond"; method: "POST"; roles: UserRole[]; negotiationId: string }
  | { kind: "workers.violations.appealUpload"; method: "POST"; roles: UserRole[]; caseId: string; successStatus: 201 }
  | { kind: "workers.violations.appeal"; method: "POST"; roles: UserRole[]; caseId: string }
  | { kind: "workers.ambassador.code"; method: "POST"; roles: UserRole[] }
  | { kind: "workers.ambassador.redeem"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | {
    kind: "workers.withdrawalRequests.create";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  };

// In the chain this block used to be interrupted by the worker Kael-chat matcher, which sits
// between "/workers/me/kael-memory" and "/workers/me/kael-feedback". Rejoining the two halves is
// safe because every branch here is an exact literal whose third segment is never "kael" — the
// Kael-chat matcher only owns "/workers/me/kael/chat...". The two sets cannot both match a path.
export function matchWorkerRoute(path: string, method: string): WorkerRoute | null {
  if (method === "GET" && path === "/worker-applications/me") {
    return {
      kind: "workerApplications.me",
      method: "GET",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "POST" && path === "/worker-applications") {
    return {
      kind: "workerApplications.submit",
      method: "POST",
      roles: ["customer", "worker", "admin"],
      successStatus: 201,
    };
  }
  if (method === "POST" && path === "/workers/register") {
    return {
      kind: "workers.register",
      method: "POST",
      roles: ["worker"],
      successStatus: 201,
    };
  }
  if (method === "PATCH" && path === "/workers/registration-draft") {
    return { kind: "workers.registrationDraft", method: "PATCH", roles: ["worker"] };
  }
  if (method === "POST" && path === "/workers/registration-commands") {
    return { kind: "workers.registrationCommand.submit", method: "POST", roles: ["worker"] };
  }
  const commandMatch = path.match(/^\/workers\/registration-commands\/([^/]+)$/);
  if (method === "GET" && commandMatch?.[1]) {
    return { kind: "workers.registrationCommand.get", method: "GET", roles: ["worker"], clientRequestId: commandMatch[1] };
  }
  if (method === "GET" && path === "/workers/me") {
    return { kind: "workers.me", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "POST" && path === "/workers/me/avatar-upload") {
    return {
      kind: "workers.avatarUpload",
      method: "POST",
      roles: ["worker", "admin"],
      successStatus: 201,
    };
  }
  if (method === "PATCH" && path === "/workers/me/avatar") {
    return { kind: "workers.avatar", method: "PATCH", roles: ["worker", "admin"] };
  }
  if (method === "POST" && path === "/workers/me/activity-minute") {
    return { kind: "workers.activityMinute", method: "POST", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/performance-insights") {
    return { kind: "workers.performanceInsights", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "PATCH" && path === "/workers/me/service-area") {
    return { kind: "workers.serviceArea", method: "PATCH", roles: ["worker", "admin"] };
  }
  if (method === "PATCH" && path === "/workers/me/service-preferences") {
    return { kind: "workers.servicePreferences", method: "PATCH", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/kael-memory") {
    return { kind: "workers.kaelMemory", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "PATCH" && path === "/workers/me/kael-memory") {
    return { kind: "workers.kaelMemory.update", method: "PATCH", roles: ["worker"] };
  }
  if (method === "POST" && path === "/workers/me/kael-feedback") {
    return {
      kind: "workers.kaelFeedback",
      method: "POST",
      roles: ["worker", "admin"],
      successStatus: 201,
    };
  }
  if (method === "GET" && path === "/workers/me/kael-training-consent") {
    return { kind: "workers.kaelTrainingConsent.get", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "PATCH" && path === "/workers/me/kael-training-consent") {
    return { kind: "workers.kaelTrainingConsent.set", method: "PATCH", roles: ["worker", "admin"] };
  }
  if (method === "PATCH" && path === "/workers/me/availability") {
    return { kind: "workers.availability", method: "PATCH", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/broadcasts") {
    return { kind: "workers.broadcasts", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "POST" && path === "/workers/me/matching-heartbeat") {
    return { kind: "workers.matchingHeartbeat", method: "POST", roles: ["worker"] };
  }
  const seenMatch = path.match(/^\/workers\/me\/broadcasts\/([^/]+)\/seen$/);
  if (method === "POST" && seenMatch?.[1]) {
    return {
      kind: "workers.broadcastSeen",
      method: "POST",
      roles: ["worker"],
      broadcastId: seenMatch[1],
    };
  }
  const proposalMatch = path.match(/^\/workers\/me\/broadcasts\/([^/]+)\/proposal$/);
  if (method === "POST" && proposalMatch?.[1]) {
    return {
      kind: "workers.broadcastProposal",
      method: "POST",
      roles: ["worker"],
      broadcastId: proposalMatch[1],
      successStatus: 201,
    };
  }
  if (method === "GET" && path === "/workers/me/jobs") {
    return { kind: "workers.jobs", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/earnings") {
    return { kind: "workers.earnings", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/payout-method") {
    return { kind: "workers.payoutMethod.get", method: "GET", roles: ["worker"] };
  }
  if (method === "PATCH" && path === "/workers/me/payout-method") {
    return { kind: "workers.payoutMethod.save", method: "PATCH", roles: ["worker"] };
  }
  if (method === "GET" && path === "/workers/me/compensation") {
    return { kind: "workers.compensation.list", method: "GET", roles: ["worker"] };
  }
  const compensationResponse = path.match(/^\/workers\/me\/compensation\/([0-9a-f-]{36})\/response$/);
  if (compensationResponse && method === "POST") {
    return { kind: "workers.compensation.respond", method: "POST", roles: ["worker"], negotiationId: compensationResponse[1] ?? "" };
  }
  if (method === "GET" && path === "/workers/me/violations") {
    return { kind: "workers.violations.list", method: "GET", roles: ["worker"] };
  }
  const violationAction = path.match(/^\/workers\/me\/violations\/([0-9a-f-]{36})\/(appeal-uploads|appeal)$/);
  if (violationAction && method === "POST") {
    const caseId = violationAction[1] ?? "";
    return violationAction[2] === "appeal"
      ? { kind: "workers.violations.appeal", method: "POST", roles: ["worker"], caseId }
      : { kind: "workers.violations.appealUpload", method: "POST", roles: ["worker"], caseId, successStatus: 201 };
  }
  if (method === "GET" && path === "/workers/me/ambassador") {
    return { kind: "workers.ambassador.get", method: "GET", roles: ["worker"] };
  }
  if (method === "POST" && path === "/workers/me/ambassador/code") {
    return { kind: "workers.ambassador.code", method: "POST", roles: ["worker"] };
  }
  if (method === "POST" && path === "/workers/me/ambassador/redemptions") {
    return { kind: "workers.ambassador.redeem", method: "POST", roles: ["worker"], successStatus: 201 };
  }
  if (method === "GET" && path === "/workers/me/withdrawal-requests") {
    return { kind: "workers.withdrawalRequests.list", method: "GET", roles: ["worker"] };
  }
  if (method === "POST" && path === "/workers/me/withdrawal-requests") {
    return {
      kind: "workers.withdrawalRequests.create",
      method: "POST",
      roles: ["worker"],
      successStatus: 201,
    };
  }
  return null;
}
