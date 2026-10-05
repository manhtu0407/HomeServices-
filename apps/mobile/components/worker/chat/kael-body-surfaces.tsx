import { useMemo, useState } from 'react'
import { Text as RNText, View, type TextProps } from 'react-native'
import { type LocalDeal } from '@nestscout/shared'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelTextField, MintAura } from '@/components/ui/kael-primitives'
import { LiquidControlButton, LiquidSendArrowIcon } from '@/components/ui/liquid-back-button'
import { type AppLanguage } from '@/lib/app-language'
import { useJobChatThread } from '@/lib/use-job-chat-thread'
import { WorkerV5ScreenId } from '../dock/types'
import { WorkerV5ChatBubble } from '../jobs/advisory-surfaces'
import { textByLanguage } from '../ui/format'
import { getWorkerV5ChatJobId } from '../ui/labels'
import { workerV5Icons , workerV5OpportunityServiceIcons } from '../ui/screen-icons'
import { styles, workerV5KaelComposerWebTextInputNoOutline } from '../worker-v5-flow-styles'
import { WorkerV5KaelOrbBody } from './body-surfaces'
import { WorkerV5KaelOrbComposer } from './orb-screen-surfaces'
import { useWorkerV5KaelOrbChat } from './use-kael-orb-chat'
import { useWorkerKaelOrbPalette } from './orb-palette'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { workerV5JobsDestinationScreenId } from '../ui/screen-navigation'


type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerV5KaelOrbChat = ReturnType<typeof useWorkerV5KaelOrbChat>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5KaelChatBody({
  language,
  navigateToScreen,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const orbChat = useWorkerV5KaelOrbChat(runtime.state.deal, language, 'normal')
  const sharedJobId = getWorkerV5ChatJobId(runtime.state.deal)
  if (sharedJobId) {
    return <WorkerV5SharedJobIncidentChat deal={runtime.state.deal} language={language} reduceTransparency={reduceTransparency} />
  }
  return (
    <WorkerV5PrivateKaelOrbBody
      deal={runtime.state.deal}
      language={language}
      mode="normal"
      navigateToScreen={navigateToScreen}
      orbChat={orbChat}
      reduceTransparency={reduceTransparency}
    />
  )
}

function WorkerV5SharedJobIncidentChat({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const jobId = getWorkerV5ChatJobId(deal)
  const { error, loading, messages, send, sending } = useJobChatThread(
    jobId,
    Boolean(jobId),
    language,
  )
  const [draft, setDraft] = useState('')
  const palette = useWorkerKaelOrbPalette()
  const dark = palette.mode === 'dark'
  const submit = async () => {
    const content = draft.trim()
    if (!content || sending) return
    const sent = await send(content)
    if (sent) setDraft('')
  }
  return (
    <View style={[styles.jobRoomThreadCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-shared-job-incident-chat">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.jobRoomThreadAura} /> : null}
      <View style={styles.jobRoomBubbleStack}>
        {loading ? <Text style={styles.boundaryBody}>{textByLanguage(language, 'Đang tải Kael Công việc...', 'Loading Kael Work...')}</Text> : null}
        {messages.slice(-24).map((message) => (
          <WorkerV5ChatBubble
            align={message.sender_role === 'worker' ? 'right' : undefined}
            body={message.content}
            key={message.id}
            label={message.sender_role === 'worker'
              ? textByLanguage(language, 'Thợ', 'Worker')
              : message.sender_role === 'customer'
              ? textByLanguage(language, 'Khách', 'Customer')
              : textByLanguage(language, 'Kael Công việc', 'Kael Work')}
          />
        ))}
        {error ? <WorkerV5ChatBubble body={error} label={textByLanguage(language, 'Kael · trạng thái', 'Kael · status')} /> : null}
      </View>
      <View style={[styles.kaelOrbComposerCard, dark ? { backgroundColor: palette.composerFill, borderColor: palette.composerBorder } : null]}>
        <KaelTextField
          accessibilityLabel={textByLanguage(language, 'Nhắn trong Kael Công việc', 'Message in Kael Work')}
          inputShellStyle={styles.kaelOrbComposerInputShell}
          onChangeText={setDraft}
          onSubmitEditing={() => void submit()}
          placeholder={textByLanguage(language, 'Nhắn cho khách hoặc trả lời Kael...', 'Message the customer or reply to Kael...')}
          placeholderTextColor={palette.muted}
          returnKeyType="send"
          shellStyle={styles.kaelOrbComposerField}
          style={[styles.kaelOrbComposerInput, workerV5KaelComposerWebTextInputNoOutline, dark ? { color: palette.ink } : null]}
          testID="worker-v5-shared-job-incident-input"
          value={draft}
        />
        <LiquidControlButton
          accessibilityLabel={textByLanguage(language, 'Gửi tin nhắn Kael Công việc', 'Send Kael Work message')}
          dimWhenDisabled={false}
          disabled={sending || !draft.trim()}
          mode={palette.mode}
          onPress={() => void submit()}
          size={44}
          style={styles.kaelOrbSendButton}
          testID="worker-v5-shared-job-incident-send"
        >
          <LiquidSendArrowIcon color={palette.icon} testID="worker-v5-shared-job-incident-send-arrow" />
        </LiquidControlButton>
      </View>
    </View>
  )
}

export function WorkerV5KaelJobIntakeBody({
  language,
  navigateToScreen,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const orbChat = useWorkerV5KaelOrbChat(runtime.state.deal, language, 'intake')
  return (
    <WorkerV5PrivateKaelOrbBody
      deal={runtime.state.deal}
      language={language}
      mode="intake"
      navigateToScreen={navigateToScreen}
      orbChat={orbChat}
      reduceTransparency={reduceTransparency}
    />
  )
}

function WorkerV5PrivateKaelOrbBody({
  deal,
  language,
  mode,
  navigateToScreen,
  orbChat,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  mode: 'intake' | 'normal'
  navigateToScreen: (id: WorkerV5ScreenId) => void
  orbChat: WorkerV5KaelOrbChat
  reduceTransparency: boolean
}) {
  const { reduceMotion } = useGlassAccessibility()
  const composer = useMemo(() => (
    <WorkerV5KaelOrbComposer
      busy={orbChat.busy}
      language={language}
      mediaCount={orbChat.mediaCount}
      mode={mode}
      onPickMedia={() => void orbChat.pickMedia()}
      onSend={orbChat.send}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
    />
  ), [language, mode, orbChat, reduceMotion, reduceTransparency])
  return (
    <WorkerV5KaelOrbBody
      composer={composer}
      deal={deal}
      fallbackJobIcon={workerV5Icons.jobs}
      language={language}
      liveError={orbChat.error}
      liveStatus={orbChat.reasoningReceipt.status !== 'idle' ? null : orbChat.busyLabel}
      liveTurns={orbChat.liveTurns}
      mode={mode}
      onOpenOpportunity={() => navigateToScreen(workerV5JobsDestinationScreenId(deal))}
      onStreamingReplySettled={orbChat.settleStreamingReply}
      onToggleReasoningReceipt={orbChat.toggleReasoningReceipt}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      reasoningReceipt={orbChat.reasoningReceipt}
      serviceIcons={workerV5OpportunityServiceIcons}
      streamingReply={orbChat.streamingReply}
    />
  )
}

