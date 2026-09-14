import { RfqPricePanel } from '@/components/job/rfq-price-panel'
import { getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import { type SetStateAction, useLayoutEffect, useRef, useState } from 'react'
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Text as RNText, TextInput, View, type TextProps } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { clearStableClientRequestId, stableClientRequestId } from '@/lib/client-request-id'
import { localizeMediaUploadFailure, uploadJobMediaDrafts } from '@/lib/media-upload'
import {
  cameraPermissionAllowsAccess,
  presentBlockedCameraSettings,
  resolveUserInitiatedCameraPermission,
  shouldOfferCameraSettings,
} from '@/lib/user-initiated-camera-permission'
import { workerKaelChatService } from '@/lib/services'
import { type WorkerV5PrivateKaelSession, workerV5PrivateKaelMediaName } from '../chat/use-worker-kael-orb-chat'
import { firstRouteParam } from '../dock/routing'
import { WorkerV5RouteParams } from '../dock/types'
import { WorkerV5CustomerCaseWideMintAura, WorkerV5CustomerZipMintAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { WorkerV5TimerCard } from '../ui/metrics-surfaces'
import { WorkerV5PrimaryButtonFill, WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { styles } from '../worker-v5-flow-styles'
import { WorkerV5InProgressTravelGate } from './active-body-surfaces'
import { WorkerV5ActionRail, WorkerV5SingleSourceActionButton } from './advisory-surfaces'
import { WorkerV5EvidenceTray } from './evidence-surfaces'
import { WorkerV5WorkProgressBoard } from './progress-surfaces'
import { buildWorkerV5WorkBoardItems } from './work-board'
import { type PendingClientRequestRef } from '@/lib/client-request-id'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { WorkerV5RouteMapStage } from './route-map-surfaces'
import { StageFiveWork } from './stage-five/travel-work/stage-five-work'
import type { Actions as StageFiveActions, StageFiveJobStatus, WorkModel as StageFiveWorkModel } from './stage-five/travel-work/stage-five.types'
import { workerV5ArrivalDestinationLabel } from '../ui/route'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type StageFiveMutableStatus = Extract<StageFiveJobStatus, 'arrived' | 'inspecting' | 'repairing'>
const IMAGE_PICKER_TIMEOUT_MS = 45_000

function parseStageFiveMillis(value: string | null | undefined) {
  if (!value) return null
  const millis = Date.parse(value)
  return Number.isFinite(millis) ? millis : null
}

async function withImagePickerDeadline<T>(pickerResult: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('IMAGE_PICKER_TIMEOUT')), IMAGE_PICKER_TIMEOUT_MS)
  })
  try {
    return await Promise.race([pickerResult, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

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
  reduceMotion = false,
  stageFive = false,
  onBackToTravel,
  styleVariant = 'default',
}: {
  actionBusy: boolean
  language: AppLanguage
  navigateJobChat: () => void
  onTravelAction: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  reduceMotion?: boolean
  stageFive?: boolean
  onBackToTravel?: () => void
  styleVariant?: 'default' | 'jobs-review'
}) {
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const rfqTokens = getWorkerThemeTokens(useWorkerThemeMode())
  const router = useRouter()
  const deal = runtime.state.deal
  const isArrivalGateRequested = firstRouteParam(params.ns_arrival_gate) === '1'
  const isAwaitingArrival = Boolean(
    deal && (
      ['worker_matched', 'worker_on_way'].includes(deal.status)
      || (deal.status === 'arrived' && isArrivalGateRequested)
    ),
  )
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
  const [stageFiveDetailsOpen, setStageFiveDetailsOpen] = useState(false)
  const [stageFiveNoteOpen, setStageFiveNoteOpen] = useState(false)
  const [stageFiveNoteDraft, setStageFiveNoteDraft] = useState('')
  const fieldEvidenceSessionRef = useRef<WorkerV5PrivateKaelSession | null>(null)
  const fieldEvidenceRequestRef = useRef<WorkerV5FieldEvidenceRequest | null>(null)
  const fieldEvidenceOperationRef = useRef<{ jobId: string; slot: number } | null>(null)
  const activeFieldEvidenceJobIdRef = useRef<string | null>(null)
  const previousFieldEvidenceJobIdRef = useRef(currentJobId)
  useLayoutEffect(() => {
    if (previousFieldEvidenceJobIdRef.current !== currentJobId) {
      previousFieldEvidenceJobIdRef.current = currentJobId
      setFieldEvidenceState({ busy: false, busySlot: null, confirmation: null, urls: [null, null, null] })
      fieldEvidenceSessionRef.current = null
      fieldEvidenceRequestRef.current = null
      fieldEvidenceOperationRef.current = null
    }
    activeFieldEvidenceJobIdRef.current = currentJobId
  }, [currentJobId])
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
  const progressItems = buildWorkerV5WorkBoardItems(deal, language, evidenceCount)

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
      if (source === 'camera') {
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const permission = await resolveUserInitiatedCameraPermission()
        if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
        if (!cameraPermissionAllowsAccess(permission)) {
          if (shouldOfferCameraSettings(permission)) presentBlockedCameraSettings(language)
          return
        }
      }
      if (activeFieldEvidenceJobIdRef.current !== requestJobId) return

      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await withImagePickerDeadline(source === 'camera'
        ? ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.82,
          })
        : ImagePicker.launchImageLibraryAsync({
            allowsMultipleSelection: false,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.82,
          }))
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
    // Action buttons in Alert are unavailable on react-native-web, so Preview uses the photo library directly.
    if (Platform.OS === 'web') {
      void addFieldEvidence('library', slot)
      return
    }
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
      const result = await withImagePickerDeadline(ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.84,
      }))
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
    if (deal.status === 'inspecting' && !(typeof deal.finalPrice === 'number' && deal.finalPrice > 0)) return
    if (deal.status === 'repairing') {
      router.replace(`/(worker)/jobs?ns_worker_screen=2.10-completion-evidence&job_id=${currentJobId}` as never)
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
              disabled: phaseActionBusy || !(typeof deal.finalPrice === 'number' && deal.finalPrice > 0),
              label: typeof deal.finalPrice === 'number' && deal.finalPrice > 0
                ? textByLanguage(language, 'Bắt đầu công việc', 'Start work')
                : textByLanguage(language, 'Chờ khách xác nhận giá', 'Waiting for price approval'),
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

  const stageFiveStatus = deal && ['arrived', 'inspecting', 'repairing'].includes(deal.status)
    ? deal.status as StageFiveMutableStatus
    : null
  const stageFiveAddressReleased = Boolean(
    addressAccess && (addressAccess.release_stage === 'building_released' || addressAccess.release_stage === 'unit_released'),
  )
  const stageFivePhase = stageFiveStatus === 'arrived'
    ? 'prepare'
    : stageFiveStatus === 'inspecting'
      ? 'working'
      : stageFiveStatus === 'repairing'
        ? 'inspect'
        : stageFiveStatus === 'completed_by_worker'
          ? 'finish'
          : stageFiveStatus === 'completed' || stageFiveStatus === 'closed'
            ? 'handover'
            : null
  const formatStageFiveTime = (value: string | null | undefined) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleTimeString(language === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  }
  const openStageFiveNote = () => {
    setStageFiveNoteDraft(deal?.workerWorkNote ?? '')
    setStageFiveNoteOpen(true)
  }
  const saveStageFiveNote = async () => {
    if (!stageFiveStatus || phaseActionBusy) return
    setPhaseActionBusy(true)
    try {
      const saved = await runtime.actions.workerUpdateStatus(stageFiveStatus, {
        work_session: { action: 'save_note', note: stageFiveNoteDraft },
      })
      if (saved) setStageFiveNoteOpen(false)
    } finally {
      setPhaseActionBusy(false)
    }
  }

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
        routeMapComponent={WorkerV5RouteMapStage}
      />
    )
  }

  if (stageFive) {
    const stageFiveActions: StageFiveActions = {
      back: {
        enabled: true,
        onPress: onBackToTravel ?? (() => router.replace('/(worker)/jobs?ns_worker_screen=2.4-route-eta' as never)),
      },
      chat: { enabled: Boolean(currentJobId), onPress: navigateJobChat },
      call: { enabled: false, onPress: () => undefined, disabledReason: textByLanguage(language, 'Số điện thoại chỉ hiện khi quy trình cấp quyền liên hệ.', 'The phone number appears only when the workflow grants contact access.') },
      details: { enabled: Boolean(currentJobId), onPress: () => setStageFiveDetailsOpen(true) },
      guide: { enabled: Boolean(currentJobId), onPress: () => setStageFiveDetailsOpen(true) },
      progress: { enabled: Boolean(currentJobId), onPress: () => setStageFiveDetailsOpen(true) },
      photo: {
        enabled: Boolean(currentJobId && !fieldEvidenceBusy && evidenceCount < 3),
        onPress: () => chooseFieldEvidenceSource(Math.min(2, Math.max(0, visibleEvidenceUrls.findIndex((url) => !url)))),
      },
      note: { enabled: Boolean(currentJobId), onPress: openStageFiveNote },
      scope: {
        enabled: Boolean(currentJobId && (stageFiveStatus === 'inspecting' || stageFiveStatus === 'repairing')),
        onPress: () => router.replace((currentJobId
          ? `/(worker)/jobs?ns_worker_screen=2.8-scope-change&job_id=${encodeURIComponent(currentJobId)}`
          : '/(worker)/jobs?ns_worker_screen=2.8-scope-change') as never),
      },
      support: { enabled: Boolean(currentJobId), onPress: navigateJobChat },
      editArrival: {
        enabled: Boolean(currentJobId && stageFiveStatus && ['arrived', 'inspecting', 'repairing'].includes(stageFiveStatus)),
        onPress: () => router.replace((currentJobId
          ? `/(worker)/jobs?ns_worker_screen=2.7-in-progress&ns_arrival_gate=1&job_id=${encodeURIComponent(currentJobId)}`
          : '/(worker)/jobs?ns_worker_screen=2.7-in-progress&ns_arrival_gate=1') as never),
      },
      pause: {
        enabled: Boolean(currentJobId && stageFiveStatus === 'repairing' && !phaseActionBusy),
        onPress: async () => {
          if (!stageFiveStatus || phaseActionBusy) return
          setPhaseActionBusy(true)
          try {
            const updated = await runtime.actions.workerUpdateStatus('repairing', {
              work_session: { action: deal?.workPausedAt ? 'resume' : 'pause' },
            })
            if (!updated) throw new Error(textByLanguage(language, 'Chưa thể cập nhật thời gian làm việc.', 'Work time could not be updated.'))
          } finally {
            setPhaseActionBusy(false)
          }
        },
      },
      complete: {
        enabled: stageFiveStatus === 'repairing',
        onPress: () => void advanceWorkPhase(),
      },
    }
    const stageFiveModel: StageFiveWorkModel = {
      jobId: currentJobId,
      stage: 5,
      jobStatus: stageFiveStatus,
      serviceTitle: deal?.broadcast?.problemSummary?.trim() || deal?.draft.description?.trim() || null,
      serviceCategory: deal ? localizedServiceLabel(deal.broadcast?.serviceType ?? deal.draft.serviceType, language) : null,
      addressLine: stageFiveAddressReleased ? workerV5ArrivalDestinationLabel(deal, language) : null,
      photo: deal?.customerEvidencePhotoUrls?.[0] ? { uri: deal.customerEvidencePhotoUrls[0] } : undefined,
      arrivedLabel: formatStageFiveTime(deal?.arrivedAt),
      startedLabel: formatStageFiveTime(deal?.workStartedAt),
      startedAtMs: parseStageFiveMillis(deal?.workStartedAt),
      pausedAtMs: parseStageFiveMillis(deal?.workPausedAt),
      pausedMs: deal?.workPausedMs ?? 0,
      phase: stageFivePhase,
      phaseLabels: language === 'vi' ? ['Đã tới', 'Kiểm tra', 'Đang làm', 'Hồ sơ', 'Hoàn tất'] : ['Arrived', 'Inspection', 'Work in progress', 'Evidence', 'Complete'],
      note: deal?.workerWorkNote ?? null,
      evidenceCount,
      canPrepareCompletion: stageFiveStatus === 'repairing',
    }
    return (
      <>
      <StageFiveWork
          actions={stageFiveActions}
          busy={actionBusy || fieldEvidenceBusy || phaseActionBusy}
          language={language}
          model={stageFiveModel}
          reduceMotion={reduceMotion}
        />
        <Modal visible={stageFiveDetailsOpen} animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setStageFiveDetailsOpen(false)}>
          <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: 48 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#081D36' }}>{textByLanguage(language, 'Hồ sơ công việc', 'Work details')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={textByLanguage(language, 'Đóng hồ sơ công việc', 'Close work details')} onPress={() => setStageFiveDetailsOpen(false)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}>
                <Text style={{ color: '#008D7B', fontWeight: '600' }}>{textByLanguage(language, 'Đóng', 'Close')}</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <WorkerV5InProgressBody
                actionBusy={actionBusy}
                language={language}
                navigateJobChat={navigateJobChat}
                onTravelAction={onTravelAction}
                reduceMotion={reduceMotion}
                reduceTransparency={reduceTransparency}
                runtime={runtime}
              />
            </View>
          </View>
        </Modal>
        <Modal visible={stageFiveNoteOpen} animationType={reduceMotion ? 'none' : 'slide'} transparent onRequestClose={() => setStageFiveNoteOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,29,54,0.22)' }}>
            <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 }}>
              <Text style={{ color: '#081D36', fontSize: 20, fontWeight: '700' }}>{textByLanguage(language, 'Ghi chú nhanh', 'Quick note')}</Text>
              <TextInput
                accessibilityLabel={textByLanguage(language, 'Ghi chú nhanh', 'Quick note')}
                autoFocus
                multiline
                onChangeText={setStageFiveNoteDraft}
                placeholder={textByLanguage(language, 'Thêm ghi chú về tình trạng thực tế, vật tư sử dụng…', 'Add a note about the actual condition or materials used…')}
                style={{ minHeight: 120, borderColor: '#E4EFF0', borderRadius: 16, borderWidth: 1, color: '#081D36', padding: 14, textAlignVertical: 'top' }}
                testID="stage5-note-input"
                value={stageFiveNoteDraft}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={textByLanguage(language, 'Hủy ghi chú', 'Cancel note')} onPress={() => setStageFiveNoteOpen(false)} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderColor: '#E4EFF0', borderRadius: 24, borderWidth: 1 }}>
                  <Text style={{ color: '#496580', fontWeight: '600' }}>{textByLanguage(language, 'Hủy', 'Cancel')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={textByLanguage(language, 'Lưu ghi chú', 'Save note')} disabled={phaseActionBusy} onPress={() => void saveStageFiveNote()} style={{ flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#009F89', borderRadius: 24, opacity: phaseActionBusy ? 0.5 : 1 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{phaseActionBusy ? textByLanguage(language, 'Đang lưu…', 'Saving…') : textByLanguage(language, 'Lưu ghi chú', 'Save note')}</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </>
    )
  }

  return (
    <View style={[styles.sectionStack, styleVariant === 'jobs-review' && styles.sectionStackJobsReview]}>
      <WorkerV5TimerCard deal={deal} language={language} reduceTransparency={reduceTransparency} sourceCount={progressItems.length} styleVariant={styleVariant} />
      {currentJobId && deal?.status === 'inspecting' && deal.finalPrice == null ? (
        <RfqPricePanel jobId={currentJobId} actorRole="worker" language={language} tokens={rfqTokens}
          onChanged={runtime.actions.refreshCurrentJob} />
      ) : null}
      <View style={styleVariant === 'jobs-review' ? styles.jobsReviewContentShell : null} testID={styleVariant === 'jobs-review' ? 'worker-v5-jobs-review-content' : undefined}>
        {progressItems.length ? (
          <WorkerV5WorkProgressBoard
            caseWideAura={WorkerV5CustomerCaseWideMintAura}
            items={progressItems}
            language={language}
            reduceTransparency={reduceTransparency}
            styleVariant={styleVariant}
            zipAura={WorkerV5CustomerZipMintAura}
          />
        ) : null}
        {customerEvidenceUrls.length > 0 ? (
          <>
            <WorkerV5SectionHeader
            action={textByLanguage(language, `${customerEvidenceUrls.length} ảnh`, `${customerEvidenceUrls.length} photos`)}
            title={textByLanguage(language, 'Ảnh hiện trạng từ khách', 'Customer condition photos')}
            styleVariant={styleVariant}
          />
          <WorkerV5EvidenceTray
            emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
            language={language}
            reduceTransparency={reduceTransparency}
            stageLabel={textByLanguage(language, 'Ảnh hiện trạng từ khách', 'Customer condition photos')}
            styleVariant={styleVariant}
            testID="worker-v5-customer-evidence-gallery"
            urls={customerEvidenceUrls}
          />
          </>
        ) : null}
        <WorkerV5SectionHeader
          action={evidenceCount ? textByLanguage(language, `${evidenceCount} tệp`, `${evidenceCount} files`) : textByLanguage(language, 'Chưa có', 'None yet')}
          title={textByLanguage(language, 'Bằng chứng hiện trường', 'On-site evidence')}
          styleVariant={styleVariant}
        />
        <WorkerV5EvidenceTray
          addPhotoDisabled={fieldEvidenceBusy}
          emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
          language={language}
          onAddPhoto={chooseFieldEvidenceSource}
          reduceTransparency={reduceTransparency}
          stageLabel={textByLanguage(language, 'Bằng chứng hiện trường của thợ', 'Worker on-site evidence')}
          styleVariant={styleVariant}
          uploadingSlot={fieldEvidenceBusySlot}
          urls={visibleEvidenceUrls}
        />
        {fieldEvidenceKaelConfirmation ? (
          <Text
            numberOfLines={3}
            style={[styles.fieldEvidenceKaelConfirmation, styleVariant === 'jobs-review' && styles.fieldEvidenceKaelConfirmationJobsReview]}
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
            styleVariant={styleVariant}
            testID={phaseAction.testID}
          />
        ) : null}
        {visiblePhaseActionNotice ? (
          <Text style={[styles.fieldEvidenceKaelConfirmation, styleVariant === 'jobs-review' && styles.fieldEvidenceKaelConfirmationJobsReview]} testID="worker-v5-phase-action-notice">
            {visiblePhaseActionNotice}
          </Text>
        ) : null}
        <WorkerV5ActionRail
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          primaryButtonFill={WorkerV5PrimaryButtonFill}
          zipAura={WorkerV5CustomerZipMintAura}
          onPrimary={() => router.replace((currentJobId
            ? `/(worker)/jobs?ns_worker_screen=2.8-scope-change&job_id=${encodeURIComponent(currentJobId)}`
            : '/(worker)/jobs?ns_worker_screen=2.8-scope-change') as never)}
          onSecondary={navigateJobChat}
          primary={textByLanguage(language, 'Báo đổi phạm vi', 'Report scope change')}
          primaryTestID="worker-v5-in-progress-scope-action"
          primaryVariant="source"
          reduceTransparency={reduceTransparency}
          secondary={textByLanguage(language, 'Hỏi Kael', 'Ask Kael')}
          secondaryTestID="worker-v5-in-progress-kael-action"
          styleVariant={styleVariant}
        />
      </View>
    </View>
  )
}

type WorkerV5FieldEvidenceRequest = {
  createRef: PendingClientRequestRef
  fingerprint: string
  jobId: string
  mediaRefs: string[] | null
  turnRef: PendingClientRequestRef
}
type WorkerV5FieldEvidenceUiState = {
  busy: boolean
  busySlot: number | null
  confirmation: string | null
  urls: (string | null)[]
}

