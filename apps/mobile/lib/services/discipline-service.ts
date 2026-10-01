import type { CustomerReportableViolation } from '@nestscout/shared'
import { z } from 'zod'

import { api, type ApiResult } from '../api'
import type { AppealEvidenceUploadIntent, DisciplinePolicyView, WorkerViolationCaseView } from '../api-types/program'
import { validatedResult } from './validated-result'

const violationCaseSchema = z.object({
  id: z.string().min(1),
  violation_code: z.string().min(1),
  level: z.number().int().min(1).max(5),
  source: z.enum(['detector', 'admin', 'customer_report']),
  statement: z.string().nullable(),
  status: z.enum(['proposed', 'confirmed', 'dismissed', 'fabricated_report']),
  decision_deadline_at: z.string(),
  decided_at: z.string().nullable(),
  decision_reason: z.string().nullable(),
  appeal_status: z.enum(['none', 'submitted', 'upheld', 'overturned']),
  appeal_deadline_at: z.string().nullable(),
  suspended_pending_review: z.boolean(),
  created_at: z.string(),
  consequences: z.array(z.object({
    entry_kind: z.string().min(1),
    effective_until: z.string().nullable(),
    restored: z.boolean(),
  })),
})

export const disciplineService = {
  async listWorkerViolations(
    accessToken: string,
  ): Promise<ApiResult<{ policy: DisciplinePolicyView; cases: WorkerViolationCaseView[] }>> {
    const days = z.number().int().positive()
    return validatedResult(
      await api.getAuthenticated<unknown>('/workers/me/violations', accessToken),
      z.object({
        policy: z.object({
          l1_matching_days: days,
          l2_points_debit: days,
          l2_network_freeze_days: days,
          l3_freeze_days: days,
          strike_window_months: days,
          appeal_window_days: days,
          withdrawal_hold_days: days,
        }),
        cases: z.array(violationCaseSchema),
      }),
    )
  },
  async createAppealUpload(
    caseId: string,
    contentType: 'image/jpeg' | 'image/png',
    accessToken: string,
  ): Promise<ApiResult<AppealEvidenceUploadIntent>> {
    return validatedResult(
      await api.postAuthenticated<unknown>(
        `/workers/me/violations/${encodeURIComponent(caseId)}/appeal-uploads`,
        { content_type: contentType },
        accessToken,
      ),
      z.object({ path: z.string().min(1), signed_url: z.string().min(1), token: z.string().min(1) }),
    )
  },
  async submitAppeal(
    caseId: string,
    reason: string,
    evidencePaths: string[],
    accessToken: string,
  ): Promise<ApiResult<WorkerViolationCaseView>> {
    return validatedResult(
      await api.postAuthenticated<unknown>(
        `/workers/me/violations/${encodeURIComponent(caseId)}/appeal`,
        { reason, evidence_paths: evidencePaths },
        accessToken,
      ),
      violationCaseSchema,
    )
  },
  async reportWorker(
    jobId: string,
    violationCode: CustomerReportableViolation,
    statement: string,
    accessToken: string,
  ): Promise<ApiResult<{ case_id: string; level: number; status: WorkerViolationCaseView['status'] }>> {
    return validatedResult(
      await api.postAuthenticated<unknown>(
        `/jobs/${encodeURIComponent(jobId)}/worker-reports`,
        { violation_code: violationCode, statement },
        accessToken,
      ),
      z.object({
        case_id: z.string().min(1),
        level: z.number().int().min(1).max(5),
        status: z.enum(['proposed', 'confirmed', 'dismissed', 'fabricated_report']),
      }),
    )
  },
}
