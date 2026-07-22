import type { UserRole } from "../../../_shared/domain.ts";
import { matchCaseWorkResourceRoute, type CaseWorkResourceRoute } from "./case-work-resource-routes.ts";
import { matchWorkerKaelChatRoute, type WorkerKaelChatRoute } from "./worker-kael-chat-routes.ts";
import { matchCustomerKaelConversationRoute, type CustomerKaelConversationRoute } from "./customer-kael-conversation-routes.ts";
import { matchStagingPaymentRoute } from "./staging-payment-routes.ts";

export type PublicRoute = { kind: "kael.charter"; method: "GET"; public: true };

export type Route =
  | PublicRoute
  | CaseWorkResourceRoute
  | WorkerKaelChatRoute
  | CustomerKaelConversationRoute
  | { kind: "services"; method: "GET"; roles?: UserRole[] }
  | {
    kind: "places.autocomplete";
    method: "POST";
    roles: UserRole[];
  }
  | {
    kind: "places.resolve";
    method: "POST";
    roles: UserRole[];
  }
  | {
    kind: "jobs.create";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "kael.chat.create";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "kael.assistant";
    method: "POST";
    roles: UserRole[];
  }
  | {
    kind: "kael.chat.get";
    method: "GET";
    sessionId: string;
    roles: UserRole[];
  }
  | {
    kind: "kael.chat.progress";
    method: "GET";
    sessionId: string;
    roles: UserRole[];
  }
  | {
    kind: "kael.chat.stream";
    method: "POST";
    sessionId: string;
    roles: UserRole[];
  }
  | {
    kind: "kael.chat.turn";
    method: "POST";
    sessionId: string;
    roles: UserRole[];
  }
  | {
    kind: "kael.chat.confirm";
    method: "POST";
    sessionId: string;
    roles: UserRole[];
  }
  | {
    kind: "kael.chat.evidence";
    method: "POST";
    sessionId: string;
    roles: UserRole[];
  }
  | { kind: "jobs.get"; method: "GET"; jobId: string; roles?: UserRole[] }
  | {
    kind: "jobs.confirmSearch";
    method: "POST";
    jobId: string;
    roles: UserRole[];
  }
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
  | {
    kind: "jobs.messages.list";
    method: "GET";
    jobId: string;
    roles: UserRole[];
  }
  | {
    kind: "jobs.messages.send";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "scope.decide";
    method: "POST";
    scopeChangeId: string;
    roles: UserRole[];
  }
  | {
    kind: "workerCancellation.decide";
    method: "POST";
    cancellationId: string;
    roles: UserRole[];
  }
  | {
    kind: "disputes.counterStatement";
    method: "POST";
    disputeId: string;
    roles: UserRole[];
  }
  | {
    kind: "disputes.adminDecision";
    method: "POST";
    disputeId: string;
    roles: UserRole[];
  }
  | {
    kind: "jobs.confirmCompletion";
    method: "POST";
    jobId: string;
    roles: UserRole[];
  }
  | {
    kind: "jobs.paymentIntent";
    method: "POST";
    jobId: string;
    roles: UserRole[];
  }
  | {
    kind: "jobs.stagingPaymentConfirm";
    method: "POST";
    jobId: string;
    roles: UserRole[];
  }
  | {
    kind: "jobs.review";
    method: "POST";
    jobId: string;
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "workers.register";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "me.kaelMemory"; method: "GET"; roles: UserRole[] }
  | { kind: "me.kaelMemory.delete"; method: "DELETE"; roles: UserRole[] }
  | { kind: "me.kaelMemory.update"; method: "PATCH"; roles: UserRole[] }
  | { kind: "me.pendingDecisions"; method: "GET"; roles: UserRole[] }
  | { kind: "me.profileInsights"; method: "GET"; roles: UserRole[] }
  | { kind: "me.threads"; method: "GET"; roles: UserRole[] }
  | {
    kind: "me.kaelFeedback";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | {
    kind: "workerApplications.submit";
    method: "POST";
    roles: UserRole[];
    successStatus: 201;
  }
  | { kind: "me.jobs.active"; method: "GET"; roles: UserRole[] }
  | { kind: "me.jobs.history"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.me"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.avatarUpload"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "workers.avatar"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.activityMinute"; method: "POST"; roles: UserRole[] }
  | { kind: "workers.performanceInsights"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.serviceArea"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.kaelMemory"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.kaelFeedback"; method: "POST"; roles: UserRole[]; successStatus: 201 }
  | { kind: "workers.kaelTrainingConsent.get"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.kaelTrainingConsent.set"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.availability"; method: "PATCH"; roles: UserRole[] }
  | { kind: "workers.broadcasts"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.jobs"; method: "GET"; roles: UserRole[] }
  | { kind: "workers.earnings"; method: "GET"; roles: UserRole[] }
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
  }
  | { kind: "notifications"; method: "GET"; roles: UserRole[] }
  | { kind: "notifications.deviceToken"; method: "POST"; roles: UserRole[] }
  | {
    kind: "notifications.deviceToken.unregister";
    method: "DELETE";
    roles: UserRole[];
  }
  | {
    kind: "notifications.read";
    method: "POST";
    notificationId: string;
    roles: UserRole[];
  };

export function matchRoute(request: Request): Route | null {
  const path = normalizePath(new URL(request.url).pathname);
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/services") {
    return { kind: "services", method: "GET" };
  }
  if (method === "GET" && path === "/kael/charter") {
    return { kind: "kael.charter", method: "GET", public: true };
  }
  if (method === "POST" && path === "/places/autocomplete") {
    return {
      kind: "places.autocomplete",
      method: "POST",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "POST" && path === "/places/resolve") {
    return {
      kind: "places.resolve",
      method: "POST",
      roles: ["customer", "worker", "admin"],
    };
  }
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
    const candidateId = safeDecodePathSegment(learningCandidate[1] ?? "");
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
  if (method === "POST" && path === "/jobs") {
    return {
      kind: "jobs.create",
      method: "POST",
      roles: ["customer", "admin"],
      successStatus: 201,
    };
  }
  if (method === "GET" && path === "/me/jobs/active") {
    return { kind: "me.jobs.active", method: "GET", roles: ["customer", "admin"] };
  }
  if (method === "GET" && path === "/me/jobs/history") {
    return { kind: "me.jobs.history", method: "GET", roles: ["customer", "admin"] };
  }
  if (method === "GET" && path === "/me/pending-decisions") {
    return { kind: "me.pendingDecisions", method: "GET", roles: ["customer", "admin"] };
  }
  if (method === "GET" && path === "/me/profile-insights") {
    return { kind: "me.profileInsights", method: "GET", roles: ["customer", "admin"] };
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
  const customerKaelConversationRoute = matchCustomerKaelConversationRoute(
    path,
    method,
    safeDecodePathSegment,
  );
  if (customerKaelConversationRoute) return customerKaelConversationRoute;
  if (method === "POST" && path === "/kael/chat") {
    return {
      kind: "kael.chat.create",
      method: "POST",
      roles: ["customer", "admin"],
      successStatus: 201,
    };
  }
  if (method === "POST" && path === "/kael/assistant") {
    return {
      kind: "kael.assistant",
      method: "POST",
      roles: ["customer"],
    };
  }
  const caseWorkResourceRoute = matchCaseWorkResourceRoute(path, method, safeDecodePathSegment);
  if (caseWorkResourceRoute) return caseWorkResourceRoute;
  const kaelChat = path.match(/^\/kael\/chat\/([^/]+)(?:\/([^/]+))?$/);
  if (kaelChat) {
    const sessionId = safeDecodePathSegment(kaelChat[1] ?? "");
    if (!sessionId) return null;
    const action = kaelChat[2];
    if (!action && method === "GET") {
      return {
        kind: "kael.chat.get",
        method: "GET",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
    if (!action && method === "POST") {
      return {
        kind: "kael.chat.turn",
        method: "POST",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
    if (action === "progress" && method === "GET") {
      return {
        kind: "kael.chat.progress",
        method: "GET",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
    if (action === "stream" && method === "POST") {
      return {
        kind: "kael.chat.stream",
        method: "POST",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
    if (action === "confirm" && method === "POST") {
      return {
        kind: "kael.chat.confirm",
        method: "POST",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
    if (action === "evidence" && method === "POST") {
      return {
        kind: "kael.chat.evidence",
        method: "POST",
        sessionId,
        roles: ["customer", "admin"],
      };
    }
  }
  if (method === "GET" && path === "/notifications") {
    return {
      kind: "notifications",
      method: "GET",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "POST" && path === "/notifications/device-token") {
    return {
      kind: "notifications.deviceToken",
      method: "POST",
      roles: ["customer", "worker", "admin"],
    };
  }
  if (method === "DELETE" && path === "/notifications/device-token") {
    return {
      kind: "notifications.deviceToken.unregister",
      method: "DELETE",
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
  if (method === "GET" && path === "/workers/me/kael-memory") {
    return { kind: "workers.kaelMemory", method: "GET", roles: ["worker", "admin"] };
  }
  const workerKaelChatRoute = matchWorkerKaelChatRoute(path, method, safeDecodePathSegment);
  if (workerKaelChatRoute) return workerKaelChatRoute;
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
  if (method === "GET" && path === "/workers/me/jobs") {
    return { kind: "workers.jobs", method: "GET", roles: ["worker", "admin"] };
  }
  if (method === "GET" && path === "/workers/me/earnings") {
    return { kind: "workers.earnings", method: "GET", roles: ["worker", "admin"] };
  }

  const accessAuthorize = path.match(/^\/jobs\/([^/]+)\/access\/authorize$/);
  if (method === "POST" && accessAuthorize) {
    const accessAuthorizeJobId = safeDecodePathSegment(accessAuthorize[1] ?? "");
    if (!accessAuthorizeJobId) return null;
    return {
      kind: "jobs.accessAuthorize",
      method: "POST",
      jobId: accessAuthorizeJobId,
      roles: ["customer", "admin"],
    };
  }
  const job = path.match(/^\/jobs\/([^/]+)(?:\/([^/]+))?$/);
  if (job) {
    const jobId = safeDecodePathSegment(job[1] ?? "");
    if (!jobId) return null;
    const action = job[2];
    if (!action && method === "GET") {
      return { kind: "jobs.get", method: "GET", jobId };
    }
    if (action === "confirm-search" && method === "POST") {
      return {
        kind: "jobs.confirmSearch",
        method: "POST",
        jobId,
        roles: ["customer", "admin"],
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
    if (action === "confirm-completion" && method === "POST") {
      return {
        kind: "jobs.confirmCompletion",
        method: "POST",
        jobId,
        roles: ["customer", "admin"],
      };
    }
    const stagingPaymentRoute = matchStagingPaymentRoute(action, method, jobId);
    if (stagingPaymentRoute) return stagingPaymentRoute;
    if (action === "review" && method === "POST") {
      return {
        kind: "jobs.review",
        method: "POST",
        jobId,
        roles: ["customer", "admin"],
        successStatus: 201,
      };
    }
  }

  const scope = path.match(/^\/scope-changes\/([^/]+)\/decide$/);
  if (scope && method === "POST") {
    const scopeChangeId = safeDecodePathSegment(scope[1] ?? "");
    if (!scopeChangeId) return null;
    return {
      kind: "scope.decide",
      method: "POST",
      scopeChangeId,
      roles: ["customer", "admin"],
    };
  }

  const workerCancellation = path.match(
    /^\/worker-cancellations\/([^/]+)\/decide$/,
  );
  if (workerCancellation && method === "POST") {
    const cancellationId = safeDecodePathSegment(workerCancellation[1] ?? "");
    if (!cancellationId) return null;
    return {
      kind: "workerCancellation.decide",
      method: "POST",
      cancellationId,
      roles: ["admin"],
    };
  }

  const dispute = path.match(/^\/disputes\/([^/]+)\/([^/]+)$/);
  if (dispute && method === "POST") {
    const disputeId = safeDecodePathSegment(dispute[1] ?? "");
    const action = dispute[2];
    if (!disputeId) return null;
    if (action === "counter-statement") {
      return {
        kind: "disputes.counterStatement",
        method: "POST",
        disputeId,
        roles: ["customer", "worker", "admin"],
      };
    }
    if (action === "admin-decision") {
      return {
        kind: "disputes.adminDecision",
        method: "POST",
        disputeId,
        roles: ["admin"],
      };
    }
  }

  const notification = path.match(/^\/notifications\/([^/]+)\/read$/);
  if (notification && method === "POST") {
    const notificationId = safeDecodePathSegment(notification[1] ?? "");
    if (!notificationId) return null;
    return {
      kind: "notifications.read",
      method: "POST",
      notificationId,
      roles: ["customer", "worker", "admin"],
    };
  }

  return null;
}

export function isPublicRoute(route: Route): route is PublicRoute {
  return "public" in route && route.public === true;
}

function safeDecodePathSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function normalizePath(pathname: string): string {
  const withoutFunctionsPrefix = pathname.replace(
    /^\/functions\/v1\/mobile-api(?=\/|$)/,
    "",
  );
  const withoutFunctionPrefix = withoutFunctionsPrefix.replace(
    /^\/mobile-api(?=\/|$)/,
    "",
  );
  const clean = withoutFunctionPrefix || "/";
  return clean.endsWith("/") && clean.length > 1 ? clean.slice(0, -1) : clean;
}
