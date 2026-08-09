type AdminReadRoles = ["admin", "admin_operator"];

export type AdminControlRoute =
  | { kind: "admin.operations.get"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.governance.disputes"; method: "GET"; roles: ["admin"] }
  | { kind: "admin.governance.priceBaselines"; method: "GET"; roles: ["admin"] }
  | { kind: "admin.governance.aiCosts"; method: "GET"; roles: ["admin"] }
  | { kind: "admin.governance.learningRules"; method: "GET"; roles: ["admin"] }
  | { kind: "admin.workerApplications.list"; method: "GET"; roles: AdminReadRoles }
  | {
    kind: "admin.workerApplications.detail";
    method: "GET";
    applicationId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.workerApplications.decision";
    method: "POST";
    applicationId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.workers.access";
    method: "POST";
    workerId: string;
    roles: AdminReadRoles;
  }
  | { kind: "admin.transactions.list"; method: "GET"; roles: AdminReadRoles }
  | {
    kind: "admin.transactions.detail";
    method: "GET";
    jobId: string;
    roles: AdminReadRoles;
  }
  | { kind: "admin.payoutMethods.list"; method: "GET"; roles: AdminReadRoles }
  | {
    kind: "admin.payoutMethods.detail";
    method: "GET";
    payoutMethodId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.payoutMethods.decision";
    method: "POST";
    payoutMethodId: string;
    roles: AdminReadRoles;
  }
  | { kind: "admin.withdrawalRequests.list"; method: "GET"; roles: AdminReadRoles }
  | {
    kind: "admin.withdrawalRequests.detail";
    method: "GET";
    withdrawalRequestId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.withdrawalRequests.claim";
    method: "POST";
    withdrawalRequestId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.withdrawalRequests.resolve";
    method: "POST";
    withdrawalRequestId: string;
    roles: AdminReadRoles;
  }
  | { kind: "admin.subAdmins.list"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.subAdmins.accounts"; method: "GET"; roles: ["admin"] }
  | {
    kind: "admin.managerNominations.nominate";
    method: "POST";
    userId: string;
    roles: ["admin"];
  }
  | {
    kind: "admin.managerNominations.cancel";
    method: "POST";
    nominationId: string;
    roles: ["admin"];
  }
  | {
    kind: "admin.subAdmins.access";
    method: "POST";
    userId: string;
    roles: ["admin"];
  };

const adminReadRoles: AdminReadRoles = ["admin", "admin_operator"];

export function matchAdminControlRoute(
  path: string,
  method: string,
): AdminControlRoute | null {
  if (method === "GET" && path === "/admin/operations") {
    return { kind: "admin.operations.get", method: "GET", roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/governance/disputes") {
    return { kind: "admin.governance.disputes", method: "GET", roles: ["admin"] };
  }
  if (method === "GET" && path === "/admin/governance/price-baselines") {
    return { kind: "admin.governance.priceBaselines", method: "GET", roles: ["admin"] };
  }
  if (method === "GET" && path === "/admin/governance/ai-costs") {
    return { kind: "admin.governance.aiCosts", method: "GET", roles: ["admin"] };
  }
  if (method === "GET" && path === "/admin/governance/learning-rules") {
    return { kind: "admin.governance.learningRules", method: "GET", roles: ["admin"] };
  }
  if (method === "GET" && path === "/admin/worker-applications") {
    return { kind: "admin.workerApplications.list", method: "GET", roles: adminReadRoles };
  }
  const workerApplicationDecision = path.match(
    /^\/admin\/worker-applications\/([^/]+)\/decision$/,
  );
  if (workerApplicationDecision && method === "POST") {
    const applicationId = decodeSegment(workerApplicationDecision[1] ?? "");
    if (!applicationId) return null;
    return {
      kind: "admin.workerApplications.decision",
      method: "POST",
      applicationId,
      roles: adminReadRoles,
    };
  }
  const workerApplicationDetail = path.match(
    /^\/admin\/worker-applications\/([^/]+)$/,
  );
  if (workerApplicationDetail && method === "GET") {
    const applicationId = decodeSegment(workerApplicationDetail[1] ?? "");
    if (!applicationId) return null;
    return {
      kind: "admin.workerApplications.detail",
      method: "GET",
      applicationId,
      roles: adminReadRoles,
    };
  }
  const workerAccess = path.match(/^\/admin\/workers\/([^/]+)\/access$/);
  if (workerAccess && method === "POST") {
    const workerId = decodeSegment(workerAccess[1] ?? "");
    if (!workerId) return null;
    return {
      kind: "admin.workers.access",
      method: "POST",
      workerId,
      roles: adminReadRoles,
    };
  }
  if (method === "GET" && path === "/admin/transactions") {
    return { kind: "admin.transactions.list", method: "GET", roles: adminReadRoles };
  }
  const transactionDetail = path.match(/^\/admin\/transactions\/([^/]+)$/);
  if (transactionDetail && method === "GET") {
    const jobId = decodeSegment(transactionDetail[1] ?? "");
    if (!jobId) return null;
    return {
      kind: "admin.transactions.detail",
      method: "GET",
      jobId,
      roles: adminReadRoles,
    };
  }
  if (method === "GET" && path === "/admin/payout-methods") {
    return { kind: "admin.payoutMethods.list", method: "GET", roles: adminReadRoles };
  }
  const payoutMethodDecision = path.match(/^\/admin\/payout-methods\/([^/]+)\/decision$/);
  if (payoutMethodDecision && method === "POST") {
    const payoutMethodId = decodeSegment(payoutMethodDecision[1] ?? "");
    if (!payoutMethodId) return null;
    return {
      kind: "admin.payoutMethods.decision",
      method: "POST",
      payoutMethodId,
      roles: adminReadRoles,
    };
  }
  const payoutMethodDetail = path.match(/^\/admin\/payout-methods\/([^/]+)$/);
  if (payoutMethodDetail && method === "GET") {
    const payoutMethodId = decodeSegment(payoutMethodDetail[1] ?? "");
    if (!payoutMethodId) return null;
    return {
      kind: "admin.payoutMethods.detail",
      method: "GET",
      payoutMethodId,
      roles: adminReadRoles,
    };
  }
  if (method === "GET" && path === "/admin/withdrawal-requests") {
    return { kind: "admin.withdrawalRequests.list", method: "GET", roles: adminReadRoles };
  }
  const withdrawalRequestResolve = path.match(/^\/admin\/withdrawal-requests\/([^/]+)\/resolve$/);
  if (withdrawalRequestResolve && method === "POST") {
    const withdrawalRequestId = decodeSegment(withdrawalRequestResolve[1] ?? "");
    if (!withdrawalRequestId) return null;
    return {
      kind: "admin.withdrawalRequests.resolve",
      method: "POST",
      withdrawalRequestId,
      roles: adminReadRoles,
    };
  }
  const withdrawalRequestClaim = path.match(/^\/admin\/withdrawal-requests\/([^/]+)\/claim$/);
  if (withdrawalRequestClaim && method === "POST") {
    const withdrawalRequestId = decodeSegment(withdrawalRequestClaim[1] ?? "");
    if (!withdrawalRequestId) return null;
    return {
      kind: "admin.withdrawalRequests.claim",
      method: "POST",
      withdrawalRequestId,
      roles: adminReadRoles,
    };
  }
  const withdrawalRequestDetail = path.match(/^\/admin\/withdrawal-requests\/([^/]+)$/);
  if (withdrawalRequestDetail && method === "GET") {
    const withdrawalRequestId = decodeSegment(withdrawalRequestDetail[1] ?? "");
    if (!withdrawalRequestId) return null;
    return {
      kind: "admin.withdrawalRequests.detail",
      method: "GET",
      withdrawalRequestId,
      roles: adminReadRoles,
    };
  }
  if (method === "GET" && path === "/admin/sub-admins") {
    return { kind: "admin.subAdmins.list", method: "GET", roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/sub-admins/accounts") {
    return { kind: "admin.subAdmins.accounts", method: "GET", roles: ["admin"] };
  }
  const managerNominationCancel = path.match(/^\/admin\/manager-nominations\/([^/]+)\/cancel$/);
  if (managerNominationCancel && method === "POST") {
    const nominationId = decodeSegment(managerNominationCancel[1] ?? "");
    if (!nominationId) return null;
    return {
      kind: "admin.managerNominations.cancel",
      method: "POST",
      nominationId,
      roles: ["admin"],
    };
  }
  const managerNomination = path.match(/^\/admin\/manager-nominations\/([^/]+)$/);
  if (managerNomination && method === "POST") {
    const userId = decodeSegment(managerNomination[1] ?? "");
    if (!userId) return null;
    return {
      kind: "admin.managerNominations.nominate",
      method: "POST",
      userId,
      roles: ["admin"],
    };
  }
  const subAdminAccess = path.match(/^\/admin\/sub-admins\/([^/]+)\/access$/);
  if (subAdminAccess && method === "POST") {
    const userId = decodeSegment(subAdminAccess[1] ?? "");
    if (!userId) return null;
    return {
      kind: "admin.subAdmins.access",
      method: "POST",
      userId,
      roles: ["admin"],
    };
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
