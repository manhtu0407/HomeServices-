import { useCallback, useEffect, useRef } from 'react'
import { View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type AppLanguage } from '@/lib/app-language'
import type { ScopeChangeWorkerQuote } from '@/lib/api-types'
import type { LocalScopeChange } from '@nestscout/shared'
import { mergeJobMediaRefsNewestFirst } from '@/lib/job-media-preview'
import { localizeMediaUploadFailure, type LocalMediaUploadDraft, uploadJobMediaDrafts } from '@/lib/media-upload'
import { firstRouteParam } from '../dock/routing'
import { WorkerV5RouteParams } from '../dock/types'
import { WorkerV5CustomerCaseWideMintAura, WorkerV5CustomerZipMintAura } from '../ui/aura-surfaces'
import { formatVnd, textByLanguage } from '../ui/format'
import { formatScopePriceRange } from '../ui/labels'
import { WorkerV5PrimaryButtonFill, WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { WorkerV5ScreenInfoRow } from '../ui/screen-atoms-surfaces'
import { WorkerV5ActionRail } from './advisory-surfaces'
import { WorkerV5EvidenceTray } from './evidence-surfaces'
import { WorkerV5ScopeEvidenceGate } from './scope-surfaces'
import { useWorkerV5ScopeChangeDraft } from './use-worker-scope-change-draft'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { WorkerV5PriceLines } from './shared-surfaces'
import { WorkerV5ProgressRail } from './progress-surfaces'

import { styles } from '../worker-v5-flow-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

function WorkerV5ScopePriceSummary({
  evidenceCount,
  language,
  price,
  reduceTransparency,
  scope,
  scopeQuote,
}: {
  evidenceCount: number
  language: AppLanguage
  price: string
  reduceTransparency: boolean
  scope: LocalScopeChange | null
  scopeQuote: ScopeChangeWorkerQuote | null
}) {
  const rows = scopeQuote ? [
    { label: textByLanguage(language, 'Tổng khách trả', 'Customer total'), value: formatVnd(scopeQuote.customer_total, language) },
    { label: textByLanguage(language, 'Phí nền tảng', 'Platform fee'), value: `${formatVnd(scopeQuote.platform_fee, language)} · ${scopeQuote.commission_rate_bps / 100}%` },
    { label: textByLanguage(language, 'Thu nhập thợ', 'Worker earnings'), value: formatVnd(scopeQuote.worker_net, language) },
    { label: textByLanguage(language, 'Khoảng tham chiếu', 'Reference band'), value: `${formatVnd(scopeQuote.reference_price_min, language)}–${formatVnd(scopeQuote.reference_price_max, language)}` },
  ] : [
    { label: textByLanguage(language, 'Hạng mục bổ sung', 'Additional scope'), value: scope?.requestedDescription || textByLanguage(language, 'Chưa có bản nháp thật', 'No real draft') },
    { label: textByLanguage(language, 'Lý do', 'Reason'), value: scope?.reason || textByLanguage(language, 'Chưa có lý do thật', 'No real reason') },
    { label: textByLanguage(language, 'Bằng chứng', 'Evidence'), value: evidenceCount ? `${evidenceCount}` : textByLanguage(language, 'Chưa có ảnh', 'No photos') },
  ]

  return (
    <WorkerV5PriceLines
      caseWideAura={WorkerV5CustomerCaseWideMintAura}
      formulaAura
      reduceTransparency={reduceTransparency}
      rows={rows}
      total={{
        label: scopeQuote
          ? textByLanguage(language, 'Giá Kael đề nghị', 'Kael proposed price')
          : textByLanguage(language, 'Khoảng giá', 'Price range'),
        value: scopeQuote ? formatVnd(scopeQuote.customer_total, language) : price,
      }}
      zipAura={WorkerV5CustomerZipMintAura}
    />
  )
}

function WorkerV5ScopeSummary({
  evidenceCount,
  evidenceUrls,
  language,
  price,
  reduceTransparency,
  scope,
  scopeQuote,
}: {
  evidenceCount: number
  evidenceUrls: string[]
  language: AppLanguage
  price: string
  reduceTransparency: boolean
  scope: LocalScopeChange | null
  scopeQuote: ScopeChangeWorkerQuote | null
}) {
  return (
    <>
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Kael hỗ trợ soạn', 'Kael drafts')}
        title={textByLanguage(language, 'Đề xuất thay đổi', 'Change proposal')}
      />
      <WorkerV5ScopePriceSummary
        evidenceCount={evidenceCount}
        language={language}
        price={price}
        reduceTransparency={reduceTransparency}
        scope={scope}
        scopeQuote={scopeQuote}
      />
      <WorkerV5EvidenceTray
        emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
        language={language}
        reduceTransparency={reduceTransparency}
        stageLabel={textByLanguage(language, 'Bằng chứng đổi phạm vi', 'Scope-change evidence')}
        urls={evidenceUrls}
      />
    </>
  )
}

function WorkerV5ScopeActionRail({
  canDraftScopeEvidence,
  hasScopeSubmission,
  incidentStatus,
  language,
  navigateNext,
  onOpenScopeEditPath,
  onPreviewScopeProposal,
  onRejectScopeQuote,
  onSubmitScopeProposal,
  onViewScopeDetails,
  reduceTransparency,
  scopeQuote,
  scopeQuoting,
}: {
  canDraftScopeEvidence: boolean
  hasScopeSubmission: boolean
  incidentStatus: string | null
  language: AppLanguage
  navigateNext: () => void
  onOpenScopeEditPath: () => void
  onPreviewScopeProposal: () => void
  onRejectScopeQuote: () => void
  onSubmitScopeProposal: () => void
  onViewScopeDetails: () => void
  reduceTransparency: boolean
  scopeQuote: ScopeChangeWorkerQuote | null
  scopeQuoting: boolean
}) {
  const proposalReady = incidentStatus === 'ready_for_scope_proposal'
  return (
    <WorkerV5ActionRail
      caseWideAura={WorkerV5CustomerCaseWideMintAura}
      primaryButtonFill={WorkerV5PrimaryButtonFill}
      zipAura={WorkerV5CustomerZipMintAura}
      onPrimary={proposalReady
        ? scopeQuote ? onSubmitScopeProposal : onPreviewScopeProposal
        : hasScopeSubmission ? onViewScopeDetails : navigateNext}
      onSecondary={scopeQuote ? onRejectScopeQuote : canDraftScopeEvidence ? onOpenScopeEditPath : undefined}
      primary={proposalReady
        ? scopeQuote
          ? textByLanguage(language, 'Xác nhận giá và gửi khách', 'Confirm price and send')
          : scopeQuoting
            ? textByLanguage(language, 'Kael đang tính...', 'Kael is calculating...')
            : textByLanguage(language, 'Kael tính giá cân bằng', 'Calculate balanced price')
        : hasScopeSubmission
          ? textByLanguage(language, 'Mở Kael Công việc', 'Open Kael Work')
          : textByLanguage(language, 'Không có vấn đề phát sinh', 'No scope issue')}
      primaryTestID="worker-v5-scope-change-send-action"
      primaryVariant="source"
      reduceTransparency={reduceTransparency}
      secondary={scopeQuote
        ? textByLanguage(language, 'Không đồng ý mức này', 'Decline this quote')
        : textByLanguage(language, 'Chỉnh sửa', 'Edit')}
      secondaryTestID="worker-v5-scope-change-edit-action"
    />
  )
}

export function WorkerV5ScopeChangeBody({
  language,
  navigateNext,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateNext: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const router = useRouter()
  const deal = runtime.state.deal
  const scope = runtime.state.deal?.scopeChange ?? null
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
  }, [runtime.actions, scopeDraftOwnerKey, scopeQuote, updateScopeDraft])
  const scopeEvidenceOpen = scopeRouteMode === 'edit' || scopeEvidenceOpenLocal
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
  const scopeSubmitDisabled = !canDraftScopeEvidence || !scopeDescriptionReady || !scopeReasonReady || scopeSubmitting || Boolean(scope && !jobIncident)
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

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ProgressRail activeStep={4} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5ScopeSummary
        evidenceCount={evidenceCount}
        evidenceUrls={scopeEvidenceUrls}
        language={language}
        price={price}
        reduceTransparency={reduceTransparency}
        scope={scope}
        scopeQuote={scopeQuote}
      />
      <WorkerV5ScopeEvidenceGate
        deal={deal}
        language={language}
        onAddPhotos={attachScopePhotos}
        onScopeDescriptionChange={(description) => {
          updateScopeDraft((current) => ({ ...current, description, quote: null }))
        }}
        onScopeReasonChange={(reason) => {
          updateScopeDraft((current) => ({ ...current, reason, quote: null }))
        }}
        onSubmitScopeEvidence={submitScopeEvidence}
        onViewDetails={viewScopeDetails}
        primaryButtonFill={!scopeSubmitDisabled ? <WorkerV5PrimaryButtonFill disabled={false} variant="source" /> : null}
        reduceTransparency={reduceTransparency}
        renderInfoRow={(row) => <WorkerV5ScreenInfoRow icon={row.icon} label={row.label} value={row.value} />}
        scope={scope}
        scopeDescription={scopeDescription}
        scopeEvidenceOpen={scopeEvidenceOpen}
        scopeEvidenceSent={scopeEvidenceSent && !jobIncident}
        scopeMediaNotice={scopeMediaNotice}
        scopePhotos={scopePhotos}
        scopeReason={scopeReason}
        scopeSubmitDisabled={scopeSubmitDisabled}
        scopeSubmitting={scopeSubmitting}
      />
      <WorkerV5ScopeActionRail
        canDraftScopeEvidence={canDraftScopeEvidence}
        hasScopeSubmission={hasScopeSubmission}
        incidentStatus={jobIncident?.status ?? null}
        language={language}
        navigateNext={navigateNext}
        onOpenScopeEditPath={openScopeEditPath}
        onPreviewScopeProposal={previewScopeProposal}
        onRejectScopeQuote={rejectScopeQuote}
        onSubmitScopeProposal={submitScopeProposal}
        onViewScopeDetails={viewScopeDetails}
        reduceTransparency={reduceTransparency}
        scopeQuote={scopeQuote}
        scopeQuoting={scopeQuoting}
      />
    </View>
  )
}

