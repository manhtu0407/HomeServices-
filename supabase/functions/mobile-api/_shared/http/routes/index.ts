import { matchAdminRoute, type AdminRoute } from "./admin.ts";
import { matchCaseWorkResourceRoute, type CaseWorkResourceRoute } from "./case-work-resource-routes.ts";
import { matchWorkerKaelChatRoute, type WorkerKaelChatRoute } from "./worker-kael-chat-routes.ts";
import { matchCustomerKaelConversationRoute, type CustomerKaelConversationRoute } from "./customer-kael-conversation-routes.ts";
import { matchCustomerKaelChatSessionRoute, type CustomerKaelChatSessionRoute } from "./kael-chat-session-routes.ts";
import {
  matchJobCreateRoute,
  matchJobResourceRoute,
  type JobCreateRoute,
  type JobResourceRoute,
} from "./job.ts";
import { matchKaelRoute, type KaelRoute } from "./kael.ts";
import { matchMeRoute, type MeRoute } from "./me.ts";
import {
  matchCaseResolutionRoute,
  matchCatalogRoute,
  type CaseResolutionRoute,
  type CatalogRoute,
} from "./misc.ts";
import {
  matchNotificationReadRoute,
  matchNotificationRoute,
  type NotificationReadRoute,
  type NotificationRoute,
} from "./notifications.ts";
import { matchWorkerRoute, type WorkerRoute } from "./worker.ts";

export type PublicRoute = { kind: "kael.charter"; method: "GET"; public: true };

export type Route =
  | PublicRoute
  | CatalogRoute
  | CaseWorkResourceRoute
  | WorkerKaelChatRoute
  | CustomerKaelConversationRoute
  | CustomerKaelChatSessionRoute
  | JobCreateRoute
  | KaelRoute
  | JobResourceRoute
  | CaseResolutionRoute
  | MeRoute
  | WorkerRoute
  | AdminRoute
  | NotificationRoute
  | NotificationReadRoute;

// The order of these calls IS the routing contract. Every branch below is either an exact
// literal or an anchored regex, and several matchers claim overlapping prefixes
// ("/jobs/:id/..." is shared by the case-work matcher and the job resource matcher), so a
// reordered call changes which route a path resolves to without changing any path string.
export function matchRoute(request: Request): Route | null {
  const path = normalizePath(new URL(request.url).pathname);
  const method = request.method.toUpperCase();

  const catalogRoute = matchCatalogRoute(path, method);
  if (catalogRoute) return catalogRoute;
  if (method === "GET" && path === "/kael/charter") {
    return { kind: "kael.charter", method: "GET", public: true };
  }
  const adminRoute = matchAdminRoute(path, method, safeDecodePathSegment);
  if (adminRoute) return adminRoute;
  const jobCreateRoute = matchJobCreateRoute(path, method);
  if (jobCreateRoute) return jobCreateRoute;
  const meRoute = matchMeRoute(path, method);
  if (meRoute) return meRoute;
  const customerKaelConversationRoute = matchCustomerKaelConversationRoute(
    path,
    method,
    safeDecodePathSegment,
  );
  if (customerKaelConversationRoute) return customerKaelConversationRoute;
  const kaelRoute = matchKaelRoute(path, method);
  if (kaelRoute) return kaelRoute;
  const caseWorkResourceRoute = matchCaseWorkResourceRoute(path, method, safeDecodePathSegment);
  if (caseWorkResourceRoute) return caseWorkResourceRoute;
  const customerKaelChatSessionRoute = matchCustomerKaelChatSessionRoute(
    path,
    method,
    safeDecodePathSegment,
  );
  if (customerKaelChatSessionRoute) return customerKaelChatSessionRoute;
  const notificationRoute = matchNotificationRoute(path, method);
  if (notificationRoute) return notificationRoute;
  const workerRoute = matchWorkerRoute(path, method);
  if (workerRoute) return workerRoute;
  const workerKaelChatRoute = matchWorkerKaelChatRoute(path, method, safeDecodePathSegment);
  if (workerKaelChatRoute) return workerKaelChatRoute;
  const jobResourceRoute = matchJobResourceRoute(path, method, safeDecodePathSegment);
  if (jobResourceRoute) return jobResourceRoute;
  const caseResolutionRoute = matchCaseResolutionRoute(path, method, safeDecodePathSegment);
  if (caseResolutionRoute) return caseResolutionRoute;
  const notificationReadRoute = matchNotificationReadRoute(path, method, safeDecodePathSegment);
  if (notificationReadRoute) return notificationReadRoute;

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
