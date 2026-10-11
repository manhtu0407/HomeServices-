import {
  exportAdminSystemIncident,
  getAdminSystemHealth,
  getAdminSystemIncident,
  listAdminSystemIncidents,
  refreshAdminSystemHealth,
} from "./admin/system.ts";

export function createSystemHealthAdminServices() {
  return {
    getAdminSystemHealth,
    refreshAdminSystemHealth,
    listAdminSystemIncidents,
    getAdminSystemIncident,
    exportAdminSystemIncident,
  };
}
