type AdminReadRoles = ["admin", "admin_operator"];

export type SystemHealthAdminRoute =
  | { kind: "admin.system.health.get"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.system.health.refresh"; method: "POST"; roles: ["admin"] }
  | { kind: "admin.system.incidents.list"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.system.incidents.detail"; method: "GET"; incidentId: string; roles: AdminReadRoles }
  | { kind: "admin.system.incidents.export"; method: "GET"; incidentId: string; roles: AdminReadRoles };

const adminReadRoles: AdminReadRoles = ["admin", "admin_operator"];
const systemHealthIncidentId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function matchSystemHealthAdminRoute(path: string, method: string): SystemHealthAdminRoute | null {
  if (method === "GET" && path === "/admin/system/health") return { kind: "admin.system.health.get", method: "GET", roles: adminReadRoles };
  if (method === "POST" && path === "/admin/system/health/refresh") return { kind: "admin.system.health.refresh", method: "POST", roles: ["admin"] };
  if (method === "GET" && path === "/admin/system/incidents") return { kind: "admin.system.incidents.list", method: "GET", roles: adminReadRoles };

  const incidentExport = path.match(/^\/admin\/system\/incidents\/([^/]+)\/export$/u);
  if (method === "GET" && incidentExport) {
    const incidentId = decodeSegment(incidentExport[1] ?? "");
    return incidentId && systemHealthIncidentId.test(incidentId)
      ? { kind: "admin.system.incidents.export", method: "GET", incidentId, roles: adminReadRoles }
      : null;
  }

  const incidentDetail = path.match(/^\/admin\/system\/incidents\/([^/]+)$/u);
  if (method === "GET" && incidentDetail) {
    const incidentId = decodeSegment(incidentDetail[1] ?? "");
    return incidentId && systemHealthIncidentId.test(incidentId)
      ? { kind: "admin.system.incidents.detail", method: "GET", incidentId, roles: adminReadRoles }
      : null;
  }

  return null;
}

function decodeSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}
