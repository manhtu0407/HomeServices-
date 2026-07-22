import { useRef, useState, type ComponentType } from 'react'
import type { ImageSourcePropType } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import {
  localizeMediaUploadFailure,
  uploadJobMediaDrafts,
  type LocalMediaUploadDraft,
} from '@/lib/media-upload'

import type { WorkerV5IconName } from '../dock/types'
import { workerV5PrivateKaelMediaName } from '../chat/use-worker-kael-orb-chat'
import { textByLanguage } from '../ui/format'
import { WorkerV5CompletionEvidenceBody } from './completion-bodies'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerV5PrimaryFillComponent = ComponentType<{
  disabled: boolean
  variant?: 'default' | 'source'
}>

export function WorkerV5CompletionEvidenceScreenBody({
  icons,
  language,
  navigateNext,
  primaryFill,
  reduceTransparency,
  runtime,
}: {
  icons: Record<WorkerV5IconName, ImageSourcePropType>
  language: AppLanguage
  navigateNext: () => void
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const jobId = deal?.id ?? null
  const [completionNote, setCompletionNote] = useState(deal?.completionNotes ?? '')
  const [completionPhotos, setCompletionPhotos] = useState<LocalMediaUploadDraft[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [submitBusy, setSubmitBusy] = useState(false)
  const submitBusyRef = useRef(false)
  const uploadedDraftRef = useRef<{
    fingerprint: string
    jobId: string
    mediaRefs: string[]
  } | null>(null)
  const hasCompletionPhoto = Boolean(deal?.completionPhotoUrls?.length) || completionPhotos.length > 0
  const submitDisabled = submitBusy || !jobId || completionNote.trim().length < 5 || !hasCompletionPhoto

  const addCompletionPhoto = async () => {
    if (submitBusyRef.current || completionPhotos.length >= 10) return
    setNotice(null)
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        setNotice(textByLanguage(
          language,
          'Cần quyền kho ảnh để thêm bằng chứng hoàn tất.',
          'Photo-library access is needed to add completion evidence.',
        ))
        return
      }
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
      setCompletionPhotos((current) => current.some((item) => item.uri === draft.uri)
        ? current
        : [...current, draft].slice(0, 10))
      uploadedDraftRef.current = null
    } catch {
      setNotice(textByLanguage(
        language,
        'Chưa thể mở ảnh hoàn tất lúc này. Vui lòng thử lại.',
        'Completion photos could not be opened. Please try again.',
      ))
    }
  }

  const submitCompletion = async () => {
    const normalizedNote = completionNote.trim()
    if (submitBusyRef.current || !jobId || normalizedNote.length < 5 || !hasCompletionPhoto) return
    submitBusyRef.current = true
    setSubmitBusy(true)
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
      const completionPhotoUrls = Array.from(new Set([
        ...(deal?.completionPhotoUrls ?? []),
        ...uploadedRefs,
      ]))
      const updated = await runtime.actions.workerUpdateStatus('completed_by_worker', {
        completion_notes: normalizedNote,
        completion_photo_urls: completionPhotoUrls,
      })
      if (updated) {
        navigateNext()
        return
      }
      setNotice(runtime.state.lastError ?? textByLanguage(
        language,
        'Chưa thể gửi hồ sơ hoàn tất. Vui lòng thử lại.',
        'Completion evidence could not be submitted. Please try again.',
      ))
    } catch {
      setNotice(textByLanguage(
        language,
        'Chưa thể gửi hồ sơ hoàn tất. Vui lòng thử lại.',
        'Completion evidence could not be submitted. Please try again.',
      ))
    } finally {
      submitBusyRef.current = false
      setSubmitBusy(false)
    }
  }

  return (
    <WorkerV5CompletionEvidenceBody
      completionNote={completionNote}
      draftPhotoUris={completionPhotos.map((photo) => photo.uri)}
      icons={icons}
      language={language}
      notice={notice}
      onAddPhoto={() => void addCompletionPhoto()}
      onCompletionNoteChange={setCompletionNote}
      onSubmit={() => void submitCompletion()}
      primaryFill={primaryFill}
      reduceTransparency={reduceTransparency}
      runtime={runtime}
      submitBusy={submitBusy}
      submitDisabled={submitDisabled}
    />
  )
}
