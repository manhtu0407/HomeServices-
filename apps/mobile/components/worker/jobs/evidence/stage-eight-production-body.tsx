import * as ImagePicker from 'expo-image-picker'
import { useRef, useState } from 'react'

import { localizeMediaUploadFailure, uploadJobMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
import type { AppLanguage } from '@/lib/app-language'

import { workerV5PrivateKaelMediaName } from '../../chat/use-worker-kael-orb-chat'
import type { WorkerJobsLegacyPrototypeRuntime } from '../worker-jobs-zip-prototype-shared'
import { StageEightEvidenceScreen } from './stage-eight-evidence'

export function WorkerJobsProductionStageEightBody({
  language,
  navigateNext,
  runtime,
}: {
  language: AppLanguage
  navigateNext: () => void
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const deal = runtime.state.deal
  const jobId = deal?.id ?? null
  const [completionNote, setCompletionNote] = useState(deal?.completionNotes ?? '')
  const [completionPhotos, setCompletionPhotos] = useState<LocalMediaUploadDraft[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const uploadedDraftRef = useRef<{ fingerprint: string; jobId: string; mediaRefs: string[] } | null>(null)
  const completionPhotoUris = Array.from(new Set([
    ...(deal?.completionPhotoUrls ?? []),
    ...completionPhotos.map((photo) => photo.uri),
  ]))

  const addCompletionPhoto = async () => {
    if (submittingRef.current || completionPhotos.length >= 10) return
    setNotice(null)
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.84,
      })
      if (result.canceled || result.assets.length === 0) return
      const asset = result.assets[0]
      const draft: LocalMediaUploadDraft = {
        fileName: workerV5PrivateKaelMediaName(asset, completionPhotos.length, language),
        fileSizeBytes: asset.fileSize ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        type: 'image',
        uri: asset.uri,
      }
      setCompletionPhotos((current) => current.some((item) => item.uri === draft.uri) ? current : [...current, draft].slice(0, 10))
      uploadedDraftRef.current = null
    } catch {
      setNotice(language === 'vi' ? 'Chưa thể mở ảnh hoàn tất lúc này. Vui lòng thử lại.' : 'Completion photos could not be opened. Please try again.')
    }
  }

  const submitCompletion = async () => {
    const normalizedNote = completionNote.trim()
    if (submittingRef.current || !jobId || normalizedNote.length < 5 || completionPhotoUris.length === 0) return
    submittingRef.current = true
    setSubmitting(true)
    setNotice(null)
    try {
      const fingerprint = completionPhotos.map((photo) => `${photo.uri}:${photo.fileSizeBytes ?? ''}`).join('|')
      let uploadedRefs: string[] = []
      if (completionPhotos.length > 0) {
        const cachedUpload = uploadedDraftRef.current
        if (cachedUpload?.jobId === jobId && cachedUpload.fingerprint === fingerprint) {
          uploadedRefs = cachedUpload.mediaRefs
        } else {
          const uploaded = await uploadJobMediaDrafts(jobId, completionPhotos, 'after')
          if (!uploaded.success) {
            setNotice(localizeMediaUploadFailure(uploaded, language))
            return
          }
          uploadedRefs = uploaded.mediaRefs
          uploadedDraftRef.current = { fingerprint, jobId, mediaRefs: uploadedRefs }
        }
      }
      const updated = await runtime.actions.workerUpdateStatus('completed_by_worker', {
        completion_notes: normalizedNote,
        completion_photo_urls: Array.from(new Set([...(deal?.completionPhotoUrls ?? []), ...uploadedRefs])),
      })
      if (updated) {
        navigateNext()
        return
      }
      setNotice(runtime.state.lastError ?? (language === 'vi' ? 'Chưa thể gửi hồ sơ hoàn tất. Vui lòng thử lại.' : 'Completion evidence could not be submitted. Please try again.'))
    } catch {
      setNotice(language === 'vi' ? 'Chưa thể gửi hồ sơ hoàn tất. Vui lòng thử lại.' : 'Completion evidence could not be submitted. Please try again.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <StageEightEvidenceScreen
      embedded
      language={language}
      note={completionNote}
      notice={notice}
      onAddPhoto={() => void addCompletionPhoto()}
      onNoteChange={(value) => {
        setCompletionNote(value)
        if (notice) setNotice(null)
      }}
      onSubmit={() => void submitCompletion()}
      photoCount={completionPhotoUris.length}
      submitting={submitting}
      showWorkflowHeader={false}
    />
  )
}
