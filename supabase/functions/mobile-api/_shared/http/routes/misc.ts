import type { UserRole } from "../../../../_shared/domain.ts";

export type CatalogRoute =
  | { kind: "services"; method: "GET"; roles?: UserRole[] }
  | { kind: "places.autocomplete"; method: "POST"; roles: UserRole[] }
  | { kind: "places.resolve"; method: "POST"; roles: UserRole[] };

export type CaseResolutionRoute =
  | { kind: "scope.decide"; method: "POST"; scopeChangeId: string; roles: UserRole[] }
  | { kind: "disputes.counterStatement"; method: "POST"; disputeId: string; roles: UserRole[] }
  | { kind: "disputes.adminDecision"; method: "POST"; disputeId: string; roles: UserRole[] };

// Two matchers, not one: these branches sit at opposite ends of the matcher chain. The catalog
// routes are matched first, the case-resolution routes are among the last. Collapsing them into
// a single call would move the case-resolution branches ahead of every route in between.
export function matchCatalogRoute(path: string, method: string): CatalogRoute | null {
  if (method === "GET" && path === "/services") {
    return { kind: "services", method: "GET" };
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
  return null;
}

export function matchCaseResolutionRoute(
  path: string,
  method: string,
  decodePathSegment: (value: string) => string | null,
): CaseResolutionRoute | null {
  const scope = path.match(/^\/scope-changes\/([^/]+)\/decide$/);
  if (scope && method === "POST") {
    const scopeChangeId = decodePathSegment(scope[1] ?? "");
    if (!scopeChangeId) return null;
    return {
      kind: "scope.decide",
      method: "POST",
      scopeChangeId,
      roles: ["customer", "admin"],
    };
  }

  const dispute = path.match(/^\/disputes\/([^/]+)\/([^/]+)$/);
  if (dispute && method === "POST") {
    const disputeId = decodePathSegment(dispute[1] ?? "");
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

  return null;
}
