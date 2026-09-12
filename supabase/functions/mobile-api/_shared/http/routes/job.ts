import type { UserRole } from "../../../../_shared/domain.ts";

export type JobCreateRoute = {
  kind: "jobs.create";
  method: "POST";
  roles: UserRole[];
  successStatus: 201;
};

export type JobResourceRoute =
  | { kind: "jobs.get"; method: "GET"; jobId: string; roles?: UserRole[] }
  | { kind: "jobs.confirmSearch"; method: "POST"; jobId: string; roles: UserRole[]; successStatus: 202 }
  | { kind: "jobs.matchingOperation"; method: "GET"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.matchingRetry"; method: "GET"; jobId: string; requestId: string; roles: UserRole[] }
  | { kind: "jobs.matchingPreference"; method: "POST"; jobId: string; roles: UserRole[]; successStatus: 202 }
  | { kind: "jobs.matchingPreferenceReceipt"; method: "GET"; jobId: string; requestId: string; roles: UserRole[] }
  | { kind: "jobs.cancel"; method: "POST"; jobId: string; roles: UserRole[] }
  | {
    kind: "jobs.customerCancellation";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "jobs.openDispute";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "jobs.accept"; method: "POST"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.decline"; method: "POST"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.status"; method: "PATCH"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.accessAuthorize"; method: "POST"; jobId: string; roles: UserRole[] }
  | {
    kind: "jobs.scopeChange";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "jobs.kaelClarify";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "jobs.workerCancellation";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "jobs.media";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "jobs.messages.list"; method: "GET"; jobId: string; roles: UserRole[] }
  | {
    kind: "jobs.messages.send";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "jobs.confirmCompletion"; method: "POST"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.paymentOrder"; method: "POST"; jobId: string; roles: UserRole[] }
  | { kind: "jobs.paymentOrderClaim"; method: "POST"; jobId: string; roles: UserRole[] }
  | {
    kind: "jobs.review";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  };

// Two matchers, not one. The collection route is matched early in the chain; the resource
// routes are matched late, after the Kael and case-work matchers have had their turn at
// "/jobs/:id/..." paths they own (media-upload, kael-incident, candidate). Merging them would
// pull the catch-all "/jobs/:id/:action" regex ahead of those owners.
export function matchJobCreateRoute(path: string, method: string): JobCreateRoute | null {
  if (method === "POST" && path === "/jobs") {
    return {
      kind: "jobs.create",
      method: "POST",
      roles: ["customer", "admin"],
      successStatus: 201,
    };
  }
  return null;
}

export function matchJobResourceRoute(
  path: string,
  method: string,
  decodePathSegment: (value: string) => string | null,
): JobResourceRoute | null {
  const retryReceipt = path.match(/^\/jobs\/([^/]+)\/matching-retries\/([^/]+)$/);
  const preferenceReceipt = path.match(/^\/jobs\/([^/]+)\/matching-preference\/([^/]+)$/);
  if (method === "GET" && preferenceReceipt) {
    const jobId = decodePathSegment(preferenceReceipt[1] ?? "");
    const requestId = decodePathSegment(preferenceReceipt[2] ?? "");
    if (!jobId || !requestId) return null;
    return { kind: "jobs.matchingPreferenceReceipt", method: "GET", jobId, requestId, roles: ["customer"] };
  }
  if (method === "GET" && retryReceipt) {
    const jobId = decodePathSegment(retryReceipt[1] ?? "");
    const requestId = decodePathSegment(retryReceipt[2] ?? "");
    if (!jobId || !requestId) return null;
    return { kind: "jobs.matchingRetry", method: "GET", jobId, requestId, roles: ["customer"] };
  }
  const paymentOrderClaim = path.match(/^\/jobs\/([^/]+)\/payment-order\/claim$/);
  if (method === "POST" && paymentOrderClaim) {
    const paymentOrderJobId = decodePathSegment(paymentOrderClaim[1] ?? "");
    if (!paymentOrderJobId) return null;
    return {
      kind: "jobs.paymentOrderClaim",
      method: "POST",
      jobId: paymentOrderJobId,
      roles: ["customer"],
    };
  }

  const accessAuthorize = path.match(/^\/jobs\/([^/]+)\/access\/authorize$/);
  if (method === "POST" && accessAuthorize) {
    const accessAuthorizeJobId = decodePathSegment(accessAuthorize[1] ?? "");
    if (!accessAuthorizeJobId) return null;
    return {
      kind: "jobs.accessAuthorize",
      method: "POST",
      jobId: accessAuthorizeJobId,
      roles: ["customer"],
    };
  }

  const job = path.match(/^\/jobs\/([^/]+)(?:\/([^/]+))?$/);
  if (!job) return null;
  const jobId = decodePathSegment(job[1] ?? "");
  if (!jobId) return null;
  const action = job[2];
  return matchJobResourceAction(path, method, jobId, action ?? "");
}

function matchJobResourceAction(
  path: string,
  method: string,
  jobId: string,
  action: string,
): JobResourceRoute | null {
  if (!action && method === "GET") {
    return { kind: "jobs.get", method: "GET", jobId };
  }
  if (action === "confirm-search" && method === "POST") {
    return {
      kind: "jobs.confirmSearch",
      method: "POST",
      jobId,
      roles: ["customer"],
      successStatus: 202,
    };
  }

  if (action === "matching-preference" && method === "POST") {
    return {
      kind: "jobs.matchingPreference",
      method: "POST",
      jobId,
      roles: ["customer"],
      successStatus: 202,
    };
  }
  if (action === "cancel" && method === "POST") {
    return {
      kind: "jobs.cancel",
      method: "POST",
      jobId,
      roles: ["customer", "admin"],
    };
  }
  if (
    action === "customer-cancellation" &&
    method === "POST" &&
    path.endsWith("/customer-cancellation")
  ) {
    return {
      kind: "jobs.customerCancellation",
      method: "POST",
      jobId,
      roles: ["customer", "admin"],
      successStatus: 201,
    };
  }
  if (action === "disputes" && method === "POST" && path.endsWith("/disputes")) {
    return {
      kind: "jobs.openDispute",
      method: "POST",
      jobId,
      roles: ["customer", "worker", "admin"],
      successStatus: 201,
    };
  }
  if (action === "accept" && method === "POST") {
    return { kind: "jobs.accept", method: "POST", jobId, roles: ["worker", "admin"] };
  }
  if (action === "decline" && method === "POST") {
    return { kind: "jobs.decline", method: "POST", jobId, roles: ["worker", "admin"] };
  }
  if (action === "status" && method === "PATCH") {
    return { kind: "jobs.status", method: "PATCH", jobId, roles: ["worker", "admin"] };
  }
  if (action === "scope-change" && method === "POST") {
    return {
      kind: "jobs.scopeChange",
      method: "POST",
      jobId,
      roles: ["worker", "admin"],
      successStatus: 201,
    };
  }
  if (action === "kael-clarify" && method === "POST") {
    return {
      kind: "jobs.kaelClarify",
      method: "POST",
      jobId,
      roles: ["worker", "admin"],
      successStatus: 201,
    };
  }
  if (action === "worker-cancellation" && method === "POST") {
    return {
      kind: "jobs.workerCancellation",
      method: "POST",
      jobId,
      roles: ["worker", "admin"],
      successStatus: 201,
    };
  }
  if (action === "media" && method === "POST") {
    return {
      kind: "jobs.media",
      method: "POST",
      jobId,
      roles: ["customer", "worker", "admin"],
      successStatus: 201,
    };
  }
  if (action === "messages" && method === "GET") {
    return {
      kind: "jobs.messages.list",
      method: "GET",
      jobId,
      roles: ["customer", "worker", "admin"],
    };
  }
  if (action === "messages" && method === "POST") {
    return {
      kind: "jobs.messages.send",
      method: "POST",
      jobId,
      roles: ["customer", "worker"],
      successStatus: 201,
    };
  }
  return matchJobPaymentAction(action, method, jobId);
}

function matchJobPaymentAction(
  action: string,
  method: string,
  jobId: string,
): JobResourceRoute | null {
  if (action === "confirm-completion" && method === "POST") {
    return {
      kind: "jobs.confirmCompletion",
      method: "POST",
      jobId,
      roles: ["customer"],
    };
  }

  if (action === "matching-operation" && method === "GET") {
    return { kind: "jobs.matchingOperation", method: "GET", jobId, roles: ["customer"] };
  }
  if (action === "payment-order" && method === "POST") {
    return {
      kind: "jobs.paymentOrder",
      method: "POST",
      jobId,
      roles: ["customer"],
    };
  }
  if (action === "review" && method === "POST") {
    return {
      kind: "jobs.review",
      method: "POST",
      jobId,
      roles: ["customer"],
      successStatus: 201,
    };
  }
  return null;
}
