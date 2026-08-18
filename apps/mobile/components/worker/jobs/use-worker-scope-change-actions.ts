import { useCallback, useEffect, useRef } from 'react'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'

import type { AppLanguage } from '@/lib/app-language'
import type { LocalDeal } from '@nestscout/shared'
import { mergeJobMediaRefsNewestFirst } from '@/lib/job-media-preview'
import { localizeMediaUploadFailure, type LocalMediaUploadDraft, uploadJobMediaDrafts } from '@/lib/media-upload'

import { firstRouteParam } from '../dock/routing'
import { WorkerV5RouteParams } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { formatScopePriceRange } from '../ui/labels'
import { useWorkerV5ScopeChangeDraft } from './use-worker-scope-change-draft'
import type { WorkerV5Runtime } from '../worker-v5-runtime'

export type { WorkerV5Runtime } from '../worker-v5-runtime'

export function useWorkerV5ScopeChangeActions({
  deal,
  hydrateIncident = true,
  language,
  runtime,
}: {
  deal: LocalDeal | null
  hydrateIncident?: boolean
  language: AppLanguage
  runtime: WorkerV5Runtime
}) {
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const router = useRouter()
  const scope = deal?.scopeChange ?? null
  const price = formatScopePriceRange(scope, language)
  const scopeRouteJobId = firstRouteParam(params.job_id)
  const scopeRouteMode = firstRouteParam(params.ns_scope_mode)
  const {
    ownerKey: scopeDraftOwnerKey,
    state: scopeDraft,
    updateOwnerState: updateScopeDraftOwnerState,
  } = useWorkerV5ScopeChangeDraft(deal, scopeRouteJobId)
  const {
    description: scopeDescription,
    evidenceOpenLocal: scopeEvidenceOpenLocal,
    evidenceSent: scopeEvidenceSent,
    incident: jobIncident,
    mediaNotice: scopeMediaNotice,
    photos: scopePhotos,
    proposing: scopeProposing,
    quote: scopeQuote,
    quoting: scopeQuoting,
    reason: scopeReason,
    submitting: scopeSubmitting,
    uploadedEvidenceRefs: scopeUploadedEvidenceRefs,
  } = scopeDraft
  const updateScopeDraft = useCallback((
    update: Parameters<typeof updateScopeDraftOwnerState>[1],
  ) => updateScopeDraftOwnerState(scopeDraftOwnerKey, update), [scopeDraftOwnerKey, updateScopeDraftOwnerState])
  const scopeMutationInFlightRef = useRef<{ kind: 'evidence' | 'quote' | 'proposal'; ownerKey: string } | null>(null)
  const scopeHydrationOwnerRef = useRef<string | null>(null)

  useEffect(() => {
    if (
      !hydrateIncident
      ||
      scopeHydrationOwnerRef.current === scopeDraftOwnerKey ||
      scopeDraftOwnerKey === 'no-active-job' ||
      scopeQuote
    ) return
    scopeHydrationOwnerRef.current = scopeDraftOwnerKey
    void runtime.actions.getKaelJobIncident(scopeDraftOwnerKey).then((response) => {
      if (!response) return
      updateScopeDraft((current) => ({
        ...current,
        incident: response.incident ?? current.incident,
        quote: response.quote ?? current.quote,
      }))
    })
  }, [hydrateIncident, runtime.actions, scopeDraftOwnerKey, scopeQuote, updateScopeDraft])

  const proposalSubmitted = jobIncident?.status === 'scope_proposed'
  useEffect(() => {
    if (deal?.status !== 'repairing' || !proposalSubmitted || scope) return
    const jobId = deal.broadcast?.jobId ?? deal.id
    router.replace(`/(worker)/jobs?ns_worker_screen=2.7-in-progress&job_id=${encodeURIComponent(jobId)}` as never)
  }, [deal, proposalSubmitted, router, scope])

  const scopeEvidenceOpen = !proposalSubmitted && (scopeRouteMode === 'edit' || scopeEvidenceOpenLocal)
  const fieldEvidenceUrls = deal?.fieldEvidencePhotoUrls ?? []
  const scopeEvidenceUrls = Array.from(new Set([
    ...fieldEvidenceUrls,
    ...scopePhotos.map((item) => item.uri),
    ...(scope?.evidencePhotoUrls ?? []),
    ...scopeUploadedEvidenceRefs,
  ].filter((uri): uri is string => Boolean(uri))))
  const evidenceCount = scopeEvidenceUrls.length
  const canDraftScopeEvidence = Boolean(deal && ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending'].includes(deal.status))
  const hasScopeSubmission = Boolean(scope || scopeEvidenceSent || jobIncident)
  const scopeDescriptionReady = scopeDescription.trim().length >= 10
  const scopeReasonReady = scopeReason.trim().length >= 10
  const scopeSubmitDisabled = proposalSubmitted || !canDraftScopeEvidence || !scopeDescriptionReady || !scopeReasonReady || scopeSubmitting || Boolean(scope && !jobIncident)

  const openScopeEditPath = () => {
    updateScopeDraft((current) => ({ ...current, evidenceOpenLocal: true, quote: null }))
    const jobParam = scopeDraftOwnerKey === 'no-active-job'
      ? ''
      : `&job_id=${encodeURIComponent(scopeDraftOwnerKey)}`
    router.replace(`/(worker)/jobs?ns_worker_screen=2.8-scope-change&ns_scope_mode=edit${jobParam}` as never)
  }

  const submitScopeEvidence = async () => {
    if (!deal || scopeSubmitDisabled || scopeMutationInFlightRef.current?.ownerKey === scopeDraftOwnerKey) return
    const operation = { kind: 'evidence' as const, ownerKey: scopeDraftOwnerKey }
    scopeMutationInFlightRef.current = operation
    const jobId = deal.broadcast?.jobId ?? deal.id
    const scopeMediaDrafts: LocalMediaUploadDraft[] = scopePhotos.slice(0, 5).map((item) => ({
      fileName: item.fileName,
      type: 'image',
      uri: item.uri,
    }))
    updateScopeDraft((current) => ({ ...current, mediaNotice: null, submitting: true }))
    try {
      let uploadedRefs: string[] = []
      if (scopeMediaDrafts.length > 0) {
        const uploaded = await uploadJobMediaDrafts(jobId, scopeMediaDrafts, 'scope_change_evidence')
        if (!uploaded.success) {
          updateScopeDraft((current) => ({
            ...current,
            mediaNotice: localizeMediaUploadFailure(uploaded, language),
          }))
          return
        }
        uploadedRefs = uploaded.mediaRefs
      }
      const nextEvidenceRefs = mergeJobMediaRefsNewestFirst(
        uploadedRefs,
        scopeUploadedEvidenceRefs,
        fieldEvidenceUrls,
        scope?.evidencePhotoUrls ?? [],
      )
      updateScopeDraft((current) => ({
        ...current,
        uploadedEvidenceRefs: Array.from(new Set([...current.uploadedEvidenceRefs, ...uploadedRefs])),
      }))
      const opened = await runtime.actions.openKaelJobIncident({
        new_description: scopeDescription.trim(),
        photo_urls: nextEvidenceRefs,
        reason: scopeReason.trim(),
      })
      updateScopeDraft((current) => opened
        ? {
          ...current,
          evidenceSent: true,
          incident: opened.incident,
          photos: [],
        }
        : {
          ...current,
          mediaNotice: textByLanguage(language, 'Chưa gửi được bằng chứng đổi phạm vi. Vui lòng thử lại.', 'Scope evidence could not be sent. Try again.'),
        })
      if (!opened) return
    } catch {
      updateScopeDraft((current) => ({
        ...current,
        mediaNotice: textByLanguage(language, 'Chưa gửi được bằng chứng đổi phạm vi. Vui lòng thử lại.', 'Scope evidence could not be sent. Try again.'),
      }))
    } finally {
      if (scopeMutationInFlightRef.current === operation) scopeMutationInFlightRef.current = null
      updateScopeDraft((current) => ({ ...current, submitting: false }))
    }
  }

  const submitScopeProposal = async () => {
    if (
      scopeProposing ||
      !scopeQuote ||
      jobIncident?.status !== 'ready_for_scope_proposal' ||
      scopeMutationInFlightRef.current?.ownerKey === scopeDraftOwnerKey
    ) return
    const operation = { kind: 'proposal' as const, ownerKey: scopeDraftOwnerKey }
    scopeMutationInFlightRef.current = operation
    updateScopeDraft((current) => ({ ...current, proposing: true }))
    try {
      const submitted = await runtime.actions.proposeScopeChangeFromKaelIncident(scopeQuote.quote_id)
      updateScopeDraft((current) => ({
        ...current,
        incident: submitted && current.incident
          ? { ...current.incident, status: 'scope_proposed' }
          : current.incident,
        mediaNotice: submitted
          ? current.mediaNotice
          : textByLanguage(language, 'Chưa tạo được đề xuất phạm vi. Vui lòng thử lại.', 'The scope proposal could not be created. Try again.'),
      }))
    } catch {
      updateScopeDraft((current) => ({
        ...current,
        mediaNotice: textByLanguage(language, 'Chưa tạo được đề xuất phạm vi. Vui lòng thử lại.', 'The scope proposal could not be created. Try again.'),
      }))
    } finally {
      if (scopeMutationInFlightRef.current === operation) scopeMutationInFlightRef.current = null
      updateScopeDraft((current) => ({ ...current, proposing: false }))
    }
  }

  const previewScopeProposal = async () => {
    if (
      scopeQuoting ||
      jobIncident?.status !== 'ready_for_scope_proposal' ||
      scopeMutationInFlightRef.current?.ownerKey === scopeDraftOwnerKey
    ) return
    const operation = { kind: 'quote' as const, ownerKey: scopeDraftOwnerKey }
    scopeMutationInFlightRef.current = operation
    updateScopeDraft((current) => ({ ...current, quoting: true }))
    try {
      const preview = await runtime.actions.previewScopeChangeFromKaelIncident()
      updateScopeDraft((current) => ({
        ...current,
        quote: preview ? preview.quote : null,
        mediaNotice: preview
          ? null
          : textByLanguage(language, 'Chưa tính được mức giá cân bằng. Vui lòng kiểm tra lại dữ kiện.', 'A balanced quote could not be calculated. Review the case facts.'),
      }))
    } catch {
      updateScopeDraft((current) => ({
        ...current,
        quote: null,
        mediaNotice: textByLanguage(language, 'Chưa tính được mức giá cân bằng. Vui lòng thử lại.', 'A balanced quote could not be calculated. Try again.'),
      }))
    } finally {
      if (scopeMutationInFlightRef.current === operation) scopeMutationInFlightRef.current = null
      updateScopeDraft((current) => ({ ...current, quoting: false }))
    }
  }

  const rejectScopeQuote = () => {
    updateScopeDraft((current) => ({
      ...current,
      quote: null,
      mediaNotice: textByLanguage(
        language,
        'Báo giá chưa được gửi cho khách. Chỉ sửa báo cáo nếu dữ kiện hiện trường chưa đúng.',
        'The quote was not sent to the Customer. Edit the report only if the site facts are inaccurate.',
      ),
    }))
  }

  const attachScopePhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      updateScopeDraft((current) => ({
        ...current,
        mediaNotice: textByLanguage(language, 'Cần quyền thư viện ảnh để đính kèm bằng chứng đổi phạm vi.', 'Photo library permission is needed to attach scope evidence.'),
      }))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.84,
      selectionLimit: 5,
    })
    if (result.canceled || result.assets.length === 0) return
    updateScopeDraft((current) => {
      const picked = result.assets.map((asset, index) => ({
        fileName: asset.fileName?.trim() || textByLanguage(language, `anh-phat-sinh-${current.photos.length + index + 1}.jpg`, `scope-evidence-${current.photos.length + index + 1}.jpg`),
        uri: asset.uri,
      }))
      return {
        ...current,
        mediaNotice: null,
        photos: [...current.photos, ...picked].slice(0, 5),
      }
    })
  }

  const viewScopeDetails = () => {
    router.replace('/(worker)/chat' as never)
  }

  return {
    canDraftScopeEvidence,
    deal,
    evidenceCount,
    hasScopeSubmission,
    jobIncident,
    onAddPhotos: attachScopePhotos,
    onOpenScopeEditPath: openScopeEditPath,
    onPreviewScopeProposal: previewScopeProposal,
    onRejectScopeQuote: rejectScopeQuote,
    onScopeDescriptionChange: (description: string) => {
      updateScopeDraft((current) => ({ ...current, description, quote: null }))
    },
    onScopeReasonChange: (reason: string) => {
      updateScopeDraft((current) => ({ ...current, reason, quote: null }))
    },
    onSubmitScopeEvidence: submitScopeEvidence,
    onSubmitScopeProposal: submitScopeProposal,
    onViewScopeDetails: viewScopeDetails,
    price,
    scope,
    scopeDescription,
    scopeEvidenceOpen,
    scopeEvidenceSent,
    scopeEvidenceUrls,
    scopeMediaNotice,
    scopePhotos,
    scopeQuote,
    scopeQuoting,
    scopeReason,
    scopeSubmitDisabled,
    scopeSubmitting,
  }
}
