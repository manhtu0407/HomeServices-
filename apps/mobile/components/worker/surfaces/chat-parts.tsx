import { workerKaelTrainingConsentBody, workerKaelTrainingConsentLabel } from './chat-helpers'
import { styles } from './styles'
import { messageBubbleSurface, workerChatModePillGlassLayer, workerChatModePillTextHighlight, workerKaelChatSurface, workerOpaqueCardSurface } from './surface-styles/glass-earnings'
import { type WorkerBroadcastView } from './types'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { ReduceMotionAwareEntranceView, reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { Image } from 'expo-image'
import { type ReactNode, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { SubtleGlassHighlight, WorkerChatMicIcon, WorkerChatPlusIcon, WorkerChatSendIcon, kaelHead, useWorkerUi } from './ui'

export function WorkerChatComposerDock({
  canEdit,
  canSubmit,
  draft,
  inputAccessibilityLabel,
  modeLabel,
  onAttach,
  onChangeDraft,
  onFocus,
  onMic,
  onSend,
  placeholder,
}: {
  canEdit: boolean
  canSubmit: boolean
  draft: string
  inputAccessibilityLabel: string
  modeLabel: string
  onAttach: () => void
  onChangeDraft: (value: string) => void
  onFocus: () => void
  onMic: () => void
  onSend: () => void
  placeholder: string
}) {
  const { copy, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const [composerInputHeight, setComposerInputHeight] = useState(28)

  return (
    <View style={styles.chatComposerTouchWrap} testID="worker-kael-composer-sequential-trigger">
      <View style={[styles.chatComposer, workerKaelChatSurface(tokens, 'composer')]} testID="worker-kael-composer-dock">
        <SubtleGlassHighlight liquid />
        <View pointerEvents="none" style={[styles.workerChatComposerKeyline, { borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.88)' }]} testID="worker-chat-reference-composer-keyline" />
        <TextInput
          accessibilityLabel={inputAccessibilityLabel}
          editable={canEdit}
          multiline
          onChangeText={onChangeDraft}
          onContentSizeChange={(event) => setComposerInputHeight(Math.min(76, Math.max(28, event.nativeEvent.contentSize.height)))}
          onFocus={onFocus}
          onSubmitEditing={onSend}
          placeholder={placeholder}
          placeholderTextColor={tokens.subtle}
          returnKeyType="send"
          scrollEnabled={false}
          selectionColor={tokens.primary}
          style={[styles.chatInput, styles.chatInputInvisibleFocus, { caretColor: tokens.primary, color: tokens.ink, height: composerInputHeight } as any]}
          testID="worker-kael-chat-input"
          value={draft}
        />
        <View style={styles.chatComposerControlRow} testID="worker-chat-reference-composer-tools">
          <Pressable accessibilityLabel={copy.chat.attach} accessibilityRole="button" hitSlop={4} onPress={onAttach} style={({ pressed }) => [styles.composerTool, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="worker-kael-chat-attach">
            <WorkerChatPlusIcon color={tokens.primary} />
          </Pressable>
          <View style={[styles.workerChatModePill, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'status')]} testID="worker-chat-reference-mode-pill">
            <View pointerEvents="none" style={[styles.workerChatModePillGlassLayer, workerChatModePillGlassLayer(tokens)]} testID="worker-chat-mode-pill-glass-layer" />
            <Text style={[styles.workerChatModeText, { color: tokens.primary }, workerChatModePillTextHighlight(tokens)]} numberOfLines={1}>
              {modeLabel}
            </Text>
          </View>
          <View style={styles.chatComposerControlSpacer} />
          <View style={styles.chatComposerRightActions} testID="worker-chat-reference-composer-right-actions">
            <Pressable accessibilityLabel={copy.chat.mic} accessibilityRole="button" hitSlop={4} onPress={onMic} style={({ pressed }) => [styles.composerTool, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="worker-kael-chat-mic">
              <WorkerChatMicIcon color={tokens.primary} />
            </Pressable>
            <Pressable
              accessibilityLabel={copy.chat.send}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              hitSlop={4}
              onPress={onSend}
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: canSubmit ? tokens.primary : tokens.raised, borderColor: canSubmit ? tokens.borderStrong : tokens.border },
                canSubmit ? workerKaelChatSurface(tokens, 'send') : workerKaelChatSurface(tokens, 'icon'),
                reduceMotionAwarePressStyle(pressed, reduceMotion),
              ]}
              testID="worker-kael-send-button"
            >
              <WorkerChatSendIcon color={canSubmit ? tokens.primaryText : tokens.subtle} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

export function WorkerKaelParityPanel({
  consent,
  consentSaving,
  feedbackError,
  feedbackOpen,
  feedbackSaving,
  feedbackSent,
  feedbackValue,
  onCancelFeedback,
  onChangeFeedback,
  onOpenFeedback,
  onSubmitFeedback,
  onToggleConsent,
}: {
  consent: boolean
  consentSaving: boolean
  feedbackError: string | null
  feedbackOpen: boolean
  feedbackSaving: boolean
  feedbackSent: boolean
  feedbackValue: string
  onCancelFeedback: () => void
  onChangeFeedback: (value: string) => void
  onOpenFeedback: () => void
  onSubmitFeedback: () => void
  onToggleConsent: () => void
}) {
  const { language, reduceTransparency, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()

  return (
    <View style={[styles.workerKaelParityPanel, workerOpaqueCardSurface(tokens, 'mint', reduceTransparency)]} testID="worker-kael-parity-panel">
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.workerKaelParityTitle, { color: tokens.ink }]} numberOfLines={1}>
            {language === 'en' ? 'Kael controls' : 'Tu\u1ef3 ch\u1ecdn Kael'}
          </Text>
          <Text style={[styles.workerKaelParityBody, { color: tokens.muted }]} numberOfLines={2}>
            {workerKaelTrainingConsentBody(language, consent)}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={workerKaelTrainingConsentLabel(language, consent)}
          accessibilityRole="button"
          accessibilityState={{ busy: consentSaving, checked: consent, disabled: consentSaving }}
          disabled={consentSaving}
          onPress={onToggleConsent}
          style={({ pressed }) => [styles.workerKaelMiniButton, { borderColor: tokens.border }, workerOpaqueCardSurface(tokens, consent ? 'cyan' : 'warm', reduceTransparency), reduceMotionAwarePressStyle(pressed, reduceMotion)]}
          testID="worker-kael-training-consent-toggle"
        >
          <Text style={[styles.workerKaelMiniButtonText, { color: consent ? tokens.primary : tokens.copper }]} numberOfLines={1}>
            {workerKaelTrainingConsentLabel(language, consent)}
          </Text>
        </Pressable>
      </View>
      <View style={styles.workerKaelParityActions}>
        <Pressable
          accessibilityLabel={language === 'en' ? 'Send Kael feedback' : 'G\u1eedi ph\u1ea3n h\u1ed3i Kael'}
          accessibilityRole="button"
          onPress={onOpenFeedback}
          style={({ pressed }) => [styles.workerKaelMiniButton, { borderColor: tokens.border }, workerOpaqueCardSurface(tokens, 'cream', reduceTransparency), reduceMotionAwarePressStyle(pressed, reduceMotion)]}
          testID="worker-kael-feedback-open"
        >
          <Text style={[styles.workerKaelMiniButtonText, { color: tokens.primary }]} numberOfLines={1}>
            {feedbackSent
              ? language === 'en' ? 'Feedback sent' : '\u0110\u00e3 g\u1eedi'
              : language === 'en' ? 'Feedback' : 'Ph\u1ea3n h\u1ed3i'}
          </Text>
        </Pressable>
      </View>
      {feedbackOpen ? (
        <View style={styles.workerKaelFeedbackForm} testID="worker-kael-feedback-form">
          <TextInput
            accessibilityLabel={language === 'en' ? 'Kael feedback' : 'Ph\u1ea3n h\u1ed3i Kael'}
            editable={!feedbackSaving}
            multiline
            onChangeText={onChangeFeedback}
            placeholder={language === 'en' ? 'What should Kael improve for worker jobs?' : 'Kael n\u00ean c\u1ea3i thi\u1ec7n g\u00ec cho th\u1ee3?'}
            placeholderTextColor={tokens.subtle}
            style={[styles.workerKaelFeedbackInput, { borderColor: tokens.border, color: tokens.ink }]}
            testID="worker-kael-feedback-input"
            value={feedbackValue}
          />
          {feedbackError ? (
            <Text accessibilityRole="alert" style={[styles.workerKaelFeedbackError, { color: tokens.danger }]} testID="worker-kael-feedback-error">
              {feedbackError}
            </Text>
          ) : null}
          <View style={styles.workerKaelParityActions}>
            <Pressable accessibilityRole="button" disabled={feedbackSaving} onPress={onCancelFeedback} style={({ pressed }) => [styles.workerKaelMiniButton, { borderColor: tokens.border }, reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="worker-kael-feedback-cancel">
              <Text style={[styles.workerKaelMiniButtonText, { color: tokens.muted }]}>{language === 'en' ? 'Cancel' : 'Hu\u1ef7'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={feedbackSaving} onPress={onSubmitFeedback} style={({ pressed }) => [styles.workerKaelMiniButton, { borderColor: tokens.borderStrong, backgroundColor: tokens.primary }, reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="worker-kael-feedback-submit">
              <Text style={[styles.workerKaelMiniButtonText, { color: tokens.primaryText }]}>{feedbackSaving ? (language === 'en' ? 'Sending' : '\u0110ang g\u1eedi') : (language === 'en' ? 'Send' : 'G\u1eedi')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  )
}

export function WorkerChatReferenceWelcome({ greeting }: { greeting: string }) {
  const { tokens } = useWorkerUi()

  return (
    <ReduceMotionAwareEntranceView delayMs={70} distanceY={10} testID="worker-chat-reference-welcome-motion">
      <View style={styles.workerChatWelcomeStage} testID="worker-chat-reference-welcome-stage">
        <View style={[styles.workerChatWelcomeGlyph, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'avatar')]} testID="worker-chat-reference-kael-mark">
          <View pointerEvents="none" style={[styles.workerChatWelcomeGlyphAura, { backgroundColor: tokens.mint }]} />
          <Image contentFit="contain" source={kaelHead} style={styles.workerChatWelcomeGlyphImage} />
        </View>
        <Text adjustsFontSizeToFit minimumFontScale={0.56} numberOfLines={1} style={[styles.workerChatWelcomeTitle, { color: tokens.ink }]}>
          {greeting}
        </Text>
      </View>
    </ReduceMotionAwareEntranceView>
  )
}

export function SequentialJobRoomReveal({ children, step, testID }: { children: ReactNode; step: number; testID: string }) {
  return (
    <ReduceMotionAwareEntranceView delayMs={(step - 1) * 70} distanceY={12} testID={testID}>
      <View style={styles.jobRoomRevealStep}>
        {children}
      </View>
    </ReduceMotionAwareEntranceView>
  )
}

export function JobRoomProcessCard({ broadcast, canSend, onAdvance }: { broadcast: WorkerBroadcastView | null; canSend: boolean; onAdvance: () => void }) {
  const { copy, language, tokens } = useWorkerUi()
  const status = canSend
    ? copy.chat.acceptedPill
    : broadcast
      ? language === 'en' ? 'Reviewing request' : 'Đang kiểm tra yêu cầu'
      : language === 'en' ? 'Waiting for request' : 'Đang chờ yêu cầu'
  const steps = broadcast
    ? canSend
      ? language === 'en'
        ? ['Read brief', 'Save notes', 'Update job']
        : ['Đọc tóm tắt', 'Lưu ghi chú', 'Cập nhật việc']
      : language === 'en'
        ? ['Read request', 'Keep privacy', 'Await accept']
        : ['Đọc yêu cầu', 'Giữ riêng tư', 'Chờ nhận']
    : language === 'en'
      ? ['Kael routes', 'Build brief', 'Open room']
      : ['Kael điều phối', 'Dựng tóm tắt', 'Mở phòng']

  return (
    <Pressable accessibilityLabel={status} accessibilityRole="button" onPress={onAdvance} style={({ pressed }) => [styles.jobRoomProcessTapTarget, pressed ? styles.pressed : null]} testID="worker-jobroom-agentic-process-trigger">
      <View style={[styles.jobRoomProcessCard, workerKaelChatSurface(tokens, 'agent')]} testID="worker-jobroom-agentic-process">
        <View style={styles.jobRoomProcessHead}>
          <View style={[styles.jobRoomProcessAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }, workerKaelChatSurface(tokens, 'avatar')]}>
            <Image contentFit="contain" source={kaelHead} style={styles.jobRoomProcessAvatarImage} />
          </View>
          <View style={[styles.jobRoomProcessStatus, { backgroundColor: tokens.raised, borderColor: tokens.border }, workerKaelChatSurface(tokens, 'status')]}>
            <View style={[styles.jobRoomProcessAccent, { backgroundColor: tokens.primary }]} />
            <View style={styles.titleStack}>
              <Text style={[styles.jobRoomProcessTitle, { color: tokens.ink }]} numberOfLines={1}>
                {status}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.jobRoomProcessSteps}>
          {steps.map((step, index) => (
            <JobRoomStepCard index={`0${index + 1}`} key={step} title={step} />
          ))}
        </View>
      </View>
    </Pressable>
  )
}

function JobRoomStepCard({ index, title }: { index: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.jobRoomProcessStep, { backgroundColor: tokens.raised, borderColor: tokens.border }, workerKaelChatSurface(tokens, 'step')]}>
      <Text style={[styles.jobRoomProcessStepIndex, { color: tokens.primary }]}>{index}</Text>
      <Text style={[styles.jobRoomProcessStepTitle, { color: tokens.ink }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  )
}

export function JobRoomKaelMessage({ body, kicker, testID, title }: { body: string; kicker: string; testID: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={styles.jobRoomMessageRow} testID={testID}>
      <View style={[styles.jobRoomMessageAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }, workerKaelChatSurface(tokens, 'avatar')]}>
        <Image contentFit="contain" source={kaelHead} style={styles.jobRoomMessageAvatarImage} />
      </View>
      <View style={[styles.jobRoomMessageBubble, messageBubbleSurface(tokens, { mine: false, system: true }), workerKaelChatSurface(tokens, 'bubble')]}>
        <Text style={[styles.jobRoomBubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={[styles.jobRoomBubbleTitle, { color: tokens.ink }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.jobRoomBubbleBody, { color: tokens.muted }]} numberOfLines={3}>
          {body}
        </Text>
      </View>
    </View>
  )
}

export function JobRoomBriefBlock({ body, lines, testID, title }: { body?: string; lines?: string[]; testID: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.jobRoomBrief, workerKaelChatSurface(tokens, 'brief'), styles.jobRoomBriefAligned]} testID={testID}>
      <View style={styles.jobRoomBriefTitleRow}>
        <View style={[styles.jobRoomBriefAccent, { backgroundColor: tokens.primary }]} />
        <Text style={[styles.jobRoomBriefTitle, { color: tokens.primary }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {lines?.length
        ? lines.map((line) => (
            <View key={line} style={styles.briefItem}>
              <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
              <Text style={[styles.briefText, styles.jobRoomBriefText, { color: tokens.ink }]} numberOfLines={3}>
                {line}
              </Text>
            </View>
          ))
        : (
            <Text style={[styles.briefText, styles.jobRoomBriefText, { color: tokens.ink }]} numberOfLines={4}>
              {body}
            </Text>
          )}
    </View>
  )
}
