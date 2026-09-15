import { useEffect } from 'react'
import type { useRouter } from 'expo-router'
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'

import { customerKaelModeStateScopeKey, type CustomerKaelRequestGuard } from './customer-kael-state-scope'
import {
  readCustomerKaelAssistantTurns,
  readCustomerKaelComposerState,
  readCustomerKaelMediaDrafts,
} from './customer-kael-ephemeral-state'
import type { CustomerKaelMode } from '../ui/types'
import type { useCustomerKaelChatUiState } from './use-customer-kael-chat-ui-state'
import type { useCustomerKaelConversationState } from './use-customer-kael-conversation-state'
import type { useKaelProcessLineController } from './use-kael-process-line-controller'

type ChatUi = ReturnType<typeof useCustomerKaelChatUiState>
type Conversation = ReturnType<typeof useCustomerKaelConversationState>
type ProcessController = ReturnType<typeof useKaelProcessLineController>
type Router = ReturnType<typeof useRouter>

export function useCustomerKaelModeMenu({
  caseWorkRoute,
  chatUi,
  conversation,
  kaelRequestGuard,
  normalChatRoute,
  processController,
  reduceMotion,
  router,
  stateScopeKey,
}: {
  caseWorkRoute: string
  chatUi: ChatUi
  conversation: Conversation
  kaelRequestGuard: CustomerKaelRequestGuard
  normalChatRoute: string
  processController: ProcessController
  reduceMotion: boolean
  router: Router
  stateScopeKey: string
}) {
  const {
    modeMenuOpen,
    setAgenticAdjustmentOpen,
    setAgenticAdjustmentText,
    setAgenticEvidenceReason,
    setAgenticEvidenceRejectOpen,
    setAgenticRejectOpen,
    setAgenticRejectReason,
    setBlankCaseTransition,
    setCaseEditOpen,
    setDraft,
    setModeMenuOpen,
    rememberComposerState,
    setSessionMenuOpen,
    setUploadingMedia,
    setVoiceTranscript,
  } = chatUi
  const {
    rememberEphemeralState,
    setAssistantTurns,
    setComposerMediaDrafts,
    switchMode,
  } = conversation
  const { stopProcessLines } = processController
  const opacity = useSharedValue(0)
  const scale = useSharedValue(0.96)
  const translateY = useSharedValue(-6)

  const switchChatMode = (nextMode: CustomerKaelMode) => {
    rememberComposerState()
    rememberEphemeralState()
    const nextModeScopeKey = customerKaelModeStateScopeKey(stateScopeKey, nextMode)
    const nextComposer = readCustomerKaelComposerState(nextModeScopeKey)
    const nextAssistantTurns = readCustomerKaelAssistantTurns(nextModeScopeKey)
    const nextMediaDrafts = readCustomerKaelMediaDrafts(nextModeScopeKey)
    kaelRequestGuard.setScope(`${stateScopeKey}:${nextMode}`)
    switchMode(nextMode)
    setDraft(nextComposer.draft)
    setVoiceTranscript(nextComposer.voiceTranscript)
    setAssistantTurns(nextAssistantTurns)
    setComposerMediaDrafts(nextMediaDrafts)
    setBlankCaseTransition(false)
    setModeMenuOpen(false)
    setSessionMenuOpen(false)
    setCaseEditOpen(false)
    setUploadingMedia(false)
    setAgenticAdjustmentOpen(false)
    setAgenticAdjustmentText('')
    setAgenticRejectOpen(false)
    setAgenticRejectReason('')
    setAgenticEvidenceRejectOpen(false)
    setAgenticEvidenceReason('')
    stopProcessLines()
    router.replace(nextMode === 'case' ? caseWorkRoute as never : normalChatRoute as never)
  }

  const toggleModeMenu = () => {
    if (!modeMenuOpen) {
      opacity.value = reduceMotion ? 1 : 0
      scale.value = reduceMotion ? 1 : 0.96
      translateY.value = reduceMotion ? 0 : -6
    }
    setSessionMenuOpen(false)
    setModeMenuOpen((current) => !current)
  }

  const animatedModeMenuStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))

  useEffect(() => {
    if (!modeMenuOpen) return
    if (reduceMotion) {
      opacity.value = 1
      scale.value = 1
      translateY.value = 0
      return
    }

    opacity.value = withTiming(1, { duration: motionDuration(140, reduceMotion) })
    scale.value = withSpring(1, motionTokens.liquid.entrance)
    translateY.value = withSpring(0, motionTokens.liquid.entrance)
  }, [modeMenuOpen, opacity, reduceMotion, scale, translateY])

  return {
    animatedModeMenuStyle,
    switchChatMode,
    toggleModeMenu,
  }
}
