import { useState } from 'react'
import { Pressable, Text as RNText, View, type TextProps } from 'react-native'
import { type LocalDeal } from '@nestscout/shared'
import { KaelTextField, MintAura } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import { type AppLanguage } from '@/lib/app-language'
import { useJobChatThread } from '@/lib/use-job-chat-thread'
import { WorkerV5ScreenId } from '../dock/types'
import { WorkerV5ChatBubble } from '../jobs/advisory-surfaces'
import { textByLanguage } from '../ui/format'
import { getWorkerV5ChatJobId } from '../ui/labels'
import { workerV5Icons , workerV5OpportunityServiceIcons } from '../ui/screen-icons'
import { styles } from '../worker-v5-flow-styles'
import { WorkerV5KaelOrbBody } from './body-surfaces'
import { WorkerV5KaelOrbComposer } from './orb-screen-surfaces'
import { useWorkerV5KaelOrbChat } from './use-kael-orb-chat'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { workerV5JobsDestinationScreenId } from '../ui/screen-navigation'


type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
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
  const orbChat = useWorkerV5KaelOrbChat(runtime.state.deal, language, 'normal', runtime.workerJobsHydrated)
  if (getWorkerV5ChatJobId(runtime.state.deal)) {
    return <WorkerV5SharedJobIncidentChat deal={runtime.state.deal} language={language} reduceTransparency={reduceTransparency} />
  }
  return (
    <WorkerV5KaelOrbBody
      composer={(
        <WorkerV5KaelOrbComposer
          busy={orbChat.busy}
          language={language}
          mediaCount={orbChat.mediaCount}
          mode="normal"
          onPickMedia={() => void orbChat.pickMedia()}
          onSend={(message) => void orbChat.send(message)}
          reduceTransparency={reduceTransparency}
        />
      )}
      deal={runtime.state.deal}
      fallbackJobIcon={workerV5Icons.jobs}
      language={language}
      liveError={orbChat.error}
      liveStatus={orbChat.busyLabel}
      liveTurns={orbChat.liveTurns}
      mode="normal"
      onOpenOpportunity={() => navigateToScreen(workerV5JobsDestinationScreenId(runtime.state.deal))}
      reduceTransparency={reduceTransparency}
      serviceIcons={workerV5OpportunityServiceIcons}
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
      <View style={styles.kaelOrbComposerCard}>
        <KaelTextField
          accessibilityLabel={textByLanguage(language, 'Nhắn trong Kael Công việc', 'Message in Kael Work')}
          inputShellStyle={styles.kaelOrbComposerInputShell}
          onChangeText={setDraft}
          onSubmitEditing={() => void submit()}
          placeholder={textByLanguage(language, 'Nhắn cho khách hoặc trả lời Kael...', 'Message the customer or reply to Kael...')}
          placeholderTextColor={color.text.muted}
          returnKeyType="send"
          shellStyle={styles.kaelOrbComposerField}
          style={styles.kaelOrbComposerInput}
          testID="worker-v5-shared-job-incident-input"
          value={draft}
        />
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Gửi tin nhắn Kael Công việc', 'Send Kael Work message')}
          accessibilityRole="button"
          disabled={sending || !draft.trim()}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.kaelOrbSendButton, pressed && draft.trim() ? styles.pressed : null]}
          testID="worker-v5-shared-job-incident-send"
        >
          <Text style={styles.kaelOrbSendText}>↑</Text>
        </Pressable>
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
  const orbChat = useWorkerV5KaelOrbChat(runtime.state.deal, language, 'intake', runtime.workerJobsHydrated)
  return (
    <WorkerV5KaelOrbBody
      composer={(
        <WorkerV5KaelOrbComposer
          busy={orbChat.busy}
          language={language}
          mediaCount={orbChat.mediaCount}
          mode="intake"
          onPickMedia={() => void orbChat.pickMedia()}
          onSend={(message) => void orbChat.send(message)}
          reduceTransparency={reduceTransparency}
        />
      )}
      deal={runtime.state.deal}
      fallbackJobIcon={workerV5Icons.jobs}
      language={language}
      liveError={orbChat.error}
      liveStatus={orbChat.busyLabel}
      liveTurns={orbChat.liveTurns}
      mode="intake"
      onOpenOpportunity={() => navigateToScreen(workerV5JobsDestinationScreenId(runtime.state.deal))}
      reduceTransparency={reduceTransparency}
      serviceIcons={workerV5OpportunityServiceIcons}
    />
  )
}

