import type { UserRole } from "../../../../_shared/domain.ts";

export type MeRoute =
  | { kind: "me.adminActivation"; method: "GET"; roles: UserRole[] }
  | { kind: "me.adminActivation.activate"; method: "POST"; roles: UserRole[] }
  | { kind: "me.kaelMemory"; method: "GET"; roles: UserRole[] }
  | { kind: "me.kaelMemory.delete"; method: "DELETE"; roles: UserRole[] }
  | { kind: "me.kaelMemory.update"; method: "PATCH"; roles: UserRole[] }
  | { kind: "me.pendingDecisions"; method: "GET"; roles: UserRole[] }
  | { kind: "me.profileInsights"; method: "GET"; roles: UserRole[] }
  | { kind: "me.avatar"; method: "GET"; roles: UserRole[] }
  | { kind: "me.avatarUpload"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "me.avatarUpdate"; method: "PATCH"; roles: UserRole[] }
  | { kind: "me.accountDeletion"; method: "POST"; roles: UserRole[] }
  | { kind: "me.refundAccount"; method: "GET"; roles: UserRole[] }
  | { kind: "me.refundAccount.save"; method: "PATCH"; roles: UserRole[] }
  | { kind: "me.address.save"; method: "PATCH"; roles: UserRole[] }
  | { kind: "me.threads"; method: "GET"; roles: UserRole[] }
  | {
    kind: "me.kaelFeedback";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "me.jobs.active"; method: "GET"; roles: UserRole[] }
  | { kind: "me.jobs.history"; method: "GET"; roles: UserRole[] }
  | { kind: "me.favoriteWorkers.matching"; method: "GET"; roles: UserRole[] }
  | { kind: "me.membership"; method: "GET"; roles: UserRole[] }
  | { kind: "me.referralClaim"; method: "POST"; roles: UserRole[] }
  | { kind: "me.compensation.list"; method: "GET"; roles: UserRole[] }
  | { kind: "me.compensation.claim"; method: "POST"; roles: UserRole[]; caseId: string; successStatus: 201 }
  | { kind: "me.compensation.upload"; method: "POST"; roles: UserRole[]; caseId: string; successStatus: 201 }
  | { kind: "me.compensation.respond"; method: "POST"; roles: UserRole[]; negotiationId: string };

export function matchMeRoute(path: string, method: string): MeRoute | null {
  if (method === "GET" && path === "/me/membership") {
    return { kind: "me.membership", method: "GET", roles: ["customer"] };
  }
  if (method === "POST" && path === "/me/referral-claims") {
    return { kind: "me.referralClaim", method: "POST", roles: ["customer"] };
  }
  if (method === "GET" && path === "/me/compensation") {
    return { kind: "me.compensation.list", method: "GET", roles: ["customer"] };
  }
  const compensationClaim = path.match(/^\/me\/compensation\/cases\/([0-9a-f-]{36})$/);
  if (compensationClaim && method === "POST") {
    return { kind: "me.compensation.claim", method: "POST", roles: ["customer"], caseId: compensationClaim[1] ?? "", successStatus: 201 };
  }
  const compensationUpload = path.match(/^\/me\/compensation\/cases\/([0-9a-f-]{36})\/uploads$/);
  if (compensationUpload && method === "POST") {
    return { kind: "me.compensation.upload", method: "POST", roles: ["customer"], caseId: compensationUpload[1] ?? "", successStatus: 201 };
  }
  const compensationResponse = path.match(/^\/me\/compensation\/([0-9a-f-]{36})\/response$/);
  if (compensationResponse && method === "POST") {
    return { kind: "me.compensation.respond", method: "POST", roles: ["customer"], negotiationId: compensationResponse[1] ?? "" };
  }
  if (method === "GET" && path === "/me/admin-activation") {
    return { kind: "me.adminActivation", method: "GET", roles: ["customer", "admin_operator"] };
  }
  if (method === "POST" && path === "/me/admin-activation") {
    return { kind: "me.adminActivation.activate", method: "POST", roles: ["customer"] };
  }
  if (method === "GET" && path === "/me/jobs/active") {
    return { kind: "me.jobs.active", method: "GET", roles: ["customer", "admin"] };
  }
  if (method === "GET" && path === "/me/jobs/history") {
    return { kind: "me.jobs.history", method: "GET", roles: ["customer", "admin"] };
  }
  if (method === "GET" && path === "/me/favorite-workers") {
    return { kind: "me.favoriteWorkers.matching", method: "GET", roles: ["customer"] };
  }
  if (method === "GET" && path === "/me/pending-decisions") {
    return { kind: "me.pendingDecisions", method: "GET", roles: ["customer", "admin"] };
  }
  if (method === "GET" && path === "/me/profile-insights") {
    return { kind: "me.profileInsights", method: "GET", roles: ["customer"] };
  }
  if (method === "GET" && path === "/me/avatar") {
    return { kind: "me.avatar", method: "GET", roles: ["customer"] };
  }
  if (method === "POST" && path === "/me/avatar-upload") {
    return {
      kind: "me.avatarUpload",
      method: "POST",
      roles: ["customer"],
      successStatus: 201,
    };
  }
  if (method === "PATCH" && path === "/me/avatar") {
    return { kind: "me.avatarUpdate", method: "PATCH", roles: ["customer"] };
  }
  if (method === "POST" && path === "/me/account-deletion") {
    return { kind: "me.accountDeletion", method: "POST", roles: ["customer", "worker"] };
  }
  if (method === "GET" && path === "/me/refund-account") {
    return { kind: "me.refundAccount", method: "GET", roles: ["customer"] };
  }
  if (method === "PATCH" && path === "/me/refund-account") {
    return { kind: "me.refundAccount.save", method: "PATCH", roles: ["customer"] };
  }
  if (method === "PATCH" && path === "/me/address") {
    return { kind: "me.address.save", method: "PATCH", roles: ["customer"] };
  }
  if (method === "GET" && path === "/me/threads") {
    return { kind: "me.threads", method: "GET", roles: ["customer", "admin"] };
  }
  if (method === "POST" && path === "/me/kael-feedback") {
    return {
      kind: "me.kaelFeedback",
      method: "POST",
      roles: ["customer", "admin"],
      successStatus: 201,
    };
  }
  if (method === "GET" && path === "/me/kael-memory") {
    return { kind: "me.kaelMemory", method: "GET", roles: ["customer", "worker", "admin"] };
  }
  if (method === "DELETE" && path === "/me/kael-memory") {
    return {
      kind: "me.kaelMemory.delete",
      method: "DELETE",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "PATCH" && path === "/me/kael-memory") {
    return {
      kind: "me.kaelMemory.update",
      method: "PATCH",
      roles: ["customer", "worker", "admin"],
    };
  }
  return null;
}
