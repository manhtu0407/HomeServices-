import { appendWorkerChatDraftSegment, buildWorkerBroadcastBrief, getWorkerChatJobId, getWorkerWebSpeechRecognition, isAcceptedLocalWorkerDeal, localizedWorkerAreaLabel, localizedWorkerProblemSummary, workerChatAttachmentDraftLine, workerChatAttachmentFallbackName, workerChatAttachmentPermissionBody, workerChatAttachmentReadyBody, workerChatDealKey, workerChatMessageFromJobMessage, workerChatMessageFromWorkerKaelTurn, workerChatMicListeningBody, workerChatMicUnavailableBody, workerChatStandaloneAccessibilityLabel, workerChatStandaloneInputLabel, workerChatStandaloneReply, workerKaelChatErrorCopy, workerKaelChatProgressCopy, workerKaelChatStatusCopy, workerKaelFeedbackRequiredCopy, workerKaelFeedbackSaveErrorCopy } from './chat-helpers'
import { workerJobRoomRevealDelayMs } from './constants'
import { workerActionCopy, workerCopy } from './copy'
import { styles } from './styles'
import { messageBubbleSurface, workerOpaqueCardSurface } from './surface-styles/glass-earnings'
import { type WorkerChatLocalState, type WorkerLanguageMode, type WorkerWebSpeechRecognition } from './types'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { type KaelChatProgress, type WorkerKaelChatResponse, type WorkerProfileResponse } from '@/lib/api-types'
import { localizedServiceLabel, localizedStatusLabel } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { type LocalMediaUploadDraft, uploadJobMediaDrafts } from '@/lib/media-upload'
import { workerKaelChatService } from '@/lib/services'
import { useJobChatThread } from '@/lib/use-job-chat-thread'
import { useServiceWorkflow } from '@/lib/use-service-workflow'
import { hasLocalDealCompletionEvidence, workflowBlockedReasonLabel } from '@home-services/shared'
import * as ImagePicker from 'expo-image-picker'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Platform, Text, View } from 'react-native'
import { JobRoomBriefBlock, JobRoomKaelMessage, JobRoomProcessCard, SequentialJobRoomReveal, WorkerChatComposerDock, WorkerChatReferenceWelcome, WorkerKaelParityPanel } from './chat-parts'
import { JobRoomMetaCell } from './job-offer'
import { CompactWorkerPresenceMap } from './map'
import { WorkerFrame } from './shell'
import { Icon, getWorkerVisibleDeal, resetWorkerChatWebScrollPosition, useWorkerFrameCopy, useWorkerUi } from './ui'

function createWorkerChatLocalState(): WorkerChatLocalState {
  return { draft: '', localMessages: [], mediaDrafts: [], reveal: { requested: 0, step: 0 } }
}

export function WorkerChatSurface() {
  const copy = useWorkerFrameCopy()

  return (
    <WorkerFrame active="chat" eyebrow={copy.chat.eyebrow} hideDock title={copy.chat.title} testID="worker-chat-surface">
      <WorkerChatContent />
    </WorkerFrame>
  )
}

function useWorkerChatComposerActions({
  attachLabel,
  chatCanEdit,
  chatCanSend,
  chatInputPlaceholder,
  language,
  micLabel,
  setChatLocalState,
  startJobRoomReveal,
}: {
  attachLabel: string
  chatCanEdit: boolean
  chatCanSend: boolean
  chatInputPlaceholder: string
  language: WorkerLanguageMode
  micLabel: string
  setChatLocalState: (updater: (current: WorkerChatLocalState) => WorkerChatLocalState) => void
  startJobRoomReveal: () => void
}) {
  const speechRecognitionRef = useRef<WorkerWebSpeechRecognition | null>(null)
  const appendDraftNote = useCallback((note: string) => {
    setChatLocalState((current) => ({
      ...current,
      draft: appendWorkerChatDraftSegment(current.draft, note),
      reveal: current.reveal.requested >= 1 ? current.reveal : { ...current.reveal, requested: 1 },
    }))
  }, [setChatLocalState])

  const handleWorkerAttachPress = useCallback(async () => {
    startJobRoomReveal()
    if (!chatCanEdit) {
      Alert.alert(attachLabel, chatInputPlaceholder)
      return
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(attachLabel, workerChatAttachmentPermissionBody(language))
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
    const fileName = asset.fileName ?? asset.uri.split('/').pop() ?? workerChatAttachmentFallbackName(language)
    const draft: LocalMediaUploadDraft = {
      fileName,
      fileSizeBytes: asset.fileSize ?? undefined,
      mimeType: asset.mimeType ?? undefined,
      type: 'image',
      uri: asset.uri,
    }
    setChatLocalState((current) => ({
      ...current,
      mediaDrafts: [...current.mediaDrafts, draft].slice(-5),
    }))
    appendDraftNote(workerChatAttachmentDraftLine(language, fileName))
    Alert.alert(attachLabel, workerChatAttachmentReadyBody(language, chatCanSend))
  }, [appendDraftNote, attachLabel, chatCanEdit, chatCanSend, chatInputPlaceholder, language, setChatLocalState, startJobRoomReveal])

  const handleWorkerMicPress = useCallback(() => {
    startJobRoomReveal()
    if (!chatCanEdit) {
      Alert.alert(micLabel, chatInputPlaceholder)
      return
    }
    const SpeechRecognition = getWorkerWebSpeechRecognition()
    if (!SpeechRecognition) {
      Alert.alert(micLabel, workerChatMicUnavailableBody(language))
      return
    }
    try {
      speechRecognitionRef.current?.stop?.()
      const recognition = new SpeechRecognition()
      speechRecognitionRef.current = recognition
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = language === 'en' ? 'en-US' : 'vi-VN'
      recognition.maxAlternatives = 1
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim()
        if (transcript) appendDraftNote(transcript)
      }
      recognition.onerror = () => {
        Alert.alert(micLabel, workerChatMicUnavailableBody(language))
      }
      recognition.onend = () => {
        if (speechRecognitionRef.current === recognition) speechRecognitionRef.current = null
      }
      recognition.start()
      Alert.alert(micLabel, workerChatMicListeningBody(language))
    } catch {
      speechRecognitionRef.current = null
      Alert.alert(micLabel, workerChatMicUnavailableBody(language))
    }
  }, [appendDraftNote, chatCanEdit, chatInputPlaceholder, language, micLabel, startJobRoomReveal])

  return { handleWorkerAttachPress, handleWorkerMicPress }
}

function WorkerChatContent() {
  const { copy, language, reduceTransparency, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const { session } = useAuth()
  const { selectors, state, workerProfile } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast ?? null
  const dealChatKey = workerChatDealKey(deal)
  const [chatLocalState, setChatLocalState] = useState(createWorkerChatLocalState)
  const [workerKaelChat, setWorkerKaelChat] = useState<WorkerKaelChatResponse | null>(null)
  const [workerKaelChatError, setWorkerKaelChatError] = useState<string | null>(null)
  const [workerKaelChatLoading, setWorkerKaelChatLoading] = useState(false)
  const [workerKaelChatSendingJobId, setWorkerKaelChatSendingJobId] = useState<string | null>(null)
  const [workerKaelLiveProgress, setWorkerKaelLiveProgress] = useState<{ jobId: string; progress: KaelChatProgress } | null>(null)
  const [workerKaelPendingMessage, setWorkerKaelPendingMessage] = useState<{ jobId: string; text: string } | null>(null)
  const [workerKaelStreamingText, setWorkerKaelStreamingText] = useState<{ jobId: string; text: string } | null>(null)
  const [workerKaelFeedbackOpen, setWorkerKaelFeedbackOpen] = useState(false)
  const [workerKaelFeedbackValue, setWorkerKaelFeedbackValue] = useState('')
  const [workerKaelFeedbackError, setWorkerKaelFeedbackError] = useState<string | null>(null)
  const [workerKaelFeedbackSaving, setWorkerKaelFeedbackSaving] = useState(false)
  const [workerKaelFeedbackSent, setWorkerKaelFeedbackSent] = useState(false)
  const [workerTrainingConsent, setWorkerTrainingConsent] = useState(false)
  const [workerTrainingConsentSaving, setWorkerTrainingConsentSaving] = useState(false)
  const draft = chatLocalState.draft
  const jobRoomReveal = chatLocalState.reveal
  const activeDealChatKeyRef = useRef(dealChatKey)
  const localMessageIdRef = useRef(0)
  const workerChatJobId = getWorkerChatJobId(deal)
  const activeWorkerChatJobIdRef = useRef<string | null>(workerChatJobId)
  const workerKaelChatSending = Boolean(workerChatJobId && workerKaelChatSendingJobId === workerChatJobId)
  const canSendWorkerKaelMessage = Boolean(deal && isAcceptedLocalWorkerDeal(deal))
  const workflow = useServiceWorkflow({
    status: selectors.currentBackendStatus,
    hasAiNotes: Boolean(deal?.estimate?.advisory),
    hasCompletionEvidence: hasLocalDealCompletionEvidence(deal),
    hasCustomerInput: Boolean(deal),
    hasEstimate: Boolean(deal?.estimate),
    hasScopeChange: Boolean(deal?.scopeChange),
  })
  const chatSection = workflow.phaseContext.sections.find((section) => section.id === 'job_chat')
  const chatCanRead = Boolean(workerChatJobId && chatSection?.visible)
  const chatCanSend = Boolean(chatCanRead && canSendWorkerKaelMessage && !chatSection?.lockedReason)
  const chatIsStandalonePreview = !workerChatJobId && !broadcast
  const chatCanEdit = chatCanSend || chatIsStandalonePreview
  const chatLockedReason = chatSection?.lockedReason ? workflowBlockedReasonLabel(chatSection.lockedReason, language) : null
  const jobChat = useJobChatThread(workerChatJobId, chatCanRead)
  const activeWorkerKaelChatState = workerKaelChat?.session.job_id === workerChatJobId ? workerKaelChat : null
  const visibleWorkerKaelChatError = workerChatJobId && chatCanRead ? workerKaelChatError : null
  const visibleWorkerKaelChatLoading = Boolean(workerChatJobId && chatCanRead && workerKaelChatLoading)
  const visibleWorkerKaelLiveProgress = workerChatJobId && chatCanRead && workerKaelLiveProgress?.jobId === workerChatJobId ? workerKaelLiveProgress.progress : null
  const visibleWorkerKaelStreamingText = workerChatJobId && chatCanRead && workerKaelStreamingText?.jobId === workerChatJobId ? workerKaelStreamingText.text : ''
  const workerKaelMessages = activeWorkerKaelChatState
    ? activeWorkerKaelChatState.turns.map((turn) => workerChatMessageFromWorkerKaelTurn(turn, language))
    : []
  const workerKaelPendingMessages = workerKaelPendingMessage
    && workerKaelPendingMessage.jobId === workerChatJobId
    ? [{ id: 'worker-kael-pending-message', mine: true, system: false, text: workerKaelPendingMessage.text, who: copy.chat.worker }]
    : []
  const renderedMessages = [
    ...chatLocalState.localMessages,
    ...workerKaelMessages,
    ...workerKaelPendingMessages,
    ...jobChat.messages.map((message) => workerChatMessageFromJobMessage(message, session?.user.id ?? null, language)),
  ]
  const hasAnyWorkerKaelMessage = Boolean(broadcast || renderedMessages.length > 0)
  const showReferenceWelcome = !broadcast && renderedMessages.length === 0 && jobRoomReveal.requested === 0
  const workerGreeting = workerChatGreetingLabel(workerProfile, language)
  const chatInputPlaceholder = chatCanSend
    ? copy.chat.input
    : chatIsStandalonePreview
      ? workerChatStandaloneAccessibilityLabel(language)
      : chatLockedReason ?? (broadcast ? copy.chat.lockedGate : copy.chat.waitingInput)
  const visibleChatInputPlaceholder = chatCanSend
    ? copy.chat.input
    : chatIsStandalonePreview
      ? workerChatStandaloneInputLabel(language)
      : copy.chat.waitingInput
  const hiddenAddressLabel = workerActionCopy[language].hiddenAddress
  const jobAreaLabel = broadcast?.generalArea ? localizedWorkerAreaLabel(broadcast.generalArea, language) : hiddenAddressLabel
  const fullAddressLabel = broadcast?.fullAddressVisible ? broadcast.fullAddressLabel ?? null : null
  const jobAddressLabel = selectors.canWorkerSeeFullAddress && fullAddressLabel ? localizedWorkerAreaLabel(fullAddressLabel, language) : jobAreaLabel
  const jobStatusLabel = localizedStatusLabel(selectors.currentStatus, language)
  const jobRoomMeta = broadcast ? [
    { label: copy.chat.serviceLabel, value: localizedServiceLabel(broadcast.serviceType, language) },
    { label: copy.chat.problemLabel, value: localizedWorkerProblemSummary(broadcast, language) },
    { label: copy.chat.areaLabel, value: jobAddressLabel },
    { label: copy.chat.statusLabel, value: jobStatusLabel },
  ] : []
  const jobRoomGate = chatCanSend ? copy.chat.acceptedGate : chatLockedReason ?? (broadcast ? copy.chat.lockedGate : copy.chat.waitingBody)
  const jobBriefLines = broadcast ? buildWorkerBroadcastBrief(deal, broadcast, selectors.currentStatus, language, selectors.canWorkerSeeFullAddress) : []
  const maxRevealStep = broadcast ? 4 : 3
  const targetRevealStep = Math.min(maxRevealStep, jobRoomReveal.requested)
  const showJobRoomProcess = jobRoomReveal.step >= 1
  const showJobRoomMessage = jobRoomReveal.step >= 2
  const showJobRoomBrief = jobRoomReveal.step >= 3
  const showJobRoomDetails = jobRoomReveal.step >= 4
  const showWorkerKaelStatusOutsideReveal = Boolean(
    broadcast &&
    !showJobRoomDetails &&
    (visibleWorkerKaelChatError || visibleWorkerKaelChatLoading || workerKaelChatSending || visibleWorkerKaelLiveProgress),
  )
  const startJobRoomReveal = () => {
    setChatLocalState((current) => current.reveal.requested >= 1 ? current : { ...current, reveal: { ...current.reveal, requested: 1 } })
  }
  const { handleWorkerAttachPress, handleWorkerMicPress } = useWorkerChatComposerActions({
    attachLabel: copy.chat.attach,
    chatCanEdit,
    chatCanSend,
    chatInputPlaceholder,
    language,
    micLabel: copy.chat.mic,
    setChatLocalState,
    startJobRoomReveal,
  })
  useEffect(() => {
    activeWorkerChatJobIdRef.current = workerChatJobId
  }, [workerChatJobId])
  const isActiveWorkerChatJob = useCallback((jobId: string | null) => Boolean(jobId && activeWorkerChatJobIdRef.current === jobId), [])
  const clearWorkerKaelTransientState = useCallback((jobId: string) => {
    setWorkerKaelChatSendingJobId((current) => (current === jobId ? null : current))
    setWorkerKaelLiveProgress((current) => (current?.jobId === jobId ? null : current))
    setWorkerKaelPendingMessage((current) => (current?.jobId === jobId ? null : current))
    setWorkerKaelStreamingText((current) => (current?.jobId === jobId ? null : current))
  }, [])
  const advanceJobRoomReveal = () => {
    setChatLocalState((current) => {
      const nextRequested = Math.min(maxRevealStep, Math.max(current.reveal.requested, current.reveal.step + 1))
      return nextRequested === current.reveal.requested ? current : { ...current, reveal: { ...current.reveal, requested: nextRequested } }
    })
  }
  const createWorkerKaelChatSessionForStream = async (jobId: string, chatLanguage: WorkerLanguageMode) => {
    const result = await workerKaelChatService.create({
      job_id: jobId,
      media_refs: [],
      language: chatLanguage,
    })
    if (!isActiveWorkerChatJob(jobId)) {
      clearWorkerKaelTransientState(jobId)
      return null
    }
    if (!result.success || result.data.session.job_id !== jobId) return null
    return result.data
  }

  useEffect(() => {
    if (activeDealChatKeyRef.current === dealChatKey) return
    setChatLocalState(createWorkerChatLocalState())
    setWorkerKaelChat(null)
    setWorkerKaelChatError(null)
    setWorkerKaelChatLoading(false)
    setWorkerKaelChatSendingJobId(null)
    setWorkerKaelLiveProgress(null)
    setWorkerKaelPendingMessage(null)
    setWorkerKaelStreamingText(null)
    activeDealChatKeyRef.current = dealChatKey
  }, [dealChatKey])

  useEffect(() => {
    let cancelled = false
    if (!workerChatJobId || !chatCanRead) {
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      const listResult = await workerKaelChatService.list()
      if (cancelled) return
      if (!listResult.success) {
        setWorkerKaelChatLoading(false)
        setWorkerKaelChatError(workerKaelChatErrorCopy(language))
        return
      }
      const sessionForJob = listResult.data.sessions.find((item) => item.job_id === workerChatJobId)
      if (!sessionForJob) {
        setWorkerKaelChat(null)
        setWorkerKaelChatLoading(false)
        return
      }
      const chatResult = await workerKaelChatService.get(sessionForJob.id)
      if (cancelled) return
      setWorkerKaelChatLoading(false)
      if (chatResult.success) {
        setWorkerKaelChatError(null)
        setWorkerKaelChat(chatResult.data)
      } else {
        setWorkerKaelChatError(workerKaelChatErrorCopy(language))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chatCanRead, language, workerChatJobId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await workerKaelChatService.getTrainingConsent()
      if (cancelled) return
      if (result.success) setWorkerTrainingConsent(result.data.training_consent)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (jobRoomReveal.step >= targetRevealStep) return
    const revealDelayMs = jobRoomReveal.step === 0 ? 80 : workerJobRoomRevealDelayMs
    const revealTimer = setTimeout(() => {
      setChatLocalState((current) => {
        const nextTargetRevealStep = Math.min(maxRevealStep, current.reveal.requested)
        if (current.reveal.step >= nextTargetRevealStep) return current
        return { ...current, reveal: { ...current.reveal, step: Math.min(nextTargetRevealStep, current.reveal.step + 1) } }
      })
    }, reduceMotion ? 0 : revealDelayMs)

    return () => {
      clearTimeout(revealTimer)
    }
  }, [jobRoomReveal.step, maxRevealStep, reduceMotion, targetRevealStep])

  const submitWorkerChatMessage = async () => {
    if (!chatCanEdit) return
    const value = draft.trim()
    if (!value) return
    if (!chatCanSend) {
      localMessageIdRef.current += 1
      const workerMessageId = `worker-local-chat-${localMessageIdRef.current}`
      localMessageIdRef.current += 1
      const kaelMessageId = `worker-local-chat-${localMessageIdRef.current}`
      setChatLocalState((current) => ({
        ...current,
        draft: '',
        mediaDrafts: [],
        localMessages: [
          ...current.localMessages,
          { id: workerMessageId, mine: true, system: false, text: value, who: copy.chat.worker },
          { id: kaelMessageId, mine: false, system: true, text: workerChatStandaloneReply(language), who: copy.chat.kael },
        ],
      }))
      return
    }
    if (!workerChatJobId) return
    const activeJobId = workerChatJobId
    setWorkerKaelChatSendingJobId(activeJobId)
    setWorkerKaelChatError(null)
    setWorkerKaelLiveProgress(null)
    setWorkerKaelStreamingText(null)
    setWorkerKaelPendingMessage({ jobId: activeJobId, text: value })
    let mediaRefs: string[] = []
    if (chatLocalState.mediaDrafts.length > 0) {
      const uploaded = await uploadJobMediaDrafts(activeJobId, chatLocalState.mediaDrafts, 'before')
      if (!isActiveWorkerChatJob(activeJobId)) {
        clearWorkerKaelTransientState(activeJobId)
        return
      }
      if (!uploaded.success) {
        setWorkerKaelChatSendingJobId(null)
        setWorkerKaelPendingMessage(null)
        setWorkerKaelChatError(uploaded.error)
        Alert.alert(copy.chat.sendErrorTitle, uploaded.error)
        return
      }
      mediaRefs = uploaded.mediaRefs
    }
    const activeWorkerKaelChat = workerKaelChat?.session.job_id === activeJobId
      ? workerKaelChat
      : await createWorkerKaelChatSessionForStream(activeJobId, language)
    if (!isActiveWorkerChatJob(activeJobId)) {
      clearWorkerKaelTransientState(activeJobId)
      return
    }
    if (!activeWorkerKaelChat) {
      setWorkerKaelChatSendingJobId(null)
      setWorkerKaelPendingMessage(null)
      setWorkerKaelChatError(workerKaelChatErrorCopy(language))
      Alert.alert(copy.chat.sendErrorTitle, copy.chat.sendErrorBody)
      return
    }
    setWorkerKaelChat(activeWorkerKaelChat)
    const turnInput = { message: value, media_refs: mediaRefs, language }
    const result = await workerKaelChatService.streamTurn(activeWorkerKaelChat.session.id, turnInput, {
      onStage: (event) => {
        if (isActiveWorkerChatJob(activeJobId)) setWorkerKaelLiveProgress({ jobId: activeJobId, progress: event.progress })
      },
      onToken: (event) => {
        if (event.field === 'worker_assist' && isActiveWorkerChatJob(activeJobId)) {
          setWorkerKaelStreamingText((current) => ({
            jobId: activeJobId,
            text: current?.jobId === activeJobId ? `${current.text}${event.delta}` : event.delta,
          }))
        }
      },
      onResult: (event) => {
        if (event.data.session.job_id !== activeJobId || !isActiveWorkerChatJob(activeJobId)) return
        setWorkerKaelChat(event.data)
        setWorkerKaelLiveProgress(event.data.session.progress ? { jobId: activeJobId, progress: event.data.session.progress } : null)
      },
    })
    if (!isActiveWorkerChatJob(activeJobId)) {
      clearWorkerKaelTransientState(activeJobId)
      return
    }
    setWorkerKaelChatSendingJobId(null)
    setWorkerKaelPendingMessage(null)
    setWorkerKaelStreamingText(null)
    if (!result.success) {
      setWorkerKaelLiveProgress(null)
      setWorkerKaelChatError(workerKaelChatErrorCopy(language))
      Alert.alert(copy.chat.sendErrorTitle, copy.chat.sendErrorBody)
      return
    }
    if (result.data.session.job_id !== activeJobId) {
      setWorkerKaelLiveProgress(null)
      setWorkerKaelChatError(workerKaelChatErrorCopy(language))
      Alert.alert(copy.chat.sendErrorTitle, copy.chat.sendErrorBody)
      return
    }
    setWorkerKaelChat(result.data)
    setChatLocalState((current) => ({
      ...current,
      draft: '',
      mediaDrafts: [],
      reveal: current.reveal.requested >= maxRevealStep ? current.reveal : { ...current.reveal, requested: maxRevealStep },
    }))
  }
  const submitWorkerKaelFeedback = async () => {
    if (workerKaelFeedbackSaving) return
    const message = workerKaelFeedbackValue.trim()
    if (message.length < 8) {
      setWorkerKaelFeedbackError(workerKaelFeedbackRequiredCopy(language))
      return
    }
    setWorkerKaelFeedbackSaving(true)
    setWorkerKaelFeedbackError(null)
    const result = await workerKaelChatService.submitFeedback({
      language,
      message,
      source: 'worker_chat',
    })
    setWorkerKaelFeedbackSaving(false)
    if (!result.success) {
      setWorkerKaelFeedbackError(workerKaelFeedbackSaveErrorCopy(language))
      return
    }
    setWorkerKaelFeedbackSent(true)
    setWorkerKaelFeedbackOpen(false)
    setWorkerKaelFeedbackValue('')
  }
  const toggleWorkerTrainingConsent = async () => {
    if (workerTrainingConsentSaving) return
    const nextConsent = !workerTrainingConsent
    setWorkerTrainingConsentSaving(true)
    const result = await workerKaelChatService.setTrainingConsent({
      language,
      source: 'worker_chat',
      training_consent: nextConsent,
    })
    setWorkerTrainingConsentSaving(false)
    if (result.success) setWorkerTrainingConsent(result.data.training_consent)
  }
  const focusWorkerKaelComposer = () => {
    if (!chatIsStandalonePreview) startJobRoomReveal()
    stabilizeWorkerChatWebLayout()
  }
  const canSubmitWorkerDraft = Boolean(draft.trim() && chatCanEdit && !jobChat.sending && !workerKaelChatSending)

  return (
    <View style={[styles.chatShell, showReferenceWelcome ? styles.chatShellReference : null]} testID="worker-chat-kael-relay">
      <View style={styles.hiddenMarker} testID="worker-kael-client-chatbox-parity" />
      <View style={styles.hiddenMarker} testID="worker-kael-empty-chat-state" />
      <View style={[styles.kaelClientStage, showReferenceWelcome ? styles.kaelClientStageReference : !hasAnyWorkerKaelMessage ? styles.kaelClientStageEmpty : null]} testID="worker-kael-conversation-feed">
        <View style={[styles.jobRoomRevealStack, showReferenceWelcome ? styles.jobRoomRevealStackReference : null]} testID="worker-jobroom-sequential-content">
          {showJobRoomProcess ? (
            <SequentialJobRoomReveal step={1} testID="worker-jobroom-process-reveal">
              <JobRoomProcessCard broadcast={broadcast} canSend={chatCanSend} onAdvance={advanceJobRoomReveal} />
            </SequentialJobRoomReveal>
          ) : showReferenceWelcome ? null : (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.jobRoomProcessHidden} testID="worker-jobroom-process-reserve">
              <JobRoomProcessCard broadcast={broadcast} canSend={chatCanSend} onAdvance={advanceJobRoomReveal} />
            </View>
          )}
          {!broadcast ? (
            <View style={[styles.jobRoomStack, showReferenceWelcome ? styles.workerChatReferenceCenter : null]} testID="worker-kael-empty-chat-canvas">
              {/* The animated waiting room only appears after the reveal sequence
                  is requested (reveal.requested starts at 0 with no job), so the
                  Nhắn tab would otherwise show a fully blank screen. Always render
                  an honest empty state with copy — parity with the customer chat
                  empty state. */}
              {showReferenceWelcome ? (
                <WorkerChatReferenceWelcome greeting={workerGreeting} />
              ) : !showJobRoomMessage && renderedMessages.length === 0 ? (
                <View style={[styles.workerChatStaticEmpty, workerOpaqueCardSurface(tokens, 'warm', reduceTransparency)]} testID="worker-chat-static-empty-state">
                  <Text style={[styles.workerChatStaticEmptyTitle, { color: tokens.ink }]} numberOfLines={2}>
                    {copy.chat.emptyTitle}
                  </Text>
                  <Text style={[styles.workerChatStaticEmptyBody, { color: tokens.muted }]} numberOfLines={3}>
                    {copy.chat.emptyBody}
                  </Text>
                </View>
              ) : null}
              {renderedMessages.length > 0 ? (
                <View style={styles.chatStack} testID="worker-chat-standalone-thread">
                  {renderedMessages.map((message) => (
                    <ChatBubble key={message.id} {...message} />
                  ))}
                  <WorkerKaelChatStatusBubble error={visibleWorkerKaelChatError} loading={visibleWorkerKaelChatLoading} progress={visibleWorkerKaelLiveProgress ?? activeWorkerKaelChatState?.session.progress ?? null} sending={workerKaelChatSending} streamingText={visibleWorkerKaelStreamingText} />
                </View>
              ) : null}
              {showJobRoomMessage ? (
                <SequentialJobRoomReveal step={2} testID="worker-jobroom-waiting-room-reveal">
                  <JobRoomKaelMessage body={copy.chat.waitingBody} kicker={copy.chat.jobRoomTitle} testID="worker-jobroom-waiting-room" title={copy.chat.waitingTitle} />
                </SequentialJobRoomReveal>
              ) : null}
              {showJobRoomBrief ? (
                <SequentialJobRoomReveal step={3} testID="worker-jobroom-empty-brief-reveal">
                  <JobRoomBriefBlock body={copy.chat.briefBody} testID="worker-jobroom-empty-brief-shell" title={copy.chat.briefTitle} />
                  {renderedMessages.length > 0 && workerChatJobId ? (
                    <View style={styles.chatStack}>
                      {renderedMessages.map((message) => (
                        <ChatBubble key={message.id} {...message} />
                      ))}
                      <WorkerKaelChatStatusBubble error={visibleWorkerKaelChatError} loading={visibleWorkerKaelChatLoading} progress={visibleWorkerKaelLiveProgress ?? activeWorkerKaelChatState?.session.progress ?? null} sending={workerKaelChatSending} streamingText={visibleWorkerKaelStreamingText} />
                    </View>
                  ) : null}
                </SequentialJobRoomReveal>
              ) : null}
            </View>
          ) : (
            <View style={styles.jobRoomStack} testID="hasAnyWorkerKaelMessage">
              {showJobRoomMessage ? (
                <SequentialJobRoomReveal step={2} testID="worker-jobroom-handoff-reveal">
                  <JobRoomKaelMessage body={copy.chat.briefBody} kicker={copy.chat.handoffTitle} testID="worker-jobroom-kael-handoff" title={localizedServiceLabel(broadcast.serviceType, language)} />
                </SequentialJobRoomReveal>
              ) : null}
              {showJobRoomBrief ? (
                <SequentialJobRoomReveal step={3} testID="worker-jobroom-live-brief-reveal">
                  <JobRoomBriefBlock lines={jobBriefLines} testID="worker-jobroom-live-brief" title={copy.chat.briefTitle} />
                </SequentialJobRoomReveal>
              ) : null}
              {showJobRoomDetails ? (
                <SequentialJobRoomReveal step={4} testID="worker-jobroom-details-reveal">
                  <View style={styles.jobRoomMetaGrid}>
                    {jobRoomMeta.map((item) => (
                      <JobRoomMetaCell key={item.label} label={item.label} value={item.value} />
                    ))}
                  </View>
                  <CompactWorkerPresenceMap density="dense" mode="jobroom" />
                  <View style={[styles.jobRoomGate, workerOpaqueCardSurface(tokens, chatCanSend ? 'cyan' : 'warm', reduceTransparency)]} testID="worker-jobroom-privacy-gate">
                    <Icon name={chatCanSend ? 'check' : 'shield'} active={chatCanSend} small />
                    <View style={styles.titleStack}>
                      <Text style={[styles.bodyText, { color: tokens.ink }]} numberOfLines={2}>
                        {jobRoomGate}
                      </Text>
                      {!chatCanSend ? (
                        <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
                          {copy.chat.privacyGate}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {renderedMessages.length > 0 ? (
                    <View style={styles.chatStack}>
                      {renderedMessages.map((message) => (
                        <ChatBubble key={message.id} {...message} />
                      ))}
                      <WorkerKaelChatStatusBubble error={visibleWorkerKaelChatError} loading={visibleWorkerKaelChatLoading} progress={visibleWorkerKaelLiveProgress ?? activeWorkerKaelChatState?.session.progress ?? null} sending={workerKaelChatSending} streamingText={visibleWorkerKaelStreamingText} />
                    </View>
                  ) : null}
                </SequentialJobRoomReveal>
              ) : null}
            </View>
          )}
          </View>

          {showWorkerKaelStatusOutsideReveal ? (
            <View style={styles.chatStack}>
              <WorkerKaelChatStatusBubble error={visibleWorkerKaelChatError} loading={visibleWorkerKaelChatLoading} progress={visibleWorkerKaelLiveProgress ?? activeWorkerKaelChatState?.session.progress ?? null} sending={workerKaelChatSending} streamingText={visibleWorkerKaelStreamingText} />
            </View>
          ) : null}

        <WorkerKaelParityPanel
          consent={workerTrainingConsent}
          consentSaving={workerTrainingConsentSaving}
          feedbackError={workerKaelFeedbackError}
          feedbackOpen={workerKaelFeedbackOpen}
          feedbackSaving={workerKaelFeedbackSaving}
          feedbackSent={workerKaelFeedbackSent}
          feedbackValue={workerKaelFeedbackValue}
          onCancelFeedback={() => {
            setWorkerKaelFeedbackOpen(false)
            setWorkerKaelFeedbackError(null)
          }}
          onChangeFeedback={(value) => {
            setWorkerKaelFeedbackValue(value)
            if (workerKaelFeedbackError) setWorkerKaelFeedbackError(null)
          }}
          onOpenFeedback={() => setWorkerKaelFeedbackOpen(true)}
          onSubmitFeedback={submitWorkerKaelFeedback}
          onToggleConsent={toggleWorkerTrainingConsent}
        />

        <WorkerChatComposerDock
          canEdit={chatCanEdit}
          canSubmit={canSubmitWorkerDraft}
          draft={draft}
          inputAccessibilityLabel={chatInputPlaceholder}
          modeLabel={chatCanSend ? copy.chat.acceptedPill : copy.chat.kael}
          onAttach={handleWorkerAttachPress}
          onChangeDraft={(value) => setChatLocalState((current) => current.draft === value ? current : { ...current, draft: value })}
          onFocus={focusWorkerKaelComposer}
          onMic={handleWorkerMicPress}
          onSend={submitWorkerChatMessage}
          placeholder={visibleChatInputPlaceholder}
        />
      </View>
    </View>
  )
}

function stabilizeWorkerChatWebLayout() {
  if (Platform.OS !== 'web') return
  resetWorkerChatWebScrollPosition()
  requestAnimationFrame(resetWorkerChatWebScrollPosition)
  setTimeout(resetWorkerChatWebScrollPosition, 80)
}

function workerChatGreetingLabel(workerProfile: WorkerProfileResponse | null, _language: WorkerLanguageMode, referenceDate = new Date(Date.now())) {
  const displayName = workerChatDisplayName(workerProfile)
  const hour = referenceDate.getHours()
  const dayPart = hour < 11
    ? 'Morning'
    : hour < 14
      ? 'Lunch'
      : hour < 18
        ? 'Afternoon'
        : 'Evening'

  return `${dayPart}, ${displayName}`
}

function workerChatDisplayName(workerProfile: WorkerProfileResponse | null) {
  const legalName = workerProfile?.legal_name?.trim()
  if (!legalName) return 'there'
  return legalName.replace(/\s+/g, ' ')
}

function WorkerKaelChatStatusBubble({
  error,
  loading,
  progress,
  sending,
  streamingText,
}: {
  error: string | null
  loading: boolean
  progress: KaelChatProgress | null
  sending: boolean
  streamingText: string
}) {
  const { language, tokens } = useWorkerUi()
  if (!error && !loading && !sending) return null
  const progressText = workerKaelChatProgressCopy(progress, language)
  const visibleStreamingText = streamingText.trim()
  const statusText = error ?? (visibleStreamingText ? `${visibleStreamingText} |` : progressText ?? workerKaelChatStatusCopy(language, sending))
  return (
    <View testID="worker-kael-chat-status">
      <ChatBubble
        system
        text={statusText}
        who={workerCopy[language].chat.kael}
      />
      {progress && !error ? (
        <View style={[styles.workerKaelProgressPanel, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="worker-kael-chat-progress">
          <View style={styles.workerKaelProgressTrack}>
            <View style={[styles.workerKaelProgressFill, { backgroundColor: tokens.primary, width: `${Math.round(Math.max(0, Math.min(1, progress.progress)) * 100)}%` }]} />
          </View>
          <Text style={[styles.workerKaelProgressText, { color: tokens.muted }]} numberOfLines={1}>
            {progressText}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function ChatBubble({ mine = false, system = false, text, who }: { mine?: boolean; system?: boolean; text: string; who: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.chatBubble, messageBubbleSurface(tokens, { mine, system }), mine ? styles.chatBubbleMine : null]}>
      <Text style={[styles.chatWho, { color: tokens.primary }]}>{who}</Text>
      <Text style={[styles.chatText, { color: tokens.ink }]}>{text}</Text>
    </View>
  )
}
