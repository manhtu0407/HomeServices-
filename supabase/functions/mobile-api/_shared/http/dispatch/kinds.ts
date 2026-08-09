import type { PublicRoute, Route } from "../routes/index.ts";

// Public routes are answered before dispatch, so they are not part of the dispatchable set.
export type DispatchableRoute = Exclude<Route, PublicRoute>;

// Groups are cut along the route-kind namespace rather than a hand-kept list, so the runtime
// predicate below and the type it narrows to are the same rule stated twice. A route that
// belongs to no group lands in MiscDispatchRoute by construction; a route that no dispatcher
// handles is a compile error at the assertNever call in that dispatcher.
export type JobDispatchRoute = Extract<DispatchableRoute, { kind: `jobs.${string}` }>;
export type WorkerDispatchRoute = Extract<
  DispatchableRoute,
  { kind: `workers.${string}` | "workerApplications.submit" }
>;
export type MeDispatchRoute = Extract<DispatchableRoute, { kind: `me.${string}` }>;
export type KaelDispatchRoute = Extract<DispatchableRoute, { kind: `kael.${string}` }>;
export type CustomerDispatchRoute = Extract<DispatchableRoute, { kind: `customer.${string}` }>;
export type AdminDispatchRoute = Extract<DispatchableRoute, { kind: `admin.${string}` }>;
export type MiscDispatchRoute = Exclude<
  DispatchableRoute,
  | JobDispatchRoute
  | WorkerDispatchRoute
  | MeDispatchRoute
  | KaelDispatchRoute
  | CustomerDispatchRoute
  | AdminDispatchRoute
>;

export const isJobRoute = (route: DispatchableRoute): route is JobDispatchRoute =>
  route.kind.startsWith("jobs.");

export const isWorkerRoute = (route: DispatchableRoute): route is WorkerDispatchRoute =>
  route.kind.startsWith("workers.") ||
  route.kind === "workerApplications.submit";

export const isMeRoute = (route: DispatchableRoute): route is MeDispatchRoute =>
  route.kind.startsWith("me.");

export const isKaelRoute = (route: DispatchableRoute): route is KaelDispatchRoute =>
  route.kind.startsWith("kael.");

export const isCustomerRoute = (route: DispatchableRoute): route is CustomerDispatchRoute =>
  route.kind.startsWith("customer.");

export const isAdminRoute = (route: DispatchableRoute): route is AdminDispatchRoute =>
  route.kind.startsWith("admin.");

export function assertNever(route: never): never {
  throw new Error(`unhandled route kind: ${(route as { kind: string }).kind}`);
}
