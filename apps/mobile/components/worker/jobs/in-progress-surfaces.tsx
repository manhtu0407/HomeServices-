import { memo, type SetStateAction, useRef, useState } from 'react'
import { Alert, Text as RNText, View, type TextProps } from 'react-native'
import { type LocalDeal } from '@nestscout/shared'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type AppLanguage } from '@/lib/app-language'
import { clearStableClientRequestId, stableClientRequestId } from '@/lib/client-request-id'
import { localizeMediaUploadFailure, uploadJobMediaDrafts } from '@/lib/media-upload'
import { workerKaelChatService } from '@/lib/services'
import { type WorkerV5PrivateKaelSession, workerV5PrivateKaelMediaName } from '../chat/use-worker-kael-orb-chat'
import { firstRouteParam } from '../dock/routing'
import { WorkerV5RouteParams } from '../dock/types'
import { WorkerV5CustomerCaseWideMintAura, WorkerV5CustomerZipMintAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { WorkerV5TimerCard } from '../ui/metrics-surfaces'
import { WorkerV5PrimaryButtonFill, WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { styles } from '../worker-v5-flow-styles'
import { WorkerV5RouteEtaBody } from './active-body-surfaces'
import { WorkerV5ActionRail, WorkerV5SingleSourceActionButton } from './advisory-surfaces'
import { WorkerV5EvidenceTray } from './evidence-surfaces'
import { WorkerV5EtaSummaryCard } from './map-surfaces'
import { WorkerV5WorkProgressBoard } from './progress-surfaces'
import { useWorkerV5RoutePreview } from './use-worker-route-preview'
import { type PendingClientRequestRef } from '@/lib/client-request-id'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { WorkerV5RouteMapStage } from './route-map-surfaces'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5InProgressBody({
  actionBusy,
  language,
  navigateJobChat,
  onTravelAction,
  reduceTransparency,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  navigateJobChat: () => void
  onTravelAction: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const router = useRouter()
  const deal = runtime.state.deal
  const isArrivalGateRequested = firstRouteParam(params.ns_arrival_gate) === '1'
  const isAwaitingArrival = Boolean(
    deal && (
      ['worker_matched', 'worker_on_way'].includes(deal.status)
      || (deal.status === 'arrived' && isArrivalGateRequested)
    ),
  )
  const briefLines = deal?.broadcast?.prebrief?.filter(Boolean).slice(0, 5) ?? []
  const customerEvidenceUrls = deal?.customerEvidencePhotoUrls ?? []
  const evidenceUrls = deal?.fieldEvidencePhotoUrls ?? []
  const currentJobId = deal?.broadcast?.jobId ?? deal?.id ?? null
  const [fieldEvidenceState, setFieldEvidenceState] = useState<WorkerV5FieldEvidenceUiState>({
    busy: false,
    busySlot: null,
    confirmation: null,
    urls: [null, null, null],
  })
  const {
    busy: fieldEvidenceBusy,
    busySlot: fieldEvidenceBusySlot,
    confirmation: fieldEvidenceKaelConfirmation,
    urls: fieldEvidenceUrls,
  } = fieldEvidenceState
  const setFieldEvidenceBusy = (busy: boolean) => setFieldEvidenceState((current) => ({ ...current, busy }))
  const setFieldEvidenceBusySlot = (busySlot: number | null) => setFieldEvidenceState((current) => ({ ...current, busySlot }))
  const setFieldEvidenceKaelConfirmation = (confirmation: string | null) => setFieldEvidenceState((current) => ({ ...current, confirmation }))
  const setFieldEvidenceUrls = (next: SetStateAction<(string | null)[]>) => setFieldEvidenceState((current) => ({
    ...current,
    urls: typeof next === 'function' ? next(current.urls) : next,
  }))
  const [{ busy: phaseActionBusy, notice: phaseActionNotice }, setPhaseActionState] = useState<{
    busy: boolean
    notice: string | null
  }>({ busy: false, notice: null })
  const setPhaseActionBusy = (busy: boolean) => setPhaseActionState((current) => ({ ...current, busy }))
  const setPhaseActionNotice = (notice: string | null) => setPhaseActionState((current) => ({ ...current, notice }))
  const fieldEvidenceSessionRef = useRef<WorkerV5PrivateKaelSession | null>(null)
  const fieldEvidenceRequestRef = useRef<WorkerV5FieldEvidenceRequest | null>(null)
  const fieldEvidenceOperationRef = useRef<{ jobId: string; slot: number } | null>(null)
  const activeFieldEvidenceJobIdRef = useRef<string | null>(null)
  const previousFieldEvidenceJobIdRef = useRef(currentJobId)
  if (previousFieldEvidenceJobIdRef.current !== currentJobId) {
    previousFieldEvidenceJobIdRef.current = currentJobId
    setFieldEvidenceState({ busy: false, busySlot: null, confirmation: null, urls: [null, null, null] })
    fieldEvidenceSessionRef.current = null
    fieldEvidenceRequestRef.current = null
    fieldEvidenceOperationRef.current = null
  }
  activeFieldEvidenceJobIdRef.current = currentJobId
  const visibleEvidenceUrls: (string | null)[] = [...evidenceUrls]
  fieldEvidenceUrls.forEach((url, slot) => {
    if (!url || visibleEvidenceUrls.includes(url)) return
    if (!visibleEvidenceUrls[slot]) {
      visibleEvidenceUrls[slot] = url
      return
    }
    visibleEvidenceUrls.push(url)
  })
  const evidenceCount = visibleEvidenceUrls.filter((url): url is string => Boolean(url)).length
  const progressItems = briefLines.map((line, index) => ({
    meta: index === briefLines.length - 1 ? textByLanguage(language, 'Đang kiểm', 'Active') : textByLanguage(language, 'Đã đọc', 'Read'),
    state: index === briefLines.length - 1 ? 'active' as const : 'done' as const,
    title: line,
  }))

  const addFieldEvidence = async (source: 'camera' | 'library', slot: number) => {
    if (fieldEvidenceBusy || fieldEvidenceOperationRef.current) return
    const requestJobId = currentJobId
    if (!requestJobId) {
      Alert.alert('Kael', textByLanguage(language, 'Chưa tìm thấy việc đang thực hiện để gắn ảnh.', 'No active job was found to attach this photo.'))
      return
    }
    const operation = { jobId: requestJobId, slot }
    fieldEvidenceOperationRef.current = operation
    let evidenceAttached = false

    try {
      // The post-I/O job guard prevents a picker result from crossing into a newly active job.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
      if (!permission.granted) {
        Alert.alert(
          'Kael',
          textByLanguage(
            language,
            source === 'camera'
              ? 'Cần quyền camera để chụp ảnh hiện trường cho Kael.'
              : 'Cần quyền kho ảnh để gửi ảnh hiện trường cho Kael.',
            source === 'camera'
              ? 'Camera permission is needed to capture on-site evidence for Kael.'
              : 'Photo-library permission is needed to send on-site evidence to Kael.',
          ),
        )
        return
      }

      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.82,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsMultipleSelection: false,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.82,
          })
      if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
      if (result.canceled || result.assets.length === 0) return

      const asset = result.assets[0]
      const fieldEvidenceFingerprint = JSON.stringify({
        fileName: asset.fileName?.trim() ?? null,
        fileSizeBytes: asset.fileSize ?? null,
        job_id: requestJobId,
        language,
        mimeType: asset.mimeType ?? null,
        uri: asset.uri,
      })
      let pendingRequest = fieldEvidenceRequestRef.current
      if (
        !pendingRequest ||
        pendingRequest.jobId !== requestJobId ||
        pendingRequest.fingerprint !== fieldEvidenceFingerprint
      ) {
        pendingRequest = {
          createRef: { current: null },
          fingerprint: fieldEvidenceFingerprint,
          jobId: requestJobId,
          mediaRefs: null,
          turnRef: { current: null },
        }
        fieldEvidenceRequestRef.current = pendingRequest
      }
      setFieldEvidenceBusy(true)
      setFieldEvidenceBusySlot(slot)
      setFieldEvidenceKaelConfirmation(textByLanguage(language, 'Kael đang nhận ảnh hiện trường…', 'Kael is receiving the on-site photo…'))
      let uploadedMediaRefs = pendingRequest.mediaRefs
      if (uploadedMediaRefs === null) {
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const uploadResult = await uploadJobMediaDrafts(requestJobId, [{
          fileName: workerV5PrivateKaelMediaName(asset, slot, language),
          fileSizeBytes: asset.fileSize ?? undefined,
          mimeType: asset.mimeType ?? undefined,
          type: 'image',
          uri: asset.uri,
        }], 'kael_reference')
        if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
        if (!uploadResult.success) {
          setFieldEvidenceKaelConfirmation(textByLanguage(
            language,
            'Chưa thể gắn ảnh hiện trường vào việc lúc này.',
            'The on-site photo could not be attached to the job right now.',
          ))
          return
        }
        uploadedMediaRefs = uploadResult.mediaRefs
        pendingRequest.mediaRefs = uploadedMediaRefs
      }
      evidenceAttached = true

      setFieldEvidenceUrls((current) => current.map((url, index) => index === slot ? uploadedMediaRefs[0] ?? asset.uri : url))
      void runtime.actions.workerRefresh().catch(() => undefined)

      let sessionId = fieldEvidenceSessionRef.current?.jobId === requestJobId
        ? fieldEvidenceSessionRef.current.sessionId
        : null
      if (!sessionId) {
        const createFingerprint = JSON.stringify({
          job_id: requestJobId,
          language,
          mode: 'intake',
        })
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const created = await workerKaelChatService.create({
          client_request_id: stableClientRequestId(pendingRequest.createRef, createFingerprint),
          job_id: requestJobId,
          language,
          mode: 'intake',
        })
        if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
        if (!created.success || created.data.session.job_id !== requestJobId) {
          setFieldEvidenceKaelConfirmation(textByLanguage(language, 'Kael chưa mở được phiên xác nhận hiện trường.', 'Kael could not open the on-site confirmation session.'))
          return
        }
        sessionId = created.data.session.id
        fieldEvidenceSessionRef.current = { jobId: requestJobId, sessionId }
        clearStableClientRequestId(pendingRequest.createRef, createFingerprint)
      }

      const confirmationMessage = textByLanguage(
        language,
        'Tôi đã gửi ảnh hiện trường. Hãy đối chiếu ảnh với phạm vi đang thực hiện, chỉ nêu quan sát có căn cứ và hướng dẫn báo đổi phạm vi nếu có phần phát sinh.',
        'I uploaded an on-site photo. Compare it with the active scope, state only grounded observations, and direct me to report a scope change if extra work is present.',
      )
      const turnFingerprint = JSON.stringify({
        language,
        media_refs: uploadedMediaRefs,
        message: confirmationMessage,
        session_id: sessionId,
      })
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const confirmed = await workerKaelChatService.streamTurn(sessionId, {
        client_request_id: stableClientRequestId(pendingRequest.turnRef, turnFingerprint),
        language,
        media_refs: uploadedMediaRefs,
        message: confirmationMessage,
      }, {
        onStage: () => undefined,
        onToken: () => undefined,
      })
      if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
      if (!confirmed.success) {
        setFieldEvidenceKaelConfirmation(textByLanguage(
          language,
          'Ảnh đã được gắn vào việc, nhưng Kael chưa xác nhận được lúc này.',
          'The photo was attached to the job, but Kael could not confirm it right now.',
        ))
        return
      }
      clearStableClientRequestId(pendingRequest.turnRef, turnFingerprint)
      if (fieldEvidenceRequestRef.current === pendingRequest) {
        fieldEvidenceRequestRef.current = null
      }
      const confirmation = [...confirmed.data.turns]
        .reverse()
        .find((turn) => turn.role === 'kael' && turn.text_content?.trim())
        ?.text_content
        ?.trim()
      setFieldEvidenceKaelConfirmation(confirmation ?? textByLanguage(
        language,
        'Ảnh đã được gắn vào việc. Kael chưa trả về xác nhận mới.',
        'The photo was attached to the job. Kael has not returned a new confirmation.',
      ))
    } catch {
      if (activeFieldEvidenceJobIdRef.current === requestJobId) {
        setFieldEvidenceKaelConfirmation(evidenceAttached
          ? textByLanguage(language, 'Kael chưa xác nhận được ảnh lúc này. Ảnh vẫn không làm thay đổi trạng thái việc.', 'Kael could not confirm this photo right now. The photo did not change the job status.')
          : textByLanguage(language, 'Chưa thể mở hoặc gửi ảnh hiện trường lúc này.', 'The on-site photo could not be opened or uploaded right now.'))
      }
    } finally {
      if (fieldEvidenceOperationRef.current === operation) {
        fieldEvidenceOperationRef.current = null
      }
      if (activeFieldEvidenceJobIdRef.current === requestJobId) {
        setFieldEvidenceBusy(false)
        setFieldEvidenceBusySlot(null)
      }
    }
  }

  const chooseFieldEvidenceSource = (slot: number) => {
    Alert.alert(
      textByLanguage(language, 'Ảnh hiện trường', 'On-site photo'),
      textByLanguage(language, 'Kael sẽ đối chiếu ảnh này với phạm vi công việc hiện tại.', 'Kael will compare this photo with the active work scope.'),
      [
        { style: 'cancel', text: textByLanguage(language, 'Hủy', 'Cancel') },
        { onPress: () => void addFieldEvidence('library', slot), text: textByLanguage(language, 'Kho ảnh', 'Photo library') },
        { onPress: () => void addFieldEvidence('camera', slot), text: textByLanguage(language, 'Chụp ảnh', 'Take photo') },
      ],
    )
  }

  const addressAccess = deal?.broadcast?.addressAccess ?? null
  const workerCheckedIn = addressAccess?.worker_checked_in === true
  const exactUnitReleased = addressAccess?.exact_unit_released === true
  const visiblePhaseActionNotice = exactUnitReleased ? null : phaseActionNotice
  const submitLobbyCheckIn = async () => {
    if (phaseActionBusy || !currentJobId) return
    setPhaseActionBusy(true)
    setPhaseActionNotice(null)
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        setPhaseActionNotice(textByLanguage(
          language,
          'Cần quyền kho ảnh để gửi ảnh check-in tại sảnh.',
          'Photo-library access is needed to send lobby check-in evidence.',
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
      const uploaded = await uploadJobMediaDrafts(currentJobId, [{
        fileName: workerV5PrivateKaelMediaName(asset, 0, language),
        fileSizeBytes: asset.fileSize ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        type: 'image',
        uri: asset.uri,
      }], 'access_check_in')
      if (!uploaded.success) {
        setPhaseActionNotice(localizeMediaUploadFailure(uploaded, language))
        return
      }
      const checkedIn = await runtime.actions.workerUpdateStatus('arrived', {
        access_check_in: {
          checked_in_at: new Date().toISOString(),
          mode: 'manual_photo',
          note: textByLanguage(language, 'Ảnh xác nhận check-in tại sảnh', 'Lobby check-in evidence'),
          photo_urls: uploaded.mediaRefs,
        },
      })
      if (checkedIn) {
        setPhaseActionNotice(textByLanguage(
          language,
          'Đã check-in tại sảnh. Đang chờ khách cho phép lên căn hộ.',
          'Lobby check-in recorded. Waiting for the customer to release unit access.',
        ))
      }
    } catch {
      setPhaseActionNotice(textByLanguage(
        language,
        'Chưa thể hoàn tất check-in lúc này. Vui lòng thử lại.',
        'Check-in could not be completed. Please try again.',
      ))
    } finally {
      setPhaseActionBusy(false)
    }
  }

  const advanceWorkPhase = async () => {
    if (phaseActionBusy || !deal) return
    if (deal.status === 'repairing') {
      router.replace('/(worker)/jobs?ns_worker_screen=2.10-completion-evidence' as never)
      return
    }
    const nextStatus = deal.status === 'arrived'
      ? 'inspecting'
      : deal.status === 'inspecting'
        ? 'repairing'
        : null
    if (!nextStatus) return
    setPhaseActionBusy(true)
    try {
      await runtime.actions.workerUpdateStatus(nextStatus)
    } finally {
      setPhaseActionBusy(false)
    }
  }

  const phaseAction = deal?.status === 'arrived' && addressAccess && !workerCheckedIn
    ? {
        disabled: phaseActionBusy,
        label: phaseActionBusy
          ? textByLanguage(language, 'Đang check-in', 'Checking in')
          : textByLanguage(language, 'Check-in bằng ảnh tại sảnh', 'Check in with a lobby photo'),
        onPress: () => void submitLobbyCheckIn(),
        testID: 'worker-v5-arrival-check-in-action',
      }
    : deal?.status === 'arrived' && addressAccess && !exactUnitReleased
      ? {
          disabled: true,
          label: textByLanguage(language, 'Chờ khách cho thợ lên', 'Waiting for unit access'),
          onPress: () => undefined,
          testID: 'worker-v5-phase-advance-action',
        }
      : deal?.status === 'arrived'
        ? {
            disabled: phaseActionBusy,
            label: textByLanguage(language, 'Bắt đầu kiểm tra', 'Start inspection'),
            onPress: () => void advanceWorkPhase(),
            testID: 'worker-v5-phase-advance-action',
          }
        : deal?.status === 'inspecting'
          ? {
              disabled: phaseActionBusy,
              label: textByLanguage(language, 'Bắt đầu sửa chữa', 'Start work'),
              onPress: () => void advanceWorkPhase(),
              testID: 'worker-v5-phase-advance-action',
            }
          : deal?.status === 'repairing'
            ? {
                disabled: phaseActionBusy,
                label: textByLanguage(language, 'Chuẩn bị hồ sơ hoàn tất', 'Prepare completion evidence'),
                onPress: () => void advanceWorkPhase(),
                testID: 'worker-v5-phase-advance-action',
              }
            : null

  if (isAwaitingArrival) {
    return (
      <WorkerV5InProgressTravelGate
        actionBusy={actionBusy}
        deal={deal}
        language={language}
        navigateJobChat={navigateJobChat}
        onArrivalAcknowledged={() => router.replace('/(worker)/jobs?ns_worker_screen=2.7-in-progress' as never)}
        onTravelAction={onTravelAction}
        reduceTransparency={reduceTransparency}
      />
    )
  }

  return (
    <View style={styles.sectionStack}>
      <WorkerV5TimerCard deal={deal} language={language} reduceTransparency={reduceTransparency} sourceCount={progressItems.length} />
      {progressItems.length ? (
        <WorkerV5WorkProgressBoard
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          items={progressItems}
          language={language}
          reduceTransparency={reduceTransparency}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      ) : null}
      {customerEvidenceUrls.length > 0 ? (
        <>
          <WorkerV5SectionHeader
            action={textByLanguage(language, `${customerEvidenceUrls.length} ảnh`, `${customerEvidenceUrls.length} photos`)}
            title={textByLanguage(language, 'Ảnh hiện trạng từ khách', 'Customer condition photos')}
          />
          <WorkerV5EvidenceTray
            emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
            language={language}
            reduceTransparency={reduceTransparency}
            stageLabel={textByLanguage(language, 'Ảnh hiện trạng từ khách', 'Customer condition photos')}
            testID="worker-v5-customer-evidence-gallery"
            urls={customerEvidenceUrls}
          />
        </>
      ) : null}
      <WorkerV5SectionHeader
        action={evidenceCount ? textByLanguage(language, `${evidenceCount} tệp`, `${evidenceCount} files`) : textByLanguage(language, 'Chưa có', 'None yet')}
        title={textByLanguage(language, 'Bằng chứng hiện trường', 'On-site evidence')}
      />
      <WorkerV5EvidenceTray
        addPhotoDisabled={fieldEvidenceBusy}
        emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
        language={language}
        onAddPhoto={chooseFieldEvidenceSource}
        reduceTransparency={reduceTransparency}
        stageLabel={textByLanguage(language, 'Bằng chứng hiện trường của thợ', 'Worker on-site evidence')}
        uploadingSlot={fieldEvidenceBusySlot}
        urls={visibleEvidenceUrls}
      />
      {fieldEvidenceKaelConfirmation ? (
        <Text
          numberOfLines={3}
          style={styles.fieldEvidenceKaelConfirmation}
          testID="worker-v5-field-evidence-kael-confirmation"
        >
          {fieldEvidenceKaelConfirmation}
        </Text>
      ) : null}
      {phaseAction ? (
        <WorkerV5SingleSourceActionButton
          disabled={phaseAction.disabled}
          label={phaseAction.label}
          onPress={phaseAction.onPress}
          primaryButtonFill={WorkerV5PrimaryButtonFill}
          reduceTransparency={reduceTransparency}
          testID={phaseAction.testID}
        />
      ) : null}
      {visiblePhaseActionNotice ? (
        <Text style={styles.fieldEvidenceKaelConfirmation} testID="worker-v5-phase-action-notice">
          {visiblePhaseActionNotice}
        </Text>
      ) : null}
      <WorkerV5ActionRail
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        primaryButtonFill={WorkerV5PrimaryButtonFill}
        zipAura={WorkerV5CustomerZipMintAura}
        onPrimary={() => router.replace('/(worker)/jobs?ns_worker_screen=2.8-scope-change' as never)}
        onSecondary={navigateJobChat}
        primary={textByLanguage(language, 'Báo đổi phạm vi', 'Report scope change')}
        primaryTestID="worker-v5-in-progress-scope-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Hỏi Kael', 'Ask Kael')}
        secondaryTestID="worker-v5-in-progress-kael-action"
      />
    </View>
  )
}

export const WorkerV5InProgressTravelGate = memo(function WorkerV5InProgressTravelGate({
  actionBusy,
  deal,
  language,
  navigateJobChat,
  onArrivalAcknowledged,
  onTravelAction,
  reduceTransparency,
}: {
  actionBusy: boolean
  deal: LocalDeal | null
  language: AppLanguage
  navigateJobChat: () => void
  onArrivalAcknowledged: () => void
  onTravelAction: () => void
  reduceTransparency: boolean
}) {
  const routePreview = useWorkerV5RoutePreview(deal, true)
  const confirmArrivalGate = () => {
    if (deal?.status === 'arrived') {
      onArrivalAcknowledged()
      return
    }
    onTravelAction()
  }
  return (
    <WorkerV5RouteEtaBody
      actionBusy={actionBusy}
      caseWideAura={WorkerV5CustomerCaseWideMintAura}
      deal={deal}
      etaSummaryComponent={WorkerV5EtaSummaryCard}
      language={language}
      navigateJobChat={navigateJobChat}
      onPrimary={confirmArrivalGate}
      primaryLabel={deal?.status === 'worker_matched'
        ? textByLanguage(language, 'Bắt đầu di chuyển', 'Start travel')
        : textByLanguage(language, 'Xác nhận đã tới', 'Confirm arrival')}
      primaryFill={WorkerV5PrimaryButtonFill}
      reduceTransparency={reduceTransparency}
      routeMapComponent={WorkerV5RouteMapStage}
      routePreview={routePreview}
      zipAura={WorkerV5CustomerZipMintAura}
    />
  )
})

export type WorkerV5FieldEvidenceRequest = {
  createRef: PendingClientRequestRef
  fingerprint: string
  jobId: string
  mediaRefs: string[] | null
  turnRef: PendingClientRequestRef
}
export type WorkerV5FieldEvidenceUiState = {
  busy: boolean
  busySlot: number | null
  confirmation: string | null
  urls: (string | null)[]
}

