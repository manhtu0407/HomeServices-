import type { UserRole } from "../../../../_shared/domain.ts";

export type MeRoute =
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
  | { kind: "me.threads"; method: "GET"; roles: UserRole[] }
  | {
    kind: "me.kaelFeedback";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "me.jobs.active"; method: "GET"; roles: UserRole[] }
  | { kind: "me.jobs.history"; method: "GET"; roles: UserRole[] }
  | { kind: "me.favoriteWorkers.matching"; method: "GET"; roles: UserRole[] };

export function matchMeRoute(path: string, method: string): MeRoute | null {
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
    return { kind: "me.accountDeletion", method: "POST", roles: ["customer"] };
  }
  if (method === "GET" && path === "/me/refund-account") {
    return { kind: "me.refundAccount", method: "GET", roles: ["customer"] };
  }
  if (method === "PATCH" && path === "/me/refund-account") {
    return { kind: "me.refundAccount.save", method: "PATCH", roles: ["customer"] };
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
