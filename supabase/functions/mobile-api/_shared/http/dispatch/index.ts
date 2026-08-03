import type { MobileApiContext, MobileApiServices } from "../contracts.ts";
import { dispatchAdminRoute } from "./admin.ts";
import { dispatchCustomerRoute } from "./customer.ts";
import { dispatchJobRoute } from "./job.ts";
import { dispatchKaelRoute } from "./kael.ts";
import { dispatchMeRoute } from "./me.ts";
import { dispatchMiscRoute } from "./misc.ts";
import { dispatchWorkerRoute } from "./worker.ts";
import {
  isAdminRoute,
  isCustomerRoute,
  isJobRoute,
  isKaelRoute,
  isMeRoute,
  isWorkerRoute,
  type DispatchableRoute,
} from "./kinds.ts";

// Unlike matchRoute, this chain is order-independent: every route kind belongs to exactly one
// group, so the guards are mutually exclusive. Misc is last because it is defined as the
// remainder — anything the six named groups do not claim.
export function dispatchRoute(
  route: DispatchableRoute,
  request: Request,
  ctx: MobileApiContext,
  services: MobileApiServices,
): Promise<unknown> {
  if (isJobRoute(route)) return dispatchJobRoute(route, request, ctx, services);
  if (isWorkerRoute(route)) return dispatchWorkerRoute(route, request, ctx, services);
  if (isMeRoute(route)) return dispatchMeRoute(route, request, ctx, services);
  if (isKaelRoute(route)) return dispatchKaelRoute(route, request, ctx, services);
  if (isCustomerRoute(route)) return dispatchCustomerRoute(route, request, ctx, services);
  if (isAdminRoute(route)) return dispatchAdminRoute(route, request, ctx, services);
  return dispatchMiscRoute(route, request, ctx, services);
}
