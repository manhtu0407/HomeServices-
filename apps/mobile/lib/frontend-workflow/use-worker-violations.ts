import { useCallback, useEffect, useState } from 'react'

import type { DisciplinePolicyView, WorkerViolationCaseView } from '../api-types/program'
import { useAuth } from '../auth-provider'
import { readLocalMediaBlob } from '../media-upload'
import { disciplineService } from '../services/discipline-service'
import { supabase } from '../supabase'

const APPEAL_EVIDENCE_BUCKET = 'discipline-evidence'
const MAX_APPEAL_IMAGE_BYTES = 25 * 1024 * 1024
export const MAX_APPEAL_IMAGES = 6

export type AppealImageDraft = { uri: string; mimeType: 'image/jpeg' | 'image/png' }

type SignedUploadBucket = {
  uploadToSignedUrl: (
    path: string,
    token: string,
    body: Blob,
    options?: { contentType?: string; upsert?: boolean },
  ) => Promise<{ error: unknown }>
}

export function useWorkerViolations() {
  const { session } = useAuth()
  const accessToken = session?.access_token ?? ''
  const [cases, setCases] = useState<WorkerViolationCaseView[] | null>(null)
  const [policy, setPolicy] = useState<DisciplinePolicyView | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadErrorCode, setLoadErrorCode] = useState<string | null>(null)
  const [submittingCaseId, setSubmittingCaseId] = useState<string | null>(null)
  const [appealErrorCode, setAppealErrorCode] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadErrorCode(null)
    const result = await disciplineService.listWorkerViolations(accessToken)
    setLoading(false)
    if (result.success) {
      setCases(result.data.cases)
      setPolicy(result.data.policy)
    } else {
      setLoadErrorCode(result.code)
    }
  }, [accessToken])

  useEffect(() => {
    void reload()
  }, [reload])

  const uploadEvidence = useCallback(async (caseId: string, images: AppealImageDraft[]) => {
    const bucket = supabase?.storage.from(APPEAL_EVIDENCE_BUCKET) as unknown as SignedUploadBucket | undefined
    if (!bucket) return { success: false as const, code: 'MEDIA_STORAGE_UNAVAILABLE' }
    const paths: string[] = []
    for (const image of images.slice(0, MAX_APPEAL_IMAGES)) {
      const local = await readLocalMediaBlob(image.uri, MAX_APPEAL_IMAGE_BYTES)
      if (!local.success) return { success: false as const, code: 'MEDIA_READ_FAILED' }
      const intent = await disciplineService.createAppealUpload(caseId, image.mimeType, accessToken)
      if (!intent.success) return { success: false as const, code: intent.code }
      const uploaded = await bucket.uploadToSignedUrl(intent.data.path, intent.data.token, local.blob, {
        contentType: image.mimeType,
        upsert: false,
      })
      if (uploaded.error) return { success: false as const, code: 'MEDIA_UPLOAD_FAILED' }
      paths.push(intent.data.path)
    }
    return { success: true as const, paths }
  }, [accessToken])

  const submitAppeal = useCallback(async (caseId: string, reason: string, images: AppealImageDraft[]) => {
    setSubmittingCaseId(caseId)
    setAppealErrorCode(null)
    const evidence = await uploadEvidence(caseId, images)
    if (!evidence.success) {
      setSubmittingCaseId(null)
      setAppealErrorCode(evidence.code)
      return false
    }
    const result = await disciplineService.submitAppeal(caseId, reason.trim(), evidence.paths, accessToken)
    setSubmittingCaseId(null)
    if (!result.success) {
      setAppealErrorCode(result.code)
      return false
    }
    setCases((current) => current?.map((item) => item.id === caseId ? result.data : item) ?? [result.data])
    return true
  }, [accessToken, uploadEvidence])

  return { cases, policy, loading, loadErrorCode, submittingCaseId, appealErrorCode, reload, submitAppeal }
}
