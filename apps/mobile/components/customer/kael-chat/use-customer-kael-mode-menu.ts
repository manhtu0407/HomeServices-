import { useEffect } from 'react'
import type { useRouter } from 'expo-router'
import {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'

import type { CustomerKaelRequestGuard } from './customer-kael-state-scope'
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
  reduceTransparency,
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
  reduceTransparency: boolean
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
    setSessionMenuOpen,
    setUploadingMedia,
    setVoiceTranscript,
  } = chatUi
  const { switchMode } = conversation
  const { stopProcessLines } = processController
  const opacity = useSharedValue(0)
  const scale = useSharedValue(0.96)
  const sheenOpacity = useSharedValue(0)
  const sheenX = useSharedValue(-92)
  const translateY = useSharedValue(-6)

  const switchChatMode = (nextMode: CustomerKaelMode) => {
    kaelRequestGuard.setScope(`${stateScopeKey}:${nextMode}`)
    switchMode(nextMode)
    setBlankCaseTransition(false)
    setModeMenuOpen(false)
    setSessionMenuOpen(false)
    setCaseEditOpen(false)
    setDraft('')
    setVoiceTranscript('')
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
      sheenOpacity.value = 0
      sheenX.value = -92
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
  const animatedModeMenuSheenStyle = useAnimatedStyle(() => ({
    opacity: sheenOpacity.value,
    transform: [
      { translateX: sheenX.value },
      { rotate: '-10deg' },
    ],
  }))

  useEffect(() => {
    if (!modeMenuOpen) return
    if (reduceMotion) {
      opacity.value = 1
      scale.value = 1
      sheenOpacity.value = 0
      translateY.value = 0
      return
    }

    opacity.value = withTiming(1, { duration: motionDuration(140, reduceMotion) })
    scale.value = withSpring(1, motionTokens.liquid.entrance)
    translateY.value = withSpring(0, motionTokens.liquid.entrance)
    if (!reduceTransparency) {
      sheenOpacity.value = withSequence(
        withTiming(0.58, { duration: motionDuration(90, reduceMotion) }),
        withDelay(170, withTiming(0, { duration: motionDuration(180, reduceMotion) })),
      )
      sheenX.value = withTiming(96, { duration: motionDuration(340, reduceMotion) })
    }
  }, [modeMenuOpen, opacity, reduceMotion, reduceTransparency, scale, sheenOpacity, sheenX, translateY])

  return {
    animatedModeMenuSheenStyle,
    animatedModeMenuStyle,
    switchChatMode,
    toggleModeMenu,
  }
}
