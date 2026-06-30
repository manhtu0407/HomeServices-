import { buildWorkerBroadcastBrief, localizedWorkerAreaLabel, localizedWorkerProblemSummary } from './chat-helpers'
import { workerActionCopy } from './copy'
import { styles } from './styles'
import { workerDiagnosisSurface, workerOpaqueCardSurface } from './surface-styles/glass-earnings'
import { workerHomeLiquidSheetSurface } from './surface-styles/home-jobs'
import { type WorkerThemeTokens } from './theme'
import { type WorkerLanguageMode } from './types'
import { GlassModalSheet } from '@/components/ui/glass-modal-sheet'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import { type GlassMaterial } from '@/components/ui/tokens'
import { appCopy, localizedServiceLabel, localizedStatusLabel } from '@/lib/app-language'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { type LocalMediaUploadDraft, uploadJobMediaDrafts } from '@/lib/media-upload'
import { useServiceWorkflow } from '@/lib/use-service-workflow'
import { hasLocalDealCompletionEvidence, LOCAL_WORKFLOW_PRICE_DISCLAIMER, type LocalDealStatus, orderWorkflowPhaseSectionsForSummary, workflowAllowedActionsLabel, workflowBlockedReasonLabel, type WorkflowPhaseContext, workflowSourceOfTruthLabel } from '@nestscout/shared'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useReducer, useState } from 'react'
import { Alert, Text, TextInput, View } from 'react-native'
import { Icon, LiquidPanelGlassOverlay, LiquidSharpKeyline, LiquidSpecularLayer, Metric, MotionSweep, PressButton, SubtleGlassHighlight, WorkerHomeMaterialDepthPlane, WorkerHomeMaterialSubstrate, getWorkerVisibleDeal, kaelHead, useWorkerUi } from './ui'

function workerPhaseActionLabel(phaseContext: WorkflowPhaseContext, language: WorkerLanguageMode) {
  if (phaseContext.phase === 'worker_matched' || phaseContext.phase === 'worker_on_way' || phaseContext.phase === 'arrived') {
    return language === 'en' ? 'Update field status' : 'Cập nhật bước hiện trường'
  }
  if (phaseContext.phase === 'inspecting') {
    return language === 'en' ? 'Continue repair or submit scope evidence' : 'Tiếp tục xử lý hoặc gửi bằng chứng phạm vi'
  }
  if (phaseContext.phase === 'repairing') {
    return language === 'en' ? 'Submit completion evidence' : 'Gửi bằng chứng hoàn tất'
  }
  if (phaseContext.phase === 'matching') {
    return language === 'en' ? 'Accept or decline request' : 'Nhận hoặc từ chối yêu cầu'
  }
  if (phaseContext.phase === 'customer_confirmed_completion') {
    return language === 'en' ? 'Completion is waiting for customer review' : 'Hoàn tất chờ khách đánh giá'
  }
  if (phaseContext.phase === 'paid') {
    return language === 'en' ? 'Customer review may open' : 'Khách có thể đánh giá'
  }
  if (phaseContext.phase === 'done') {
    return language === 'en' ? 'Transaction closed' : 'Giao dịch đã đóng'
  }
  return workflowAllowedActionsLabel(phaseContext.allowedActions, language)
}

function WorkerRequestPhaseInline({ phaseContext }: { phaseContext: WorkflowPhaseContext }) {
  const { language, tokens } = useWorkerUi()
  const visibleSections = orderWorkflowPhaseSectionsForSummary(phaseContext, phaseContext.sections.filter((section) => section.visible && section.role !== 'customer'))
  const primarySection = selectWorkerPhasePrimarySection(phaseContext, visibleSections)
  const primaryArtifact = primarySection?.title[language] ?? (language === 'en' ? 'Worker brief' : 'Tóm tắt cho thợ')
  const gateLabel = workerPhaseGateLabel(phaseContext, language)

  return (
    <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID="worker-request-phase-context">
      <Text style={[styles.kaelBriefTitle, { color: tokens.ink }]} numberOfLines={1}>
        {phaseContext.title[language]}
      </Text>
      <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
        {phaseContext.intent[language]}
      </Text>
      <View style={styles.briefItem}>
        <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
        <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={1}>
          {workflowSourceOfTruthLabel(phaseContext.sourceOfTruth, language)} · {primaryArtifact}
        </Text>
      </View>
      <View style={styles.briefItem}>
        <View style={[styles.briefDot, { backgroundColor: tokens.copper }]} />
        <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={1}>
          {gateLabel}
        </Text>
      </View>
    </View>
  )
}

export function workerPhaseGateLabel(phaseContext: WorkflowPhaseContext, language: WorkerLanguageMode) {
  if (phaseContext.phase === 'matching') {
    return workerPhaseActionLabel(phaseContext, language)
  }
  if (phaseContext.blockedReason) {
    return workflowBlockedReasonLabel(phaseContext.blockedReason, language)
  }
  return workerPhaseActionLabel(phaseContext, language)
}

export function selectWorkerPhasePrimarySection(
  phaseContext: WorkflowPhaseContext,
  visibleSections: WorkflowPhaseContext['sections'],
) {
  if (phaseContext.phase === 'matching') {
    const workerBrief = visibleSections.find((section) => section.id === 'worker_brief')
    if (workerBrief) return workerBrief
  }
  if (phaseContext.phase === 'inspecting') {
    const scopeChange = visibleSections.find((section) => section.id === 'scope_change')
    if (scopeChange) return scopeChange
  }
  if (phaseContext.phase === 'repairing') {
    const completionEvidence = visibleSections.find((section) => section.id === 'completion_evidence')
    if (completionEvidence) return completionEvidence
  }
  return visibleSections.find((section) => section.id === phaseContext.primaryArtifact?.id) ?? visibleSections[0] ?? null
}

export function JobRoomMetaCell({ label, value, valueLines = 2 }: { label: string; value: string; valueLines?: number }) {
  const { reduceTransparency, tokens } = useWorkerUi()

  return (
    <View style={[styles.jobRoomMetaCell, workerOpaqueCardSurface(tokens, 'raised', reduceTransparency)]}>
      <Text style={[styles.metricLabel, { color: tokens.subtle }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.jobRoomMetaValue, { color: tokens.ink }]} numberOfLines={valueLines}>
        {value}
      </Text>
    </View>
  )
}

type WorkerProgressAction =
  | 'worker_start_travel'
  | 'worker_mark_arrived'
  | 'worker_start_inspection'
  | 'worker_start_repair'
  | 'worker_complete_job'

export function getNextWorkerAction(status: LocalDealStatus | null, language: WorkerLanguageMode): { label: string; type: WorkerProgressAction } | null {
  const progressCopy = workerActionCopy[language].progress
  if (status === 'worker_matched') return { label: progressCopy.worker_start_travel, type: 'worker_start_travel' }
  if (status === 'worker_on_way') return { label: progressCopy.worker_mark_arrived, type: 'worker_mark_arrived' }
  if (status === 'arrived') return { label: progressCopy.worker_start_inspection, type: 'worker_start_inspection' }
  if (status === 'inspecting') return { label: progressCopy.worker_start_repair, type: 'worker_start_repair' }
  if (status === 'repairing') return { label: progressCopy.worker_complete_job, type: 'worker_complete_job' }
  return null
}

export function workerStatusForAction(action: WorkerProgressAction): Extract<LocalDealStatus, 'worker_on_way' | 'arrived' | 'inspecting' | 'repairing' | 'completed_by_worker'> | null {
  if (action === 'worker_start_travel') return 'worker_on_way'
  if (action === 'worker_mark_arrived') return 'arrived'
  if (action === 'worker_start_inspection') return 'inspecting'
  if (action === 'worker_start_repair') return 'repairing'
  if (action === 'worker_complete_job') return 'completed_by_worker'
  return null
}

export function useWorkerArrivalCheckIn() {
  const { actions, state } = useFrontendWorkflow()
  const { language } = useWorkerUi()
  const actionCopy = workerActionCopy[language]
  const jobId = getWorkerVisibleDeal(state.deal)?.id ?? ''
  return useCallback(() => {
    const markArrivedWithoutCheckIn = () => {
      Alert.alert(actionCopy.alerts.arrivalSkipConfirmTitle, actionCopy.alerts.arrivalSkipConfirmBody, [
        { text: actionCopy.review, style: 'cancel' },
        { text: actionCopy.alerts.arrivalSkipConfirmCta, onPress: () => void actions.workerUpdateStatus('arrived') },
      ])
    }
    const pickPhotoAndCheckIn = async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert(actionCopy.alerts.arrivalPermissionTitle, actionCopy.alerts.arrivalPermissionBody)
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.86,
        selectionLimit: 1,
      })
      if (result.canceled || !result.assets[0]) return
      const asset = result.assets[0]
      const uploaded = await uploadJobMediaDrafts(jobId, [{
        uri: asset.uri,
        type: 'image',
        fileName: asset.fileName ?? asset.uri.split('/').pop(),
        mimeType: asset.mimeType ?? undefined,
        fileSizeBytes: asset.fileSize ?? undefined,
      }], 'access_check_in')
      if (!uploaded.success) {
        Alert.alert(actionCopy.alerts.arrivalUploadTitle, uploaded.error)
        return
      }
      await actions.workerUpdateStatus('arrived', {
        access_check_in: { mode: 'manual_photo', photo_urls: uploaded.mediaRefs },
      })
    }
    Alert.alert(actionCopy.alerts.arrivalCheckInTitle, actionCopy.alerts.arrivalCheckInBody, [
      { text: actionCopy.review, style: 'cancel' },
      { text: actionCopy.alerts.arrivalSkip, onPress: markArrivedWithoutCheckIn },
      { text: actionCopy.alerts.arrivalPickPhoto, onPress: () => void pickPhotoAndCheckIn() },
    ])
  }, [actionCopy, actions, jobId])
}

type IncomingRequestDraftField =
  | 'cancellationReasonDraft'
  | 'completionNoteDraft'
  | 'scopeReasonDraft'

type IncomingRequestDraftState = {
  cancellationReasonDraft: string
  completionNoteDraft: string
  completionPhotos: LocalMediaUploadDraft[]
  scopeReasonDraft: string
  scopePhotos: LocalMediaUploadDraft[]
}

type IncomingRequestDraftAction =
  | { type: 'clear_cancellation' }
  | { type: 'clear_completion' }
  | { type: 'clear_scope' }
  | { type: 'completion_photo'; photo: LocalMediaUploadDraft }
  | { type: 'field'; field: IncomingRequestDraftField; value: string }
  | { type: 'scope_photo'; photo: LocalMediaUploadDraft }

const EMPTY_INCOMING_REQUEST_DRAFTS: IncomingRequestDraftState = {
  cancellationReasonDraft: '',
  completionNoteDraft: '',
  completionPhotos: [],
  scopeReasonDraft: '',
  scopePhotos: [],
}

function incomingRequestDraftReducer(state: IncomingRequestDraftState, action: IncomingRequestDraftAction): IncomingRequestDraftState {
  switch (action.type) {
    case 'field':
      return { ...state, [action.field]: action.value }
    case 'completion_photo':
      return { ...state, completionPhotos: [...state.completionPhotos, action.photo].slice(0, 5) }
    case 'scope_photo':
      return { ...state, scopePhotos: [...state.scopePhotos, action.photo].slice(0, 5) }
    case 'clear_completion':
      return { ...state, completionNoteDraft: '', completionPhotos: [] }
    case 'clear_scope':
      return { ...state, scopeReasonDraft: '', scopePhotos: [] }
    case 'clear_cancellation':
      return { ...state, cancellationReasonDraft: '' }
    default:
      return state
  }
}

export function IncomingRequestSheet({ compact = false, material = 'standard' }: { compact?: boolean; material?: GlassMaterial }) {
  const { copy, language, tokens } = useWorkerUi()
  const { actions, selectors, state } = useFrontendWorkflow()
  const actionCopy = workerActionCopy[language]
  const confirmArrivalCheckIn = useWorkerArrivalCheckIn()
  const [requestDrafts, requestDraftDispatch] = useReducer(incomingRequestDraftReducer, EMPTY_INCOMING_REQUEST_DRAFTS)
  const [isUploadingScope, setIsUploadingScope] = useState(false)
  const { cancellationReasonDraft, completionNoteDraft, completionPhotos, scopePhotos, scopeReasonDraft } = requestDrafts
  const updateRequestDraft = (field: IncomingRequestDraftField) => (value: string) => requestDraftDispatch({ type: 'field', field, value })
  const deal = getWorkerVisibleDeal(state.deal)
  const jobId = deal?.id ?? ''
  const broadcast = deal?.broadcast ?? null
  const nextAction = selectors.canWorkerAdvance ? getNextWorkerAction(selectors.currentStatus, language) : null
  const localizedProblemSummary = broadcast ? localizedWorkerProblemSummary(broadcast, language) : copy.request.title
  const workerBriefLines = broadcast ? buildWorkerBroadcastBrief(deal, broadcast, selectors.currentStatus, language, selectors.canWorkerSeeFullAddress) : copy.request.brief
  const canRequestScopeChange = selectors.currentStatus === 'inspecting' || selectors.currentStatus === 'repairing'
  const hasBroadcast = Boolean(broadcast)
  const workflow = useServiceWorkflow({
    status: selectors.currentBackendStatus,
    hasAiNotes: Boolean(deal?.estimate?.advisory),
    hasCompletionEvidence: hasLocalDealCompletionEvidence(deal),
    hasCustomerInput: Boolean(deal),
    hasEstimate: Boolean(deal?.estimate),
    hasScopeChange: Boolean(deal?.scopeChange),
  })
  const canRequestCancellation = Boolean(hasBroadcast && !selectors.canWorkerAccept && [
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
  ].includes(selectors.currentStatus ?? ''))
  const secondsRemainingLabel = broadcast?.secondsRemaining === null || broadcast?.secondsRemaining === undefined ? null : language === 'en' ? `${broadcast.secondsRemaining}s` : `${broadcast.secondsRemaining} giây`
  const pickCompletionPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(actionCopy.alerts.completionPermissionTitle, actionCopy.alerts.completionPermissionBody)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      selectionLimit: 1,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const draft: LocalMediaUploadDraft = {
        uri: asset.uri,
        type: 'image',
        fileName: asset.fileName ?? asset.uri.split('/').pop(),
        mimeType: asset.mimeType ?? undefined,
        fileSizeBytes: asset.fileSize ?? undefined,
    }
    requestDraftDispatch({ type: 'completion_photo', photo: draft })
  }
  const pickScopePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(actionCopy.alerts.scopePermissionTitle, actionCopy.alerts.scopePermissionBody)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      selectionLimit: 1,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const draft: LocalMediaUploadDraft = {
        uri: asset.uri,
        type: 'image',
        fileName: asset.fileName ?? asset.uri.split('/').pop(),
        mimeType: asset.mimeType ?? undefined,
        fileSizeBytes: asset.fileSize ?? undefined,
    }
    requestDraftDispatch({ type: 'scope_photo', photo: draft })
  }
  const confirmWorkerProgressAction = (action: { label: string; type: WorkerProgressAction }) => {
    const nextStatus = workerStatusForAction(action.type)
    if (!nextStatus) return
    if (action.type === 'worker_mark_arrived') {
      confirmArrivalCheckIn()
      return
    }
    if (action.type !== 'worker_complete_job') {
      void actions.workerUpdateStatus(nextStatus)
      return
    }

    const completionNote = completionNoteDraft.trim()
    if (completionNote.length < 5) {
      Alert.alert(actionCopy.alerts.completionNoteRequiredTitle, actionCopy.alerts.completionNoteRequiredBody)
      return
    }
    if (completionPhotos.length === 0) {
      Alert.alert(actionCopy.alerts.completionPhotoRequiredTitle, actionCopy.alerts.completionPhotoRequiredBody)
      return
    }

    Alert.alert(
      actionCopy.alerts.completeTitle,
      actionCopy.alerts.completeBody,
      [
        { text: actionCopy.review, style: 'cancel' },
        {
          text: action.label,
          onPress: () => {
            void (async () => {
              const uploaded = await uploadJobMediaDrafts(deal?.id ?? '', completionPhotos, 'after')
              if (!uploaded.success) {
                Alert.alert(actionCopy.alerts.completionUploadTitle, uploaded.error)
                return
              }
              const updated = await actions.workerUpdateStatus(nextStatus, {
                completion_notes: completionNote,
                completion_photo_urls: uploaded.mediaRefs,
              })
              if (!updated) return
              requestDraftDispatch({ type: 'clear_completion' })
            })()
          },
        },
      ],
    )
  }
  const submitScopeChangeRequest = () => {
    const reason = scopeReasonDraft.trim()
    if (reason.length < 10) {
      Alert.alert(actionCopy.alerts.scopeDescriptionTitle, actionCopy.alerts.scopeDescriptionBody)
      return
    }
    Alert.alert(
      actionCopy.alerts.scopeConfirmTitle,
      actionCopy.alerts.scopeConfirmBody,
      [
        { text: actionCopy.review, style: 'cancel' },
        {
          text: actionCopy.send,
          onPress: async () => {
            setIsUploadingScope(true)
            try {
              let photoUrls: string[] = []
              if (scopePhotos.length > 0) {
                const upload = await uploadJobMediaDrafts(jobId, scopePhotos, 'scope_change_evidence')
                if (!upload.success) {
                  Alert.alert(actionCopy.alerts.scopeUploadTitle, upload.error)
                  return
                }
                photoUrls = upload.mediaRefs
              }
              // Worker không gửi price; Kael compute sau khi insert.
              await actions.requestScopeChange({
                new_description: reason,
                reason,
                photo_urls: photoUrls,
              })
              requestDraftDispatch({ type: 'clear_scope' })
            } finally {
              setIsUploadingScope(false)
            }
          },
        },
      ],
    )
  }
  const submitCancellationRequest = () => {
    const reason = cancellationReasonDraft.trim()
    if (reason.length < 10) {
      Alert.alert(actionCopy.alerts.cancelReasonTitle, actionCopy.alerts.cancelReasonBody)
      return
    }
    Alert.alert(
      actionCopy.alerts.cancelConfirmTitle,
      actionCopy.alerts.cancelConfirmBody,
      [
        { text: actionCopy.review, style: 'cancel' },
        {
          text: actionCopy.send,
          onPress: () => {
            requestDraftDispatch({ type: 'clear_cancellation' })
            void actions.requestWorkerCancellation({
              reason,
              evidence_photo_urls: [],
            })
          },
        },
      ],
    )
  }
  const fullAddressLabel = broadcast?.fullAddressVisible ? broadcast.fullAddressLabel ?? null : null
  const canRenderFullAddress = Boolean(selectors.canWorkerSeeFullAddress && fullAddressLabel)
  const addressLabel = canRenderFullAddress
    ? localizedWorkerAreaLabel(fullAddressLabel, language)
    : broadcast?.generalArea
      ? `${localizedWorkerAreaLabel(broadcast.generalArea, language)} · ${actionCopy.hiddenAddress}`
      : appCopy[language].common.noRequest
  const priceDisclaimer = language === 'en'
    ? 'This is a Kael estimate from current evidence. Kael may update it when new scope evidence is added.'
    : LOCAL_WORKFLOW_PRICE_DISCLAIMER

  return (
    <ReduceMotionAwareEntranceView delayMs={compact ? 40 : 80} distanceY={compact ? 8 : 14} testID="worker-request-sheet-motion">
      <GlassModalSheet material={material} mode={tokens.mode} style={[styles.requestSheet, material === 'liquid' ? workerHomeLiquidSheetSurface(tokens) : null, compact ? styles.requestSheetCompact : null]} testID="worker-request-sheet">
      {material === 'liquid' ? <WorkerHomeMaterialSubstrate surface="sheet" /> : null}
      {material === 'liquid' ? <WorkerHomeMaterialDepthPlane surface="sheet" /> : null}
      <SubtleGlassHighlight liquid={material === 'liquid'} />
      {material === 'liquid' ? <LiquidSharpKeyline variant="sheet" /> : null}
      {material === 'liquid' ? <LiquidSpecularLayer variant="sheet" /> : null}
      {material === 'liquid' ? <LiquidPanelGlassOverlay variant="sheet" /> : null}
      <MotionSweep />
      <View style={styles.hiddenMarker} testID="worker-no-live-request-empty-state" />
      <View style={styles.hiddenMarker} testID="worker-safe-address-gate" />
      <View style={styles.rowBetween}>
        <View style={[styles.serviceBadge, { backgroundColor: tokens.mint }]}>
          <Icon name={deal?.draft.serviceType === 'plumbing' ? 'water' : deal?.draft.serviceType === 'cleaning' ? 'spark' : 'bolt'} small />
          <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.serviceBadgeText, { color: tokens.primary }]}>{hasBroadcast ? localizedServiceLabel(deal?.draft.serviceType ?? null, language) : copy.request.service}</Text>
        </View>
        {secondsRemainingLabel && selectors.canWorkerAccept ? (
          <View style={[styles.countdownRing, { borderColor: tokens.primary }]} testID="worker-local-broadcast-countdown">
            <Text style={[styles.countdownText, { color: tokens.primary }]}>{secondsRemainingLabel}</Text>
          </View>
        ) : null}
      </View>

      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={2} style={[styles.requestTitle, { color: tokens.ink }]}>{localizedProblemSummary}</Text>
      <WorkerRequestAddressRow addressLabel={addressLabel} canRenderFullAddress={canRenderFullAddress} tokens={tokens} />
      {hasBroadcast ? <WorkerRequestPhaseInline phaseContext={workflow.phaseContext} /> : null}

      <View style={[styles.kaelBrief, workerDiagnosisSurface(tokens)]} testID="worker-kael-brief">
        <View style={styles.identityRow}>
          <Image source={kaelHead} style={[styles.kaelMini, { borderColor: tokens.borderStrong }]} />
          <Text style={[styles.kaelBriefTitle, { color: tokens.ink }]}>{copy.request.briefTitle}</Text>
        </View>
        {workerBriefLines.map((brief) => (
          <View key={brief} style={styles.briefItem}>
            <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
            <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
              {brief}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.priceRow}>
        <Metric label={copy.request.customerEstimate} value={broadcast?.estimatedPriceLabel ?? (language === 'en' ? 'Waiting for Kael estimate' : 'Chờ Kael ước tính')} />
        <Metric label={copy.request.workerEarns} value={broadcast?.estimatedEarningLabel ?? (language === 'en' ? 'Calculated after Kael price' : 'Chờ Kael tính tiền công')} />
      </View>
      {hasBroadcast ? (
        <Text style={[styles.priceDisclaimer, { color: tokens.muted }]} testID="worker-request-price-disclaimer">
          {priceDisclaimer}
        </Text>
      ) : null}
      {canRequestScopeChange ? (
        <WorkerScopeChangeRequestBox
          actionCopy={actionCopy}
          isUploadingScope={isUploadingScope}
          onPickPhoto={pickScopePhoto}
          onSubmit={submitScopeChangeRequest}
          onUpdateReason={updateRequestDraft('scopeReasonDraft')}
          photoCount={scopePhotos.length}
          reason={scopeReasonDraft}
          tokens={tokens}
        />
      ) : null}
      {selectors.currentStatus === 'scope_change_pending' ? (
        <Text style={[styles.bodyText, { color: tokens.muted }]} testID="worker-scope-change-waiting">
          {actionCopy.scopeWaiting}
        </Text>
      ) : null}
      {canRequestCancellation ? (
        <WorkerCancellationRequestBox
          actionCopy={actionCopy}
          onSubmit={submitCancellationRequest}
          onUpdateReason={updateRequestDraft('cancellationReasonDraft')}
          reason={cancellationReasonDraft}
          tokens={tokens}
        />
      ) : null}
      {nextAction?.type === 'worker_complete_job' ? (
        <WorkerCompletionEvidenceBox
          actionCopy={actionCopy}
          note={completionNoteDraft}
          onPickPhoto={pickCompletionPhoto}
          onUpdateNote={updateRequestDraft('completionNoteDraft')}
          photoCount={completionPhotos.length}
          tokens={tokens}
        />
      ) : null}
      {selectors.canWorkerAccept ? (
        <View style={styles.actionRow}>
          <PressButton label={copy.request.decline} onPress={() => void actions.workerDeclineBroadcast()} secondary />
          <PressButton label={copy.request.accept} onPress={() => void actions.workerAcceptBroadcast()} testID="worker-local-accept-deal" />
        </View>
      ) : nextAction?.type === 'worker_complete_job' ? (
        <PressButton label={nextAction.label} onPress={() => confirmWorkerProgressAction(nextAction)} testID="worker-local-status-action" />
      ) : hasBroadcast ? (
        <Text style={[styles.bodyText, { color: tokens.muted }]}>{localizedStatusLabel(selectors.currentStatus, language)}</Text>
      ) : null}
      </GlassModalSheet>
    </ReduceMotionAwareEntranceView>
  )
}

function WorkerScopeChangeRequestBox({
  actionCopy,
  isUploadingScope,
  onPickPhoto,
  onSubmit,
  onUpdateReason,
  photoCount,
  reason,
  tokens,
}: {
  actionCopy: (typeof workerActionCopy)[WorkerLanguageMode]
  isUploadingScope: boolean
  onPickPhoto: () => void
  onSubmit: () => void
  onUpdateReason: (value: string) => void
  photoCount: number
  reason: string
  tokens: WorkerThemeTokens
}) {
  return (
    <View style={styles.scopeRequestBox} testID="worker-scope-change-request">
      <TextInput
        accessibilityLabel={actionCopy.scopeDescription}
        onChangeText={onUpdateReason}
        placeholder={actionCopy.scopeDescription}
        placeholderTextColor={tokens.subtle}
        style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
        value={reason}
      />
      <View style={styles.actionRow}>
        <PressButton label={actionCopy.addScopePhoto} onPress={onPickPhoto} secondary testID="worker-scope-change-add-photo" />
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={1} testID="worker-scope-change-photo-count">
          {photoCount > 0 ? actionCopy.scopePhotoCount(photoCount) : actionCopy.scopePhotoOptional}
        </Text>
      </View>
      <PressButton disabled={isUploadingScope} label={isUploadingScope ? actionCopy.uploading : actionCopy.scopeSubmit} onPress={onSubmit} secondary testID="worker-scope-change-submit" />
    </View>
  )
}

function WorkerCancellationRequestBox({
  actionCopy,
  onSubmit,
  onUpdateReason,
  reason,
  tokens,
}: {
  actionCopy: (typeof workerActionCopy)[WorkerLanguageMode]
  onSubmit: () => void
  onUpdateReason: (value: string) => void
  reason: string
  tokens: WorkerThemeTokens
}) {
  return (
    <View style={styles.scopeRequestBox} testID="worker-cancellation-request">
      <TextInput
        accessibilityLabel={actionCopy.cancelReason}
        onChangeText={onUpdateReason}
        placeholder={actionCopy.cancelPlaceholder}
        placeholderTextColor={tokens.subtle}
        style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
        value={reason}
      />
      <PressButton label={actionCopy.cancelSubmit} onPress={onSubmit} secondary testID="worker-cancellation-submit" />
    </View>
  )
}

function WorkerCompletionEvidenceBox({
  actionCopy,
  note,
  onPickPhoto,
  onUpdateNote,
  photoCount,
  tokens,
}: {
  actionCopy: (typeof workerActionCopy)[WorkerLanguageMode]
  note: string
  onPickPhoto: () => void
  onUpdateNote: (value: string) => void
  photoCount: number
  tokens: WorkerThemeTokens
}) {
  return (
    <View style={styles.scopeRequestBox} testID="worker-completion-evidence-blocker">
      <TextInput
        accessibilityLabel={actionCopy.completionNote}
        onChangeText={onUpdateNote}
        placeholder={actionCopy.completionNote}
        placeholderTextColor={tokens.subtle}
        style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
        testID="worker-completion-note-input"
        value={note}
      />
      <View style={styles.actionRow}>
        <PressButton label={actionCopy.addCompletionPhoto} onPress={onPickPhoto} secondary testID="worker-completion-add-photo" />
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={1} testID="worker-completion-photo-count">
          {photoCount > 0 ? actionCopy.completionPhotoCount(photoCount) : actionCopy.completionPhotoRequired}
        </Text>
      </View>
    </View>
  )
}

function WorkerRequestAddressRow({
  addressLabel,
  canRenderFullAddress,
  tokens,
}: {
  addressLabel: string
  canRenderFullAddress: boolean
  tokens: WorkerThemeTokens
}) {
  return (
    <View style={styles.areaRow} testID={canRenderFullAddress ? 'worker-full-address-after-accept' : 'worker-general-area-before-accept'}>
      <Icon name="map" small />
      <Text numberOfLines={2} style={[styles.areaText, { color: tokens.muted }]}>{addressLabel}</Text>
    </View>
  )
}
