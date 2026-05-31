import { type Dispatch } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { type ServiceType } from '@home-services/shared'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { type KaelChatResponse, type KaelChatTurn } from '@/lib/api-types'
import { useServiceWorkflow } from '@/lib/use-service-workflow'
import {
  EmptyKaelBriefCard,
  EstimateCard,
  EstimateInline,
  KaelIntakeReceiptCard,
  KaelProcessCard,
  KaelTraceCard,
  useKaelChatTokens,
} from './agentic-parts'
import { kaelSurfacePaint } from './paint'
import { type KaelChatAction, type KaelChatState } from './state'
import { styles } from './styles'

const kaelModel8AHead = require('../../../assets/kael-model-8a-head.png')
const supportedServices: ServiceType[] = ['electrical', 'plumbing', 'cleaning']
const vietnameseSignalPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

type KaelChatThreadText = Parameters<typeof KaelProcessCard>[0]['text'] & {
  history: string
  loading: string
  turnFallback: string
  welcome: string
}

export type KaelChatVisibility = {
  canStartOrchestration: boolean
  showBrief: boolean
  showEstimate: boolean
  showProcess: boolean
  showStarter: boolean
  showTrace: boolean
}

export function KaelChatThread({
  addressDistrict,
  dispatch,
  error,
  estimate,
  historyTarget,
  language,
  loading,
  onStartOrchestration,
  onOpenHistory,
  orchestrating,
  orchestrationMessage,
  pendingIntake,
  selectedService,
  session,
  text,
  tokens,
  turns,
  visibility,
  workflow,
}: {
  addressDistrict: string | null
  dispatch: Dispatch<KaelChatAction>
  error: string | null
  estimate: NonNullable<KaelChatResponse['session']['estimate']> | null
  historyTarget: string
  language: AppLanguage
  loading: boolean
  onStartOrchestration: () => Promise<void>
  onOpenHistory: (target: string) => void
  orchestrating: boolean
  orchestrationMessage: string | null
  pendingIntake: KaelChatState['pendingIntake']
  selectedService: ServiceType | null
  session: KaelChatResponse | null
  text: KaelChatThreadText
  tokens: ReturnType<typeof useKaelChatTokens>
  turns: KaelChatTurn[]
  visibility: KaelChatVisibility
  workflow: ReturnType<typeof useServiceWorkflow>
}) {
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.threadScroll}>
      <View style={styles.hiddenMarker} testID="customer-kael-chat-service-picker" />
      {loading ? (
        <View style={[styles.stateCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <ActivityIndicator color={tokens.primary} />
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{text.loading}</Text>
        </View>
      ) : null}
      <View style={styles.turnList} testID="customer-kael-chat-history">
        {pendingIntake ? <KaelIntakeReceiptCard intake={pendingIntake} language={language} /> : null}
        {visibility.showProcess ? <KaelProcessCard estimate={estimate} loading={loading} ticketMode={workflow.artifacts.process_ticket.mode} text={text} /> : null}
        {visibility.showStarter ? <KaelChatStarter dispatch={dispatch} language={language} selectedService={selectedService} text={text} tokens={tokens} /> : null}
        {turns.map((turn) => <ChatTurn key={turn.id} language={language} text={text} turn={turn} />)}
        {visibility.showTrace ? (
          <KaelTraceCard addressDistrict={addressDistrict} estimate={estimate} language={language} selectedService={selectedService} session={session} text={text} />
        ) : null}
        {visibility.showBrief ? <EmptyKaelBriefCard language={language} selectedService={selectedService} text={text} /> : null}
      </View>
      {visibility.showEstimate && estimate ? (
        <EstimateCard canStartOrchestration={visibility.canStartOrchestration} estimate={estimate} language={language} onStartOrchestration={onStartOrchestration} orchestrating={orchestrating} orchestrationStarted={session?.session.next_action === 'confirmed'} text={text} />
      ) : null}
      {orchestrationMessage ? (
        <View style={[styles.stateCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]} testID="customer-kael-chat-orchestration-started">
          <Text style={[styles.sectionTitle, { color: tokens.text }]}>{orchestrationMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => onOpenHistory(historyTarget)} style={({ pressed }) => [styles.primaryButton, { backgroundColor: tokens.primary }, pressed ? styles.pressed : null]} testID="customer-kael-chat-history-action">
            <Text style={[styles.primaryButtonText, { color: tokens.primaryText }]}>{text.history}</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <View style={[styles.errorCard, { backgroundColor: tokens.warm, borderColor: tokens.copper }]} testID="customer-kael-chat-error">
          <Text style={[styles.errorText, { color: tokens.text }]}>{error}</Text>
        </View>
      ) : null}
    </ScrollView>
  )
}

function KaelChatStarter({
  dispatch,
  language,
  selectedService,
  text,
  tokens,
}: {
  dispatch: Dispatch<KaelChatAction>
  language: AppLanguage
  selectedService: ServiceType | null
  text: KaelChatThreadText
  tokens: ReturnType<typeof useKaelChatTokens>
}) {
  return (
    <>
      <View style={styles.turnRow} testID="customer-kael-chat-welcome-turn">
        <View style={[styles.turnAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <Image source={kaelModel8AHead} style={styles.turnAvatarImage} />
        </View>
        <View style={[styles.turnBubble, styles.kaelTurn, styles.turnBubbleWithAvatar, styles.emptyChatStart, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <Text style={[styles.turnRole, { color: tokens.primary }]} numberOfLines={1}>Kael</Text>
          <Text style={[styles.turnText, { color: tokens.text }]}>{text.welcome}</Text>
        </View>
      </View>
      {!selectedService ? (
        <View style={styles.contextRail} testID="customer-kael-chat-service-picker-inline">
          <View style={styles.chatQuickServices}>
            {supportedServices.map((service) => (
              <Pressable
                accessibilityRole="button"
                key={service}
                onPress={() => dispatch({ type: 'selectService', service })}
                style={({ pressed }) => [
                  styles.serviceChip,
                  { backgroundColor: tokens.service, borderColor: tokens.border },
                  kaelSurfacePaint(tokens, 'pill'),
                  pressed ? styles.pressed : null,
                ]}
                testID={`customer-kael-chat-service-${service}`}
              >
                <Text style={[styles.chipText, { color: tokens.text }]} numberOfLines={1}>{localizedServiceLabel(service, language)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </>
  )
}

function ChatTurn({ language, text, turn }: { language: AppLanguage; text: KaelChatThreadText; turn: KaelChatTurn }) {
  const tokens = useKaelChatTokens()
  const isCustomer = turn.role === 'customer'
  const rawBody = turn.text_content ?? turn.estimate?.problem_summary ?? text.turnFallback
  const body = isCustomer ? rawBody : localizedGeneratedText(rawBody, language, text.turnFallback)
  const who = isCustomer ? localizedRoleCustomer(language) : 'Kael'

  return (
    <View style={[styles.turnRow, isCustomer ? styles.turnRowCustomer : null]} testID={`customer-kael-chat-turn-${turn.role}`}>
      {isCustomer ? null : (
        <View style={[styles.turnAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <Image source={kaelModel8AHead} style={styles.turnAvatarImage} />
        </View>
      )}
      <View style={[styles.turnBubble, isCustomer ? styles.customerTurn : styles.kaelTurn, !isCustomer ? styles.turnBubbleWithAvatar : null, { backgroundColor: isCustomer ? tokens.service : tokens.raised, borderColor: isCustomer ? tokens.borderStrong : tokens.border }, kaelSurfacePaint(tokens, isCustomer ? 'customerBubble' : 'kaelBubble')]}>
        <Text style={[styles.turnRole, { color: tokens.primary }]} numberOfLines={1}>{who}</Text>
        <Text style={[styles.turnText, { color: tokens.text }]}>{body}</Text>
        {turn.estimate ? <EstimateInline estimate={turn.estimate} language={language} text={text} /> : null}
      </View>
    </View>
  )
}

function localizedRoleCustomer(language: AppLanguage) {
  return language === 'en' ? 'You' : 'Bạn'
}

function localizedGeneratedText(value: string, language: AppLanguage, fallback: string) {
  const trimmed = value.trim()
  if (trimmed.length === 0) return fallback
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return fallback
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return fallback
  return trimmed
}
