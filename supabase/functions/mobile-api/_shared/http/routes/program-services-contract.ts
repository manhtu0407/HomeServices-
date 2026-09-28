import type { MobileApiContext } from "../../platform/auth.ts";
import type {
  EdgeAmbassadorProgramDraftInput,
  EdgeAmbassadorRedeemInput,
  EdgeReferralClaimInput,
} from "../../../../_shared/domain.ts";
import type {
  EdgeAdminAmbassadorProgramResponse,
  EdgeAdminAmbassadorProgramVersion,
  EdgeAmbassadorCodeResponse,
  EdgeAmbassadorRedeemReceipt,
  EdgeAmbassadorSummaryResponse,
  EdgeCustomerMembershipResponse,
  EdgeReferralClaimResponse,
} from "../../domains/contracts/ambassador.ts";
import type {
  EdgeAppealDecisionInput,
  EdgeAppealEvidenceUploadInput,
  EdgeAppealSubmitInput,
  EdgeCompensationClaimInput,
  EdgeCompensationEvidenceUploadInput,
  EdgeCompensationPaidInput,
  EdgeCompensationResponseInput,
  EdgeIdentityBlockLiftInput,
  EdgeViolationDecisionInput,
  EdgeViolationSuspendInput,
  EdgeWithdrawalHoldExtendInput,
  EdgeWorkerIdentityNumberInput,
  EdgeWorkerReportInput,
} from "../../../../_shared/domain.ts";
import type {
  EdgeAdminCompensationResponse,
  EdgeCompensationEvidenceUpload,
  EdgeCompensationNegotiation,
  EdgeCompensationPayee,
  EdgeCustomerCompensationResponse,
  EdgeWorkerCompensationResponse,
} from "../../domains/contracts/compensation.ts";
import type {
  EdgeAdminViolationCaseDetail,
  EdgeAdminViolationCasesResponse,
  EdgeAppealEvidenceUploadResponse,
  EdgeIdentityBlocksResponse,
  EdgeViolationCase,
  EdgeWorkerIdentityNumberResponse,
  EdgeWorkerReportResponse,
  EdgeWorkerViolationsResponse,
} from "../../domains/contracts/discipline.ts";

export type ProgramServices = {
  getWorkerAmbassadorSummary(ctx: MobileApiContext): Promise<EdgeAmbassadorSummaryResponse>;
  ensureWorkerReferralCode(ctx: MobileApiContext): Promise<EdgeAmbassadorCodeResponse>;
  redeemAmbassadorMilestone(
    ctx: MobileApiContext,
    input: EdgeAmbassadorRedeemInput,
  ): Promise<EdgeAmbassadorRedeemReceipt>;
  getCustomerMembership(ctx: MobileApiContext): Promise<EdgeCustomerMembershipResponse>;
  claimReferralCode(ctx: MobileApiContext, input: EdgeReferralClaimInput): Promise<EdgeReferralClaimResponse>;
  getAdminAmbassadorProgram(ctx: MobileApiContext): Promise<EdgeAdminAmbassadorProgramResponse>;
  saveAdminAmbassadorProgramDraft(
    ctx: MobileApiContext,
    input: EdgeAmbassadorProgramDraftInput,
  ): Promise<EdgeAdminAmbassadorProgramVersion>;
  approveAdminAmbassadorProgram(
    ctx: MobileApiContext,
    versionId: string,
  ): Promise<EdgeAdminAmbassadorProgramVersion>;
  listWorkerViolations(ctx: MobileApiContext): Promise<EdgeWorkerViolationsResponse>;
  createAppealEvidenceUpload(
    ctx: MobileApiContext,
    caseId: string,
    input: EdgeAppealEvidenceUploadInput,
  ): Promise<EdgeAppealEvidenceUploadResponse>;
  submitViolationAppeal(ctx: MobileApiContext, caseId: string, input: EdgeAppealSubmitInput): Promise<EdgeViolationCase>;
  reportWorker(ctx: MobileApiContext, jobId: string, input: EdgeWorkerReportInput): Promise<EdgeWorkerReportResponse>;
  listAdminViolationCases(ctx: MobileApiContext, status: string | null): Promise<EdgeAdminViolationCasesResponse>;
  getAdminViolationCase(ctx: MobileApiContext, caseId: string): Promise<EdgeAdminViolationCaseDetail>;
  decideAdminViolationCase(
    ctx: MobileApiContext,
    caseId: string,
    input: EdgeViolationDecisionInput,
  ): Promise<EdgeViolationCase>;
  suspendWorkerForCase(ctx: MobileApiContext, caseId: string, input: EdgeViolationSuspendInput): Promise<EdgeViolationCase>;
  extendWithdrawalHold(ctx: MobileApiContext, caseId: string, input: EdgeWithdrawalHoldExtendInput): Promise<EdgeViolationCase>;
  listCustomerCompensation(ctx: MobileApiContext): Promise<EdgeCustomerCompensationResponse>;
  openCompensationClaim(ctx: MobileApiContext, caseId: string, input: EdgeCompensationClaimInput): Promise<EdgeCompensationNegotiation>;
  respondCompensation(
    ctx: MobileApiContext,
    negotiationId: string,
    input: EdgeCompensationResponseInput,
  ): Promise<EdgeCompensationNegotiation>;
  listWorkerCompensation(ctx: MobileApiContext): Promise<EdgeWorkerCompensationResponse>;
  listAdminCompensation(ctx: MobileApiContext): Promise<EdgeAdminCompensationResponse>;
  recordCompensationPaid(ctx: MobileApiContext, negotiationId: string, input: EdgeCompensationPaidInput): Promise<EdgeCompensationNegotiation>;
  createCompensationEvidenceUpload(
    ctx: MobileApiContext,
    caseId: string,
    input: EdgeCompensationEvidenceUploadInput,
  ): Promise<EdgeCompensationEvidenceUpload>;
  getCompensationPayee(ctx: MobileApiContext, negotiationId: string): Promise<EdgeCompensationPayee>;
  decideViolationAppeal(ctx: MobileApiContext, caseId: string, input: EdgeAppealDecisionInput): Promise<EdgeViolationCase>;
  setWorkerIdentityNumber(
    ctx: MobileApiContext,
    workerId: string,
    input: EdgeWorkerIdentityNumberInput,
  ): Promise<EdgeWorkerIdentityNumberResponse>;
  listIdentityBlocks(ctx: MobileApiContext): Promise<EdgeIdentityBlocksResponse>;
  liftIdentityBlock(
    ctx: MobileApiContext,
    blockId: string,
    input: EdgeIdentityBlockLiftInput,
  ): Promise<{ id: string; lifted: true }>;
};
