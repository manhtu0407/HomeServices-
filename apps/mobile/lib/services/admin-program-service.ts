import { api } from '../api'
import type {
  AdminAmbassadorProgramDraftInput,
  AdminAmbassadorProgramResponse,
  AdminAmbassadorProgramVersion,
  AdminAppealDecision,
  AdminCompensationNegotiation,
  AdminCompensationPayee,
  AdminIdentityBlock,
  AdminViolationCaseDetail,
  AdminViolationCaseSummary,
  AdminViolationDecision,
} from '../api-types/admin-program'
import type { WorkerViolationCaseView } from '../api-types/program'

const encode = encodeURIComponent

export const adminProgramService = {
  getAmbassadorProgram() {
    return api.get<AdminAmbassadorProgramResponse>('/admin/ambassador-program')
  },
  saveAmbassadorProgramDraft(input: AdminAmbassadorProgramDraftInput) {
    return api.put<AdminAmbassadorProgramVersion>('/admin/ambassador-program/draft', input)
  },
  approveAmbassadorProgram(versionId: string) {
    return api.post<AdminAmbassadorProgramVersion>(`/admin/ambassador-program/${encode(versionId)}/approve`, {})
  },
  listViolationCases(status: 'confirmed' | 'dismissed' | 'fabricated_report' | null) {
    return api.get<{ cases: AdminViolationCaseSummary[] }>(
      status ? `/admin/discipline/cases?status=${encode(status)}` : '/admin/discipline/cases',
    )
  },
  getViolationCase(caseId: string) {
    return api.get<AdminViolationCaseDetail>(`/admin/discipline/cases/${encode(caseId)}`)
  },
  decideViolationCase(caseId: string, input: { decision: AdminViolationDecision; reason: string; clawback_vnd?: number }) {
    return api.post<WorkerViolationCaseView>(`/admin/discipline/cases/${encode(caseId)}/decision`, input)
  },
  suspendForCase(caseId: string, reason: string) {
    return api.post<WorkerViolationCaseView>(`/admin/discipline/cases/${encode(caseId)}/suspend`, { reason })
  },
  extendWithdrawalHold(caseId: string, input: { authority_reference: string; hold_until: string }) {
    return api.post<WorkerViolationCaseView>(`/admin/discipline/cases/${encode(caseId)}/hold-extension`, input)
  },
  decideAppeal(caseId: string, input: { decision: AdminAppealDecision; reason: string }) {
    return api.post<WorkerViolationCaseView>(`/admin/discipline/cases/${encode(caseId)}/appeal-decision`, input)
  },
  listCompensation() {
    return api.get<{ negotiations: AdminCompensationNegotiation[] }>('/admin/discipline/compensation')
  },
  getCompensationPayee(negotiationId: string) {
    return api.get<AdminCompensationPayee>(`/admin/discipline/compensation/${encode(negotiationId)}/payee`)
  },
  recordCompensationPaid(negotiationId: string, transferReference: string) {
    return api.post<AdminCompensationNegotiation>(`/admin/discipline/compensation/${encode(negotiationId)}/paid`, { transfer_reference: transferReference })
  },
  listIdentityBlocks() {
    return api.get<{ blocks: AdminIdentityBlock[] }>('/admin/discipline/blocklist')
  },
  liftIdentityBlock(blockId: string, reason: string) {
    return api.post<{ id: string; lifted: true }>(`/admin/discipline/blocklist/${encode(blockId)}/lift`, { reason })
  },
  setWorkerIdentityNumber(workerId: string, cccdNumber: string) {
    return api.put<{ worker_id: string; cccd_last4: string }>(
      `/admin/discipline/workers/${encode(workerId)}/identity-number`,
      { cccd_number: cccdNumber },
    )
  },
}
