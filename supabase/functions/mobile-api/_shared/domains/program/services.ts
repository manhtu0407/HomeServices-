import {
  approveAdminAmbassadorProgram,
  getAdminAmbassadorProgram,
  saveAdminAmbassadorProgramDraft,
} from "./admin-program.ts";
import {
  decideAdminViolationCase,
  decideViolationAppeal,
  extendWithdrawalHold,
  getAdminViolationCase,
  liftIdentityBlock,
  listAdminViolationCases,
  listIdentityBlocks,
  setWorkerIdentityNumber,
  suspendWorkerForCase,
} from "./admin-discipline.ts";
import {
  createCompensationEvidenceUpload,
  getCompensationPayee,
  listAdminCompensation,
  listCustomerCompensation,
  listWorkerCompensation,
  openCompensationClaim,
  recordCompensationPaid,
  respondCompensation,
} from "./compensation.ts";
import { claimReferralCode, getCustomerMembership } from "./customer-membership.ts";
import {
  createAppealEvidenceUpload,
  listWorkerViolations,
  reportWorker,
  submitViolationAppeal,
} from "./discipline.ts";
import {
  ensureWorkerReferralCode,
  getWorkerAmbassadorSummary,
  redeemAmbassadorMilestone,
} from "./worker-ambassador.ts";

export function createProgramServices() {
  return {
    getWorkerAmbassadorSummary,
    ensureWorkerReferralCode,
    redeemAmbassadorMilestone,
    getCustomerMembership,
    claimReferralCode,
    getAdminAmbassadorProgram,
    saveAdminAmbassadorProgramDraft,
    approveAdminAmbassadorProgram,
    listWorkerViolations,
    createAppealEvidenceUpload,
    submitViolationAppeal,
    reportWorker,
    listAdminViolationCases,
    getAdminViolationCase,
    decideAdminViolationCase,
    suspendWorkerForCase,
    extendWithdrawalHold,
    decideViolationAppeal,
    setWorkerIdentityNumber,
    listIdentityBlocks,
    liftIdentityBlock,
    listCustomerCompensation,
    openCompensationClaim,
    respondCompensation,
    listWorkerCompensation,
    listAdminCompensation,
    recordCompensationPaid,
    createCompensationEvidenceUpload,
    getCompensationPayee,
  };
}
