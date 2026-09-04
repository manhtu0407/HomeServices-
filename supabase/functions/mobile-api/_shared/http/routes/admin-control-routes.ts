type AdminReadRoles = ["admin", "admin_operator"];

export type AdminControlRoute =
  | { kind: "admin.actor.get"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.operations.get"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.overview.details"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.operations.scopeChanges.list"; method: "GET"; roles: AdminReadRoles }
  | {
    kind: "admin.operations.scopeChanges.detail";
    method: "GET";
    scopeChangeId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.operations.scopeChanges.evidenceAccess";
    method: "POST";
    scopeChangeId: string;
    roles: AdminReadRoles;
  }
  | { kind: "admin.operations.supportCases.list"; method: "GET"; roles: AdminReadRoles }
  | {
    kind: "admin.operations.supportCases.detail";
    method: "GET";
    source: "dispute" | "queue";
    caseId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.operations.supportCases.preparation";
    method: "PUT";
    source: "dispute" | "queue";
    caseId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.operations.supportCases.evidenceAccess";
    method: "POST";
    source: "dispute" | "queue";
    caseId: string;
    roles: AdminReadRoles;
  }
  | { kind: "admin.governance.disputes"; method: "GET"; roles: ["admin"] }
  | { kind: "admin.governance.priceBaselines"; method: "GET"; roles: ["admin"] }
  | { kind: "admin.governance.aiCosts"; method: "GET"; roles: ["admin"] }
  | { kind: "admin.governance.learningRules"; method: "GET"; roles: ["admin"] }
  | { kind: "admin.governance.intakePolicies.list"; method: "GET"; roles: ["admin"] }
  | { kind: "admin.governance.intakePolicies.preview"; method: "POST"; roles: ["admin"] }
  | { kind: "admin.governance.intakePolicies.draft"; method: "POST"; roles: ["admin"] }
  | { kind: "admin.governance.intakePolicies.approve"; method: "POST"; policyId: string; roles: ["admin"] }
  | { kind: "admin.governance.intakePolicies.publish"; method: "POST"; policyId: string; roles: ["admin"] }
  | { kind: "admin.governance.intakePolicies.rollback"; method: "POST"; policyId: string; roles: ["admin"] }
  | { kind: "admin.governance.priceBaselineVersions.list"; method: "GET"; roles: ["admin"] }
  | { kind: "admin.governance.priceBaselineVersions.draft"; method: "POST"; roles: ["admin"] }
  | { kind: "admin.governance.priceBaselineVersions.approve"; method: "POST"; baselineVersionId: string; roles: ["admin"] }
  | { kind: "admin.governance.priceBaselineVersions.publish"; method: "POST"; baselineVersionId: string; roles: ["admin"] }
  | { kind: "admin.governance.priceBaselineVersions.rollback"; method: "POST"; baselineVersionId: string; roles: ["admin"] }
  | { kind: "admin.system.priceBaselines.list"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.system.priceBaselines.detail"; method: "GET"; baselineId: string; roles: AdminReadRoles }
  | { kind: "admin.system.priceBaselines.evidencePackages"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.system.priceBaselines.validate"; method: "POST"; roles: AdminReadRoles }
  | { kind: "admin.system.priceBaselines.publish"; method: "POST"; roles: AdminReadRoles }
  | { kind: "admin.system.priceBaselines.retire"; method: "POST"; baselineId: string; roles: AdminReadRoles }
  | { kind: "admin.system.taxonomy.list"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.system.taxonomy.detail"; method: "GET"; serviceType: string; roles: AdminReadRoles }
  | { kind: "admin.system.taxonomy.validate"; method: "POST"; serviceType: string; roles: AdminReadRoles }
  | { kind: "admin.system.taxonomy.update"; method: "PUT"; serviceType: string; roles: AdminReadRoles }
  | { kind: "admin.system.learningRules.list"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.system.learningRules.detail"; method: "GET"; ruleId: string; roles: AdminReadRoles }
  | { kind: "admin.system.learningRules.rollbackPreview"; method: "POST"; ruleId: string; roles: AdminReadRoles }
  | { kind: "admin.system.learningRules.rollback"; method: "POST"; ruleId: string; roles: AdminReadRoles }
  | { kind: "admin.system.learningRules.revokePreview"; method: "POST"; ruleId: string; roles: AdminReadRoles }
  | { kind: "admin.system.learningRules.revoke"; method: "POST"; ruleId: string; roles: AdminReadRoles }
  | { kind: "admin.system.modelHealth.list"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.system.modelHealth.detail"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.workerApplications.list"; method: "GET"; roles: AdminReadRoles }
  | {
    kind: "admin.workerApplications.detail";
    method: "GET";
    applicationId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.workerApplications.reviewDetail";
    method: "GET";
    applicationId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.workerApplications.profileDecision";
    method: "POST";
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
  | {
    kind: "admin.workers.financeSnapshot";
    method: "GET";
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
  | { kind: "admin.paymentReconciliations.list"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.paymentReconciliations.detail"; method: "GET"; paymentOrderId: string; roles: AdminReadRoles }
  | { kind: "admin.paymentReconciliations.claim"; method: "POST"; paymentOrderId: string; roles: AdminReadRoles }
  | { kind: "admin.paymentReconciliations.release"; method: "POST"; paymentOrderId: string; roles: AdminReadRoles }
  | {
    kind: "admin.paymentReconciliations.decision";
    method: "POST";
    paymentOrderId: string;
    roles: AdminReadRoles;
  }
  | { kind: "admin.finance.summary"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.finance.overview"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.finance.transactions"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.finance.transactionDetail"; method: "GET"; jobId: string; roles: AdminReadRoles }
  | { kind: "admin.finance.export"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.finance.taxPolicies.list"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.finance.taxPolicies.detail"; method: "GET"; policyId: string; roles: AdminReadRoles }
  | { kind: "admin.finance.taxPolicies.draft"; method: "POST"; roles: AdminReadRoles }
  | {
    kind: "admin.finance.taxPolicies.updateDraft";
    method: "PATCH";
    policyId: string;
    roles: AdminReadRoles;
  }
  | {
    kind: "admin.finance.taxPolicies.approve";
    method: "POST";
    policyId: string;
    roles: ["admin"];
  }
  | {
    kind: "admin.finance.taxPolicies.retire";
    method: "POST";
    policyId: string;
    roles: ["admin"];
  }
  | { kind: "admin.finance.balanceSnapshot"; method: "POST"; roles: AdminReadRoles }
  | { kind: "admin.finance.balanceSnapshots"; method: "GET"; roles: AdminReadRoles }
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
  | { kind: "admin.payoutMethods.sensitiveAccess"; method: "POST"; payoutMethodId: string; roles: AdminReadRoles }
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
  | { kind: "admin.withdrawalRequests.release"; method: "POST"; withdrawalRequestId: string; roles: AdminReadRoles }
  | { kind: "admin.withdrawalRequests.sensitiveAccess"; method: "POST"; withdrawalRequestId: string; roles: AdminReadRoles }
  | {
    kind: "admin.withdrawalRequests.resolve";
    method: "POST";
    withdrawalRequestId: string;
    roles: AdminReadRoles;
  }
  | { kind: "admin.subAdmins.list"; method: "GET"; roles: AdminReadRoles }
  | { kind: "admin.subAdmins.provision"; method: "POST"; roles: ["admin"] }
  | {
    kind: "admin.subAdmins.resetPassword";
    method: "POST";
    provisioningId: string;
    roles: ["admin"];
  }
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
  return matchAdminOperationsRoute(path, method)
    ?? matchAdminFinanceRoute(path, method)
    ?? matchAdminWorkerTransactionRoute(path, method)
    ?? matchAdminSystemRoute(path, method)
    ?? matchAdminPayoutRoute(path, method)
    ?? matchAdminTeamRoute(path, method);
}

function matchAdminSystemRoute(path: string, method: string): AdminControlRoute | null {
  if (method === "GET" && path === "/admin/system/price-baselines") return { kind: "admin.system.priceBaselines.list", method: "GET", roles: adminReadRoles };
  if (method === "GET" && path === "/admin/system/price-evidence-packages") return { kind: "admin.system.priceBaselines.evidencePackages", method: "GET", roles: adminReadRoles };
  if (method === "POST" && path === "/admin/system/price-baselines/validate") return { kind: "admin.system.priceBaselines.validate", method: "POST", roles: adminReadRoles };
  if (method === "POST" && path === "/admin/system/price-baselines/versions") return { kind: "admin.system.priceBaselines.publish", method: "POST", roles: adminReadRoles };
  const priceRetire = path.match(/^\/admin\/system\/price-baselines\/([^/]+)\/retire$/);
  if (method === "POST" && priceRetire) {
    const baselineId = decodeSegment(priceRetire[1] ?? "");
    return baselineId ? { kind: "admin.system.priceBaselines.retire", method: "POST", baselineId, roles: adminReadRoles } : null;
  }
  const priceDetail = path.match(/^\/admin\/system\/price-baselines\/([^/]+)$/);
  if (method === "GET" && priceDetail) {
    const baselineId = decodeSegment(priceDetail[1] ?? "");
    return baselineId ? { kind: "admin.system.priceBaselines.detail", method: "GET", baselineId, roles: adminReadRoles } : null;
  }
  if (method === "GET" && path === "/admin/system/taxonomy") return { kind: "admin.system.taxonomy.list", method: "GET", roles: adminReadRoles };
  const taxonomyAction = path.match(/^\/admin\/system\/taxonomy\/([^/]+)(?:\/(validate))?$/);
  if (taxonomyAction) {
    const serviceType = decodeSegment(taxonomyAction[1] ?? "");
    if (!serviceType) return null;
    if (method === "POST" && taxonomyAction[2] === "validate") return { kind: "admin.system.taxonomy.validate", method: "POST", serviceType, roles: adminReadRoles };
    if (method === "PUT" && !taxonomyAction[2]) return { kind: "admin.system.taxonomy.update", method: "PUT", serviceType, roles: adminReadRoles };
    if (method === "GET" && !taxonomyAction[2]) return { kind: "admin.system.taxonomy.detail", method: "GET", serviceType, roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/system/learning-rules") return { kind: "admin.system.learningRules.list", method: "GET", roles: adminReadRoles };
  const learningAction = path.match(/^\/admin\/system\/learning-rules\/([^/]+)(?:\/(rollback-preview|rollback|revoke-preview|revoke))?$/);
  if (learningAction) {
    const ruleId = decodeSegment(learningAction[1] ?? "");
    const action = learningAction[2] ?? null;
    if (!ruleId) return null;
    if (method === "GET" && action === null) return { kind: "admin.system.learningRules.detail", method: "GET", ruleId, roles: adminReadRoles };
    if (method === "POST" && action === "rollback-preview") return { kind: "admin.system.learningRules.rollbackPreview", method: "POST", ruleId, roles: adminReadRoles };
    if (method === "POST" && action === "rollback") return { kind: "admin.system.learningRules.rollback", method: "POST", ruleId, roles: adminReadRoles };
    if (method === "POST" && action === "revoke-preview") return { kind: "admin.system.learningRules.revokePreview", method: "POST", ruleId, roles: adminReadRoles };
    if (method === "POST" && action === "revoke") return { kind: "admin.system.learningRules.revoke", method: "POST", ruleId, roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/system/model-health") return { kind: "admin.system.modelHealth.list", method: "GET", roles: adminReadRoles };
  if (method === "GET" && path === "/admin/system/model-health/details") return { kind: "admin.system.modelHealth.detail", method: "GET", roles: adminReadRoles };
  return null;
}

function matchAdminFinanceRoute(
  path: string,
  method: string,
): AdminControlRoute | null {
  if (method === "GET" && path === "/admin/payment-reconciliations") {
    return { kind: "admin.paymentReconciliations.list", method: "GET", roles: adminReadRoles };
  }
  const reconciliationResource = path.match(/^\/admin\/payment-reconciliations\/([^/]+)(?:\/(claim|release))?$/);
  if (reconciliationResource) {
    const paymentOrderId = decodeSegment(reconciliationResource[1] ?? "");
    const action = reconciliationResource[2] ?? null;
    if (!paymentOrderId) return null;
    if (method === "GET" && action === null) {
      return { kind: "admin.paymentReconciliations.detail", method: "GET", paymentOrderId, roles: adminReadRoles };
    }
    if (method === "POST" && action === "claim") {
      return { kind: "admin.paymentReconciliations.claim", method: "POST", paymentOrderId, roles: adminReadRoles };
    }
    if (method === "POST" && action === "release") {
      return { kind: "admin.paymentReconciliations.release", method: "POST", paymentOrderId, roles: adminReadRoles };
    }
  }
  const reconciliationDecision = path.match(/^\/admin\/payment-reconciliations\/([^/]+)\/decision$/);
  if (method === "POST" && reconciliationDecision) {
    const paymentOrderId = decodeSegment(reconciliationDecision[1] ?? "");
    if (!paymentOrderId) return null;
    return {
      kind: "admin.paymentReconciliations.decision",
      method: "POST",
      paymentOrderId,
      roles: adminReadRoles,
    };
  }
  if (method === "GET" && path === "/admin/finance/summary") {
    return { kind: "admin.finance.summary", method: "GET", roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/finance/overview") {
    return { kind: "admin.finance.overview", method: "GET", roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/finance/transactions") {
    return { kind: "admin.finance.transactions", method: "GET", roles: adminReadRoles };
  }
  const financeTransactionDetail = path.match(/^\/admin\/finance\/transactions\/([^/]+)$/);
  if (method === "GET" && financeTransactionDetail) {
    const jobId = decodeSegment(financeTransactionDetail[1] ?? "");
    if (!jobId) return null;
    return { kind: "admin.finance.transactionDetail", method: "GET", jobId, roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/finance/export.csv") {
    return { kind: "admin.finance.export", method: "GET", roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/finance/tax-policies") {
    return { kind: "admin.finance.taxPolicies.list", method: "GET", roles: adminReadRoles };
  }
  const taxPolicyDetail = path.match(/^\/admin\/finance\/tax-policies\/([^/]+)$/);
  if (method === "GET" && taxPolicyDetail) {
    const policyId = decodeSegment(taxPolicyDetail[1] ?? "");
    if (!policyId) return null;
    return { kind: "admin.finance.taxPolicies.detail", method: "GET", policyId, roles: adminReadRoles };
  }
  if (method === "POST" && path === "/admin/finance/tax-policies/drafts") {
    return { kind: "admin.finance.taxPolicies.draft", method: "POST", roles: adminReadRoles };
  }
  const taxPolicyDraftUpdate = path.match(/^\/admin\/finance\/tax-policies\/([^/]+)\/draft$/);
  if (method === "PATCH" && taxPolicyDraftUpdate) {
    const policyId = decodeSegment(taxPolicyDraftUpdate[1] ?? "");
    if (!policyId) return null;
    return {
      kind: "admin.finance.taxPolicies.updateDraft",
      method: "PATCH",
      policyId,
      roles: adminReadRoles,
    };
  }
  const taxPolicyApproval = path.match(/^\/admin\/finance\/tax-policies\/([^/]+)\/approve$/);
  if (method === "POST" && taxPolicyApproval) {
    const policyId = decodeSegment(taxPolicyApproval[1] ?? "");
    if (!policyId) return null;
    return {
      kind: "admin.finance.taxPolicies.approve",
      method: "POST",
      policyId,
      roles: ["admin"],
    };
  }
  const taxPolicyRetirement = path.match(/^\/admin\/finance\/tax-policies\/([^/]+)\/retire$/);
  if (method === "POST" && taxPolicyRetirement) {
    const policyId = decodeSegment(taxPolicyRetirement[1] ?? "");
    if (!policyId) return null;
    return {
      kind: "admin.finance.taxPolicies.retire",
      method: "POST",
      policyId,
      roles: ["admin"],
    };
  }
  if (method === "POST" && path === "/admin/finance/balance-snapshots") {
    return { kind: "admin.finance.balanceSnapshot", method: "POST", roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/finance/balance-snapshots") {
    return { kind: "admin.finance.balanceSnapshots", method: "GET", roles: adminReadRoles };
  }
  return null;
}

function matchAdminOperationsRoute(
  path: string,
  method: string,
): AdminControlRoute | null {
  if (method === "GET" && path === "/admin/actor") {
    return { kind: "admin.actor.get", method: "GET", roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/operations") {
    return { kind: "admin.operations.get", method: "GET", roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/overview/details") {
    return { kind: "admin.overview.details", method: "GET", roles: adminReadRoles };
  }
  if (method === "GET" && path === "/admin/operations/scope-changes") {
    return { kind: "admin.operations.scopeChanges.list", method: "GET", roles: adminReadRoles };
  }
  const scopeEvidence = path.match(/^\/admin\/operations\/scope-changes\/([^/]+)\/evidence-access$/);
  if (method === "POST" && scopeEvidence) {
    const scopeChangeId = decodeSegment(scopeEvidence[1] ?? "");
    if (!scopeChangeId) return null;
    return {
      kind: "admin.operations.scopeChanges.evidenceAccess",
      method: "POST",
      scopeChangeId,
      roles: adminReadRoles,
    };
  }
  const scopeDetail = path.match(/^\/admin\/operations\/scope-changes\/([^/]+)$/);
  if (method === "GET" && scopeDetail) {
    const scopeChangeId = decodeSegment(scopeDetail[1] ?? "");
    if (!scopeChangeId) return null;
    return {
      kind: "admin.operations.scopeChanges.detail",
      method: "GET",
      scopeChangeId,
      roles: adminReadRoles,
    };
  }
  if (method === "GET" && path === "/admin/operations/support-cases") {
    return { kind: "admin.operations.supportCases.list", method: "GET", roles: adminReadRoles };
  }
  const supportCaseResource = path.match(
    /^\/admin\/operations\/support-cases\/(dispute|queue)\/([^/]+)(?:\/(preparation|evidence-access))?$/,
  );
  if (supportCaseResource) {
    const source = supportCaseResource[1] as "dispute" | "queue";
    const caseId = decodeSegment(supportCaseResource[2] ?? "");
    const action = supportCaseResource[3] ?? null;
    if (!caseId) return null;
    if (method === "GET" && action === null) {
      return {
        kind: "admin.operations.supportCases.detail",
        method: "GET",
        source,
        caseId,
        roles: adminReadRoles,
      };
    }
    if (method === "PUT" && action === "preparation") {
      return {
        kind: "admin.operations.supportCases.preparation",
        method: "PUT",
        source,
        caseId,
        roles: adminReadRoles,
      };
    }
    if (method === "POST" && action === "evidence-access") {
      return {
        kind: "admin.operations.supportCases.evidenceAccess",
        method: "POST",
        source,
        caseId,
        roles: adminReadRoles,
      };
    }
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
  if (method === "GET" && path === "/admin/governance/intake-policies") {
    return { kind: "admin.governance.intakePolicies.list", method: "GET", roles: ["admin"] };
  }
  if (method === "POST" && path === "/admin/governance/intake-policies/preview") {
    return { kind: "admin.governance.intakePolicies.preview", method: "POST", roles: ["admin"] };
  }
  if (method === "POST" && path === "/admin/governance/intake-policies/drafts") {
    return { kind: "admin.governance.intakePolicies.draft", method: "POST", roles: ["admin"] };
  }
  const intakeLifecycle = path.match(/^\/admin\/governance\/intake-policies\/([^/]+)\/(approve|publish|rollback)$/);
  if (method === "POST" && intakeLifecycle) {
    const policyId = decodeSegment(intakeLifecycle[1] ?? "");
    if (!policyId) return null;
    if (intakeLifecycle[2] === "approve") return { kind: "admin.governance.intakePolicies.approve", method: "POST", policyId, roles: ["admin"] };
    if (intakeLifecycle[2] === "publish") return { kind: "admin.governance.intakePolicies.publish", method: "POST", policyId, roles: ["admin"] };
    return { kind: "admin.governance.intakePolicies.rollback", method: "POST", policyId, roles: ["admin"] };
  }
  if (method === "GET" && path === "/admin/governance/price-baseline-versions") {
    return { kind: "admin.governance.priceBaselineVersions.list", method: "GET", roles: ["admin"] };
  }
  if (method === "POST" && path === "/admin/governance/price-baseline-versions/drafts") {
    return { kind: "admin.governance.priceBaselineVersions.draft", method: "POST", roles: ["admin"] };
  }
  const baselineLifecycle = path.match(/^\/admin\/governance\/price-baseline-versions\/([^/]+)\/(approve|publish|rollback)$/);
  if (method === "POST" && baselineLifecycle) {
    const baselineVersionId = decodeSegment(baselineLifecycle[1] ?? "");
    if (!baselineVersionId) return null;
    if (baselineLifecycle[2] === "approve") return { kind: "admin.governance.priceBaselineVersions.approve", method: "POST", baselineVersionId, roles: ["admin"] };
    if (baselineLifecycle[2] === "publish") return { kind: "admin.governance.priceBaselineVersions.publish", method: "POST", baselineVersionId, roles: ["admin"] };
    return { kind: "admin.governance.priceBaselineVersions.rollback", method: "POST", baselineVersionId, roles: ["admin"] };
  }
  if (method === "GET" && path === "/admin/worker-applications") {
    return { kind: "admin.workerApplications.list", method: "GET", roles: adminReadRoles };
  }
  return null;
}

function matchAdminWorkerTransactionRoute(
  path: string,
  method: string,
): AdminControlRoute | null {
  const workerProfileDecision = path.match(
    /^\/admin\/worker-applications\/([^/]+)\/profile-decision$/,
  );
  if (workerProfileDecision && method === "POST") {
    const applicationId = decodeSegment(workerProfileDecision[1] ?? "");
    if (!applicationId) return null;
    return {
      kind: "admin.workerApplications.profileDecision",
      method: "POST",
      applicationId,
      roles: adminReadRoles,
    };
  }
  const workerReviewDetail = path.match(
    /^\/admin\/worker-applications\/([^/]+)\/review-detail$/,
  );
  if (workerReviewDetail && method === "GET") {
    const applicationId = decodeSegment(workerReviewDetail[1] ?? "");
    if (!applicationId) return null;
    return {
      kind: "admin.workerApplications.reviewDetail",
      method: "GET",
      applicationId,
      roles: adminReadRoles,
    };
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
  const workerFinanceSnapshot = path.match(/^\/admin\/workers\/([^/]+)\/finance-snapshot$/);
  if (workerFinanceSnapshot && method === "GET") {
    const workerId = decodeSegment(workerFinanceSnapshot[1] ?? "");
    if (!workerId) return null;
    return {
      kind: "admin.workers.financeSnapshot",
      method: "GET",
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
  return null;
}

function matchAdminPayoutRoute(
  path: string,
  method: string,
): AdminControlRoute | null {
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
  const payoutMethodSensitive = path.match(/^\/admin\/payout-methods\/([^/]+)\/sensitive-access$/);
  if (payoutMethodSensitive && method === "POST") {
    const payoutMethodId = decodeSegment(payoutMethodSensitive[1] ?? "");
    if (!payoutMethodId) return null;
    return { kind: "admin.payoutMethods.sensitiveAccess", method: "POST", payoutMethodId, roles: adminReadRoles };
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
  const withdrawalRequestRelease = path.match(/^\/admin\/withdrawal-requests\/([^/]+)\/release$/);
  if (withdrawalRequestRelease && method === "POST") {
    const withdrawalRequestId = decodeSegment(withdrawalRequestRelease[1] ?? "");
    if (!withdrawalRequestId) return null;
    return { kind: "admin.withdrawalRequests.release", method: "POST", withdrawalRequestId, roles: adminReadRoles };
  }
  const withdrawalRequestSensitive = path.match(/^\/admin\/withdrawal-requests\/([^/]+)\/sensitive-access$/);
  if (withdrawalRequestSensitive && method === "POST") {
    const withdrawalRequestId = decodeSegment(withdrawalRequestSensitive[1] ?? "");
    if (!withdrawalRequestId) return null;
    return { kind: "admin.withdrawalRequests.sensitiveAccess", method: "POST", withdrawalRequestId, roles: adminReadRoles };
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
  return null;
}

function matchAdminTeamRoute(
  path: string,
  method: string,
): AdminControlRoute | null {
  if (method === "GET" && path === "/admin/sub-admins") {
    return { kind: "admin.subAdmins.list", method: "GET", roles: adminReadRoles };
  }
  if (method === "POST" && path === "/admin/sub-admins/provision") {
    return { kind: "admin.subAdmins.provision", method: "POST", roles: ["admin"] };
  }
  const resetProvisionedPassword = path.match(/^\/admin\/sub-admins\/provision\/([^/]+)\/reset-password$/);
  if (method === "POST" && resetProvisionedPassword) {
    const provisioningId = decodeSegment(resetProvisionedPassword[1] ?? "");
    if (!provisioningId) return null;
    return {
      kind: "admin.subAdmins.resetPassword",
      method: "POST",
      provisioningId,
      roles: ["admin"],
    };
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
