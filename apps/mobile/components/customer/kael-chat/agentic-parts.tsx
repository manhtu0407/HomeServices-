import { memo, type Dispatch, useCallback, useEffect, useRef, useState } from 'react'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, Text, View, type ListRenderItemInfo, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { LOCAL_WORKFLOW_PRICE_DISCLAIMER, PLATFORM_FEE_CUSTOMER, orderWorkflowPhaseSectionsForSummary, workflowAllowedActionsLabel, workflowArtifactModeLabel, workflowBlockedReasonLabel, workflowEventLabel, workflowSourceOfTruthLabel, type ServiceType, type WorkflowArtifactMode, type WorkflowPhaseContext } from '@nestscout/shared'
import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
} from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { KaelMascot as OfficialKaelMascot } from '@/components/kael/kael-mascot'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { type KaelChatResponse } from '@/lib/api-types'
import { inferKaelChatDistrict } from './address-district'
import { KaelAddressContextBar } from './address-context'
import { kaelSurfacePaint } from './paint'
import { type PendingKaelChatDraft } from './pending-intake'
import { type KaelChatAction } from './state'
import { styles } from './styles'

const clientChatArchiveIcon = require('../../../assets/client-image-icons/client-booking.png')
const ADDRESS_AUTO_HIDE_DELAY_MS = 180

type KaelWebSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onresult: ((event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null
  start: () => void
  stop?: () => void
}
type KaelWebSpeechRecognitionConstructor = new () => KaelWebSpeechRecognition

type KaelChatText = {
  addressPlaceholder: string
  agentStatus: string
  agentSteps: {
    missing: string
    orchestrate: string
    read: string
  }
  attach: string
  attachHint: string
  archiveActiveMeta: string
  archiveCurrentChat: string
  archiveDraftMeta: string
  archiveEmptyBody: string
  archiveEmptySubtitle: string
  archiveEmptyTitle: string
  archiveHistoryMeta: string
  archiveLoadingChat: string
  archiveNoService: string
  archiveOpen: string
  archivePendingIntake: string
  archiveServiceRequest: string
  archiveTitle: string
  back: string
  briefClarityLabel: string
  briefClarityPending: string
  briefClaritySelected: string
  briefSafetyBody: string
  briefSafetyLabel: string
  briefServiceLabel: string
  briefServicePending: string
  composerPlaceholder: string
  emptyTicketBody: string
  emptyTicketTitle: string
  errorNoService: string
  estimateDisclaimerFallback: string
  estimateProblemFallback: string
  estimateTitle: string
  cancellationBody: string
  complexity: {
    large: string
    medium: string
    small: string
  }
  orchestrate: string
  orchestrating: string
  labels: {
    advisory: string
    cancellationNote: string
    complexity: string
    confidence: string
    platformFee: string
    price: string
    problem: string
    service: string
    summaryTotal: string
  }
  loading: string
  mic: string
  micHint: string
  nextAction: {
    await_input: string
    confirmed: string
    estimate_ready: string
  }
  send: string
  sending: string
  traceDecision: string
  traceDecisionBody: string
  traceDone: string
  traceLocked: string
  traceMissing: string
  traceMissingActive: string
  traceMissingEmpty: string
  traceMissingReady: string
  traceQuestion: string
  traceService: string
  traceServiceEmpty: string
  traceTitle: string
  traceWaiting: string
}

type KaelChatTokens = ReturnType<typeof useKaelChatTokens>
export type KaelChatArchiveItem = {
  id: string
  meta: string
  subtitle: string
  targetPath?: string
  title: string
}
const EMPTY_KAEL_CHAT_ARCHIVE_ITEMS: KaelChatArchiveItem[] = []
const vndFormatter = new Intl.NumberFormat('vi-VN')
const PLATFORM_FEE_MULTIPLIER = 1 + PLATFORM_FEE_CUSTOMER
const vietnameseSignalPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

function kaelChatAttachmentFallbackName(language: AppLanguage) {
  return language === 'en' ? 'selected image' : 'ảnh đã chọn'
}

function kaelChatAttachmentDraftLine(language: AppLanguage, fileName: string) {
  const cleanName = fileName.trim() || kaelChatAttachmentFallbackName(language)
  return language === 'en' ? `Selected image: ${cleanName}` : `Ảnh đã chọn: ${cleanName}`
}

function kaelChatAttachmentPermissionBody(language: AppLanguage) {
  return language === 'en'
    ? 'Allow photo library access so Kael can keep this image with the request evidence.'
    : 'Cho phép truy cập thư viện ảnh để Kael giữ ảnh này cùng bằng chứng yêu cầu.'
}

function kaelChatAttachmentReadyBody(language: AppLanguage) {
  return language === 'en'
    ? 'Kael added the image name to your message. The real image stays local and attaches after Kael creates the request evidence.'
    : 'Kael đã thêm tên ảnh vào tin nhắn. Ảnh thật vẫn ở máy và sẽ gắn vào bằng chứng sau khi Kael tạo phiếu.'
}

function kaelChatMicListeningBody(language: AppLanguage) {
  return language === 'en'
    ? 'Listening now. Kael will add the transcript to the message box.'
    : 'Đang nghe. Kael sẽ thêm nội dung nhận được vào ô nhắn.'
}

function kaelChatMicUnavailableBody(language: AppLanguage) {
  return language === 'en'
    ? 'Voice dictation is not available on this device yet. Type the details so Kael can keep context.'
    : 'Thiết bị này chưa mở đọc giọng nói. Nhập mô tả để Kael giữ bối cảnh.'
}

function getKaelWebSpeechRecognition(): KaelWebSpeechRecognitionConstructor | null {
  if (Platform.OS !== 'web') return null
  const speechGlobal = globalThis as unknown as {
    SpeechRecognition?: KaelWebSpeechRecognitionConstructor
    webkitSpeechRecognition?: KaelWebSpeechRecognitionConstructor
    window?: {
      SpeechRecognition?: KaelWebSpeechRecognitionConstructor
      webkitSpeechRecognition?: KaelWebSpeechRecognitionConstructor
    }
  }
  return speechGlobal.SpeechRecognition
    ?? speechGlobal.webkitSpeechRecognition
    ?? speechGlobal.window?.SpeechRecognition
    ?? speechGlobal.window?.webkitSpeechRecognition
    ?? null
}

export function useKaelChatTokens() {
  const themeMode = useCustomerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const tokens = getCustomerThemeTokens(themeMode)
  return reduceTransparency ? getReducedTransparencyCustomerTokens(tokens) : tokens
}

function kaelStatePaint(tokens: KaelChatTokens, tone: 'done' | 'locked' | 'question' | 'waiting'): ViewStyle {
  const dark = tokens.mode === 'dark'
  if (tone === 'done') {
    return {
      backgroundColor: dark ? 'rgba(26,66,59,0.94)' : 'rgba(217,251,242,0.92)',
      borderColor: dark ? 'rgba(105,222,198,0.28)' : 'rgba(8,139,124,0.30)',
      color: dark ? '#49CFC0' : '#088779',
    } as ViewStyle
  }
  if (tone === 'question') {
    return {
      backgroundColor: dark ? 'rgba(75,52,32,0.90)' : 'rgba(255,246,231,0.94)',
      borderColor: dark ? 'rgba(224,160,107,0.30)' : 'rgba(202,148,67,0.34)',
      color: dark ? '#E0A06B' : '#9B6718',
    } as ViewStyle
  }
  return {
    backgroundColor: dark ? 'rgba(29,61,57,0.90)' : 'rgba(205,241,240,0.88)',
    borderColor: dark ? 'rgba(105,222,198,0.24)' : 'rgba(36,118,109,0.30)',
    color: dark ? '#9AB6B0' : '#24766D',
  } as ViewStyle
}

export function KaelChatHeader({
  archiveItems = EMPTY_KAEL_CHAT_ARCHIVE_ITEMS,
  onOpenArchiveItem,
  onBack,
  reduceMotion,
  text,
  tokens,
}: {
  archiveItems?: KaelChatArchiveItem[]
  onOpenArchiveItem?: (item: KaelChatArchiveItem) => void
  onBack: () => void
  reduceMotion: boolean
  text: KaelChatText
  tokens: ReturnType<typeof useKaelChatTokens>
}) {
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveSubtitle = archiveItems[0]?.title ?? text.archiveEmptySubtitle
  const panelBackground = tokens.mode === 'dark' ? 'rgba(17,31,29,0.60)' : 'rgba(255,255,255,0.50)'

  const handleArchiveItemPress = useCallback((item: KaelChatArchiveItem) => {
    setArchiveOpen(false)
    onOpenArchiveItem?.(item)
  }, [onOpenArchiveItem])

  const renderArchiveItem = useCallback(({ item, index }: ListRenderItemInfo<KaelChatArchiveItem>) => (
    <KaelArchiveRow
      index={index}
      item={item}
      onPress={handleArchiveItemPress}
      reduceMotion={reduceMotion}
      tokens={tokens}
    />
  ), [handleArchiveItemPress, reduceMotion, tokens])
  const archiveKeyExtractor = useCallback((item: KaelChatArchiveItem) => item.id, [])

  return (
    <View style={styles.chatTopChrome} testID="customer-kael-chat-glass-header">
      <View style={styles.chatTopUtilityRow} testID="customer-chat-reference-top-controls">
        <Pressable accessibilityLabel={text.back} accessibilityRole="button" hitSlop={4} onPress={onBack} style={({ pressed }) => [styles.chatRoundButton, { borderColor: tokens.border }, kaelSurfacePaint(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-kael-chat-close">
          <ChatBackIcon color={tokens.primary} />
        </Pressable>
        <View style={styles.chatArchiveDock} testID="customer-kael-chat-session-archive-dock">
          <Pressable
            accessibilityLabel={`${text.archiveTitle}. ${archiveSubtitle}`}
            accessibilityHint={text.archiveOpen}
            accessibilityRole="button"
            accessibilityState={{ expanded: archiveOpen }}
            hitSlop={4}
            onPress={() => setArchiveOpen((open) => !open)}
            style={({ pressed }) => [
              styles.chatArchiveToolbar,
              { borderColor: tokens.border },
              kaelSurfacePaint(tokens, 'header'),
              reduceMotionAwarePressStyle(pressed, reduceMotion),
            ]}
            testID="customer-kael-chat-session-archive-toolbar"
          >
            <View style={styles.chatArchiveIconStage} testID="customer-kael-chat-session-archive-image-stage">
              <Image
                contentFit="contain"
                source={clientChatArchiveIcon}
                style={styles.chatArchiveImageIcon}
                testID="customer-kael-chat-session-archive-image-icon"
              />
            </View>
            <View style={styles.chatArchiveToolbarCopy}>
              <Text style={[styles.chatArchiveToolbarTitle, { color: tokens.text }]} numberOfLines={1}>
                {text.archiveTitle}
              </Text>
              <Text style={[styles.chatArchiveToolbarSubtitle, { color: tokens.muted }]} numberOfLines={1}>
                {archiveSubtitle}
              </Text>
            </View>
            <ChatChevronIcon color={tokens.primary} open={archiveOpen} />
          </Pressable>

          {archiveOpen ? (
            <GlassSurface
              backgroundColor={panelBackground}
              borderColor={tokens.borderStrong}
              material="liquid"
              mode={tokens.mode}
              style={[styles.chatArchivePanel, kaelSurfacePaint(tokens, 'header')]}
              testID="customer-kael-chat-session-archive-panel"
              variant="control"
            >
              {archiveItems.length > 0 ? (
                <FlatList
                  contentContainerStyle={styles.chatArchivePanelList}
                  data={archiveItems}
                  keyExtractor={archiveKeyExtractor}
                  nestedScrollEnabled
                  renderItem={renderArchiveItem}
                  scrollEnabled={archiveItems.length > 3}
                  showsVerticalScrollIndicator={archiveItems.length > 3}
                  style={styles.chatArchivePanelScroll}
                  testID="customer-kael-chat-session-archive-scroll"
                />
              ) : (
                <View style={styles.chatArchiveEmpty} testID="customer-kael-chat-session-archive-empty">
                  <Text style={[styles.chatArchiveItemTitle, { color: tokens.text }]} numberOfLines={1}>
                    {text.archiveEmptyTitle}
                  </Text>
                  <Text style={[styles.chatArchiveItemSubtitle, { color: tokens.muted }]} numberOfLines={2}>
                    {text.archiveEmptyBody}
                  </Text>
                </View>
              )}
            </GlassSurface>
          ) : null}
        </View>
        <View accessibilityLabel="Kael" accessible style={[styles.chatKaelBubble, { borderColor: tokens.border }, kaelSurfacePaint(tokens, 'icon')]} testID="customer-kael-chat-kael-bubble">
          <OfficialKaelMascot size={34} state="listening" style={styles.chatKaelBubbleImage} testID="customer-kael-chat-header-kael" variant="head" />
        </View>
      </View>
    </View>
  )
}

const KaelArchiveRow = memo(function KaelArchiveRow({
  index,
  item,
  onPress,
  reduceMotion,
  tokens,
}: {
  index: number
  item: KaelChatArchiveItem
  onPress: (item: KaelChatArchiveItem) => void
  reduceMotion: boolean
  tokens: KaelChatTokens
}) {
  const active = index === 0
  const handlePress = useCallback(() => {
    onPress(item)
  }, [item, onPress])

  return (
    <Pressable
      accessibilityLabel={`${item.title}. ${item.subtitle}. ${item.meta}`}
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [
        styles.chatArchiveItem,
        { backgroundColor: tokens.raised, borderColor: active ? tokens.borderStrong : tokens.border },
        kaelSurfacePaint(tokens, 'field'),
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={`customer-kael-chat-session-archive-item-${index}`}
    >
      <View style={[styles.chatArchiveItemMarker, { backgroundColor: active ? tokens.primary : tokens.service, borderColor: tokens.border }]} />
      <View style={styles.chatArchiveItemCopy}>
        <Text style={[styles.chatArchiveItemTitle, { color: tokens.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.chatArchiveItemSubtitle, { color: tokens.muted }]} numberOfLines={1}>
          {item.subtitle}
        </Text>
      </View>
      <Text style={[styles.chatArchiveItemMeta, { color: tokens.primary }]} numberOfLines={1}>
        {item.meta}
      </Text>
    </Pressable>
  )
})

export function KaelChatComposer({
  addressLabel,
  dispatch,
  draft,
  error,
  hideAddressContext = false,
  language,
  onAddressDistrict,
  onSend,
  reduceMotion,
  sending,
  text,
  themeMode,
  tokens,
}: {
  addressLabel: string
  dispatch: Dispatch<KaelChatAction>
  draft: string
  error: string | null
  hideAddressContext?: boolean
  language: AppLanguage
  onAddressDistrict: (district: string) => void
  onSend: () => Promise<void>
  reduceMotion: boolean
  sending: boolean
  text: KaelChatText
  themeMode: ReturnType<typeof useCustomerThemeMode>
  tokens: ReturnType<typeof useKaelChatTokens>
}) {
  const canSend = draft.trim().length > 0
  const addressPillLabel = language === 'en' ? 'Address context' : 'Địa chỉ'
  const inputAccessibilityLabel = text.composerPlaceholder || (language === 'en' ? 'Message Kael' : 'Nhắn Kael')
  const [addressLifted, setAddressLifted] = useState(false)
  const [addressFocused, setAddressFocused] = useState(false)
  const [composerFocused, setComposerFocused] = useState(false)
  const [composerInputHeight, setComposerInputHeight] = useState(28)
  const addressProgress = useSharedValue(0)
  const addressHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechRecognitionRef = useRef<KaelWebSpeechRecognition | null>(null)
  const addressVisible = !hideAddressContext && (addressLifted || addressFocused || composerFocused)
  const addressSlotStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + addressProgress.value * 0.5,
    transform: [{ translateY: 34 - addressProgress.value * 34 }],
  }))

  const clearAddressHideTimer = () => {
    if (!addressHideTimerRef.current) return
    clearTimeout(addressHideTimerRef.current)
    addressHideTimerRef.current = null
  }

  const revealAddress = () => {
    clearAddressHideTimer()
    setAddressLifted(true)
  }

  const appendDraftNote = useCallback((note: string) => {
    dispatch({
      type: 'appendDraft',
      segment: note,
    })
  }, [dispatch])

  const handleAttachPress = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(text.attach, kaelChatAttachmentPermissionBody(language))
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
    const fileName = asset.fileName?.trim() || kaelChatAttachmentFallbackName(language)
    dispatch({
      type: 'addComposerPhotos',
      drafts: [{
        uri: asset.uri,
        type: 'image',
        fileName,
        mimeType: asset.mimeType ?? undefined,
        fileSizeBytes: asset.fileSize ?? undefined,
      }],
    })
    appendDraftNote(kaelChatAttachmentDraftLine(language, fileName))
    Alert.alert(text.attach, kaelChatAttachmentReadyBody(language))
  }, [appendDraftNote, dispatch, language, text.attach])

  const handleMicPress = useCallback(() => {
    const SpeechRecognition = getKaelWebSpeechRecognition()
    if (!SpeechRecognition) {
      Alert.alert(text.mic, kaelChatMicUnavailableBody(language))
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
        Alert.alert(text.mic, kaelChatMicUnavailableBody(language))
      }
      recognition.onend = () => {
        if (speechRecognitionRef.current === recognition) speechRecognitionRef.current = null
      }
      recognition.start()
      Alert.alert(text.mic, kaelChatMicListeningBody(language))
    } catch {
      speechRecognitionRef.current = null
      Alert.alert(text.mic, kaelChatMicUnavailableBody(language))
    }
  }, [appendDraftNote, language, text.mic])

  useEffect(() => {
    addressProgress.value = withTiming(addressVisible ? 1 : 0, { duration: reduceMotion ? 1 : 220 })
  }, [addressProgress, addressVisible, reduceMotion])

  useEffect(() => () => {
    speechRecognitionRef.current?.stop?.()
    speechRecognitionRef.current = null
  }, [])

  useEffect(() => {
    if (!addressLifted || addressFocused || composerFocused) return undefined
    const timer = setTimeout(() => {
      setAddressLifted(false)
    }, ADDRESS_AUTO_HIDE_DELAY_MS)
    addressHideTimerRef.current = timer
    return () => {
      clearTimeout(timer)
      if (addressHideTimerRef.current === timer) {
        addressHideTimerRef.current = null
      }
    }
  }, [addressFocused, addressLifted, composerFocused])

  return (
    <View style={styles.chatComposerTouchWrap} testID="customer-kael-composer-sequential-trigger">
      <GlassSurface borderColor={tokens.borderStrong} material="liquid" mode={themeMode} style={[styles.composerGlass, kaelSurfacePaint(tokens, 'composer')]} testID="customer-kael-chat-glass-composer" variant="sheet">
        <View pointerEvents="none" style={[styles.chatComposerKeyline, { borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.88)' }]} testID="customer-chat-reference-composer-keyline" />
        {hideAddressContext ? null : (
          <View style={styles.addressLiftFrame}>
            <Animated.View pointerEvents={addressVisible ? 'auto' : 'none'} style={[styles.addressLiftSlot, { height: addressVisible ? 56 : 0 }, addressSlotStyle]} testID="customer-kael-chat-address-slot">
              <KaelAddressContextBar
                addressLabel={addressLabel}
                language={language}
                onBlur={() => setAddressFocused(false)}
                onChangeText={(value) => {
                  const nextDistrict = inferKaelChatDistrict(value)
                  if (nextDistrict) onAddressDistrict(nextDistrict)
                  dispatch({ type: 'setAddress', value })
                }}
                onFocus={() => {
                  setAddressFocused(true)
                  revealAddress()
                }}
                placeholder={text.addressPlaceholder}
                tokens={tokens}
              />
            </Animated.View>
          </View>
        )}
        <KaelTextField
          accessibilityLabel={inputAccessibilityLabel}
          inputShellStyle={styles.composerTextFieldShell}
          multiline
          onChangeText={(value) => {
            dispatch({
              type: 'setDraft',
              value,
              clearTransientError: error === text.errorNoService || error === text.attachHint,
            })
          }}
          onContentSizeChange={(event) => setComposerInputHeight(Math.min(76, Math.max(28, event.nativeEvent.contentSize.height)))}
          placeholder={text.composerPlaceholder}
          placeholderTextColor={tokens.subtleText}
          onBlur={() => setComposerFocused(false)}
          onFocus={() => {
            setComposerFocused(true)
            if (!hideAddressContext) revealAddress()
          }}
          onSubmitEditing={() => void onSend()}
          returnKeyType="send"
          scrollEnabled={false}
          selectionColor={tokens.primary}
          shellStyle={styles.composerTextFieldStack}
          style={[styles.input, styles.inputInvisibleFocus, { caretColor: tokens.primary, color: tokens.text, height: composerInputHeight } as any]}
          testID="customer-kael-chat-input"
          value={draft}
        />
        <View style={styles.chatComposerControlRow} testID="customer-chat-reference-composer-tools">
          <Pressable accessibilityLabel={text.attach} accessibilityRole="button" hitSlop={4} onPress={() => void handleAttachPress()} style={({ pressed }) => [styles.attachButton, { borderColor: tokens.border }, kaelSurfacePaint(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-kael-chat-attach">
            <ChatPlusIcon color={tokens.primary} />
          </Pressable>
          <Pressable accessibilityLabel={addressPillLabel} accessibilityRole="button" hitSlop={4} onPress={hideAddressContext ? undefined : revealAddress} style={({ pressed }) => [styles.chatModePill, { borderColor: tokens.border }, kaelSurfacePaint(tokens, 'status'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-chat-reference-mode-pill">
            <View pointerEvents="none" style={[styles.chatModePillGlassLayer, chatModePillGlassLayer(tokens)]} testID="customer-chat-mode-pill-glass-layer" />
            <Text style={[styles.chatModeText, { color: tokens.primary }, chatModePillTextHighlight(tokens)]} numberOfLines={1}>
              Kael
            </Text>
          </Pressable>
          <View style={styles.chatComposerControlSpacer} />
          <View style={styles.chatComposerRightActions} testID="customer-chat-reference-composer-right-actions">
            <Pressable accessibilityLabel={text.mic} accessibilityRole="button" hitSlop={4} onPress={handleMicPress} style={({ pressed }) => [styles.micButton, { borderColor: tokens.border }, kaelSurfacePaint(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-kael-chat-mic">
              <ChatMicIcon color={tokens.primary} />
            </Pressable>
            <Pressable accessibilityLabel={sending ? text.sending : text.send} accessibilityRole="button" accessibilityState={{ busy: sending, disabled: sending || !canSend }} disabled={sending || !canSend} hitSlop={4} onPress={onSend} style={({ pressed }) => [styles.sendButton, { backgroundColor: canSend ? tokens.primary : tokens.raised, borderColor: canSend ? tokens.borderStrong : tokens.border }, canSend ? kaelSurfacePaint(tokens, 'send') : kaelSurfacePaint(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-kael-chat-send">
              {sending ? <ActivityIndicator color={tokens.primaryText} size="small" /> : <ChatSendIcon color={canSend ? tokens.primaryText : tokens.subtleText} />}
            </Pressable>
          </View>
        </View>
      </GlassSurface>
    </View>
  )
}

function chatModePillGlassLayer(tokens: KaelChatTokens): ViewStyle {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.glassShadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 72% 16%, rgba(245,255,252,0.18), transparent 38%), linear-gradient(145deg, rgba(245,255,252,0.12), rgba(105,222,198,0.09))'
    : 'radial-gradient(circle at 72% 10%, rgba(255,255,255,0.98), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.96), rgba(235,255,250,0.78))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(245,255,252,0.12)' : 'rgba(255,255,255,0.92)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? 'inset 0 1px 0 rgba(190,210,205,0.16)'
        : '0 8px 20px rgba(13,134,119,0.06), inset 0 1px 0 rgba(255,255,255,0.98)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as ViewStyle
}

function chatModePillTextHighlight(tokens: KaelChatTokens): ViewStyle {
  return {
    textShadowColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.20)' : 'rgba(255,255,255,0.86)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: tokens.mode === 'dark' ? 8 : 5,
  } as ViewStyle
}

export function KaelProcessCard({
  estimate,
  loading,
  ticketMode,
  text,
}: {
  estimate: NonNullable<KaelChatResponse['session']['estimate']> | null
  loading: boolean
  ticketMode: WorkflowArtifactMode
  text: KaelChatText
}) {
  const tokens = useKaelChatTokens()
  const status = loading ? text.loading : estimate ? text.orchestrate : text.agentStatus
  const visibleSteps = processStepCount(ticketMode)
  const steps = [
    ['01', text.agentSteps.read],
    ['02', text.agentSteps.missing],
    ['03', text.agentSteps.orchestrate],
  ] as const

  return (
    <View style={[styles.agentFocusCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'agent')]} testID="customer-kael-agentic-process">
      <View style={styles.agentHead}>
        <View style={[styles.agentAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'avatar')]}>
          <OfficialKaelMascot size={42} state={loading ? 'processing' : estimate ? 'proposing' : 'thinking'} style={styles.agentAvatarImage} testID="customer-kael-agentic-process-kael" variant="head" />
        </View>
        <View style={[styles.agentStatusRail, { backgroundColor: tokens.raised, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'status')]}>
          <View style={[styles.agentStatusAccent, { backgroundColor: tokens.primary }]} />
          <Text style={[styles.agentStatusText, { color: tokens.text }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
      </View>
      <View style={styles.agentSteps}>
        {steps.slice(0, visibleSteps).map(([stepId, title]) => (
          <ProcessStepCard index={stepId} key={stepId} title={title} />
        ))}
      </View>
    </View>
  )
}

export function KaelPhaseContextCard({
  language,
  phaseContext,
}: {
  language: AppLanguage
  phaseContext: WorkflowPhaseContext
}) {
  const tokens = useKaelChatTokens()
  const visibleSections = orderWorkflowPhaseSectionsForSummary(phaseContext, phaseContext.sections.filter((section) => section.visible && section.role !== 'worker'))
  const primarySection = visibleSections.find((section) => section.id === phaseContext.primaryArtifact?.id) ?? visibleSections[0] ?? null
  const primaryArtifact = primarySection?.title[language] ?? localizedArtifactFallback(language)
  const blocked = phaseContext.blockedReason ? workflowBlockedReasonLabel(phaseContext.blockedReason, language) : workflowAllowedActionsLabel(phaseContext.allowedActions, language)
  const nextEvent = phaseContext.nextExpectedEvent ? workflowEventLabel(phaseContext.nextExpectedEvent, language) : localizedDoneEvent(language)
  const sectionSummary = workflowSectionSummary(visibleSections, language)

  return (
    <View style={[styles.traceCard, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'phaseContext')]} testID="customer-kael-chat-phase-context">
      <Text style={[styles.traceTitle, { color: tokens.primary }]} numberOfLines={1}>
        {phaseContext.title[language]}
      </Text>
      <Text style={[styles.bodyText, { color: tokens.text }]} numberOfLines={3}>
        {phaseContext.intent[language]}
      </Text>
      <View style={styles.briefGrid}>
        <BriefField label={language === 'en' ? 'Source' : 'Nguồn'} surfaceTone="mint" value={workflowSourceOfTruthLabel(phaseContext.sourceOfTruth, language)} />
        <BriefField label={language === 'en' ? 'Artifact' : 'Dấu mốc'} surfaceTone="mint" value={primaryArtifact} />
        <BriefField label={language === 'en' ? 'Next' : 'Tiếp theo'} surfaceTone="mint" value={nextEvent} />
        <BriefField label={language === 'en' ? 'Gate' : 'Cổng'} surfaceTone="mint" value={blocked} />
        <BriefField label={language === 'en' ? 'Live sections' : 'Mục đang sống'} surfaceTone="mint" value={sectionSummary} wide />
      </View>
    </View>
  )
}

function processStepCount(ticketMode: WorkflowArtifactMode) {
  if (ticketMode === 'basic' || ticketMode === 'partial') return 1
  if (ticketMode === 'loading') return 2
  return 3
}

export function KaelTraceCard({
  addressDistrict,
  estimate,
  language,
  selectedService,
  session,
  text,
}: {
  addressDistrict: string | null
  estimate: NonNullable<KaelChatResponse['session']['estimate']> | null
  language: AppLanguage
  selectedService: ServiceType | null
  session: KaelChatResponse | null
  text: KaelChatText
}) {
  const tokens = useKaelChatTokens()
  const activeService = session?.session.service_type ?? selectedService
  const hasInput = Boolean(session?.turns.length)
  const missingBody = estimate
    ? text.traceMissingReady
    : hasInput || addressDistrict
      ? text.traceMissingActive
      : text.traceMissingEmpty

  return (
    <View style={[styles.traceCard, { backgroundColor: tokens.raised, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'trace')]} testID="customer-kael-agentic-trace">
      <Text style={[styles.traceTitle, { color: tokens.primary }]} numberOfLines={1}>
        {text.traceTitle}
      </Text>
      <TraceRow
        body={activeService ? localizedServiceLabel(activeService, language) : text.traceServiceEmpty}
        index="1"
        label={text.traceService}
        state={activeService ? text.traceDone : text.traceWaiting}
        tone={activeService ? 'done' : 'waiting'}
      />
      <TraceRow
        body={missingBody}
        index="2"
        label={text.traceMissing}
        state={estimate ? text.traceDone : text.traceQuestion}
        tone={estimate ? 'done' : 'question'}
      />
      <TraceRow
        body={text.traceDecisionBody}
        index="3"
        label={text.traceDecision}
        state={text.traceLocked}
        tone="locked"
      />
    </View>
  )
}

export function EmptyKaelBriefCard({ language, selectedService, text }: { language: AppLanguage; selectedService: ServiceType | null; text: KaelChatText }) {
  const tokens = useKaelChatTokens()
  const preview = kaelEstimatePreviewCopy[language]
  const serviceValue = selectedService ? localizedServiceLabel(selectedService, language) : preview.servicePending
  const rows = buildEstimatePreviewRows({
    cancellationBody: text.cancellationBody,
    labels: text.labels,
    language,
    problemValue: preview.problemPending,
    serviceValue,
  })

  return (
    <View style={[styles.emptyTicketCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'brief')]} testID="customer-kael-chat-empty-ticket-summary">
      <View style={styles.estimateHeader}>
        <Text style={[styles.sectionTitle, { color: tokens.text }]}>{preview.title}</Text>
        <Text style={[styles.statusPill, { color: tokens.primary, borderColor: tokens.border, backgroundColor: tokens.service }, kaelSurfacePaint(tokens, 'pill')]} numberOfLines={1}>
          {preview.status}
        </Text>
      </View>
      <EstimatePreviewRows rows={rows} />
    </View>
  )
}

export function KaelIntakeReceiptCard({ intake, language }: { intake: PendingKaelChatDraft; language: AppLanguage }) {
  const tokens = useKaelChatTokens()
  const preview = kaelEstimatePreviewCopy[language]
  const serviceValue = intake.serviceType ? localizedServiceLabel(intake.serviceType, language) : preview.servicePending
  const firstProblemChip = (intake.problemChips ?? []).find((chip) => chip.trim().length > 0)?.trim()
  const problemValue = firstProblemChip || (intake.message.trim() ? preview.problemFromDescription : preview.problemPending)
  const rows = buildEstimatePreviewRows({
    language,
    problemValue,
    serviceValue,
  })

  return (
    <View style={[styles.emptyTicketCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'brief')]} testID="customer-kael-chat-intake-receipt">
      <View style={styles.estimateHeader}>
        <Text style={[styles.sectionTitle, { color: tokens.text }]}>{preview.title}</Text>
        <Text style={[styles.statusPill, { color: tokens.primary, borderColor: tokens.border, backgroundColor: tokens.service }, kaelSurfacePaint(tokens, 'pill')]} numberOfLines={1}>
          {preview.status}
        </Text>
      </View>
      <EstimatePreviewRows rows={rows} />
    </View>
  )
}

const kaelEstimatePreviewCopy = {
  vi: {
    cancellationBody: 'Bạn có thể hủy miễn phí trước khi thợ nhận việc. Sau khi thợ nhận, có thể áp dụng phí dịch vụ tối thiểu.',
    confidencePending: 'Chờ đủ dữ liệu',
    labels: {
      cancellationNote: 'Chính sách hủy',
      complexity: 'Mức độ',
      confidence: 'Độ tin cậy',
      platformFee: 'Phí nền tảng',
      price: 'Khoảng giá',
      problem: 'Vấn đề',
      service: 'Dịch vụ',
      summaryTotal: 'Tổng dự kiến',
    },
    platformFeePending: 'Hiển thị khi có ước tính',
    pricePending: 'Chờ Kael ước tính',
    problemFromDescription: 'Kael đang phân loại từ mô tả.',
    problemPending: 'Chưa có',
    servicePending: 'Chưa có',
    status: 'Thông tin đầu vào',
    summaryPending: 'Chờ Kael tính',
    title: 'Phiếu gửi Kael',
    typePending: 'Chờ Kael phân loại',
  },
  en: {
    cancellationBody: 'Free cancellation before a worker accepts. After acceptance, a minimum service fee may apply.',
    confidencePending: 'Waiting for enough data',
    labels: {
      cancellationNote: 'Cancellation policy',
      complexity: 'Complexity',
      confidence: 'Confidence',
      platformFee: 'Platform fee',
      price: 'Price range',
      problem: 'Problem',
      service: 'Service',
      summaryTotal: 'Estimated total',
    },
    platformFeePending: 'Shown after a real estimate',
    pricePending: 'Waiting for Kael estimate',
    problemFromDescription: 'Kael is classifying from the description.',
    problemPending: 'Not available yet',
    servicePending: 'Not available yet',
    status: 'Input details',
    summaryPending: 'Waiting for Kael calculation',
    title: 'Kael intake ticket',
    typePending: 'Waiting for Kael classification',
  },
} as const

function buildEstimatePreviewRows({
  cancellationBody,
  labels,
  language,
  problemValue,
  serviceValue,
}: {
  cancellationBody?: string
  labels?: KaelChatText['labels']
  language: AppLanguage
  problemValue: string
  serviceValue: string
}) {
  const preview = kaelEstimatePreviewCopy[language]
  const rowLabels = labels ?? preview.labels

  return [
    { label: rowLabels.service, value: serviceValue },
    { label: rowLabels.problem, value: problemValue },
    { label: rowLabels.price, value: preview.pricePending },
    { label: rowLabels.complexity, value: preview.typePending },
    { label: rowLabels.confidence, value: preview.confidencePending },
    { label: rowLabels.platformFee, value: preview.platformFeePending },
    { label: rowLabels.summaryTotal, value: preview.summaryPending },
    { label: rowLabels.cancellationNote, value: cancellationBody ?? preview.cancellationBody },
  ]
}

function EstimatePreviewRows({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <View style={styles.estimatePreviewRows}>
      {rows.map((row) => (
        <InfoRow key={row.label} label={row.label} value={row.value} />
      ))}
    </View>
  )
}

function BriefField({
  label,
  surfaceTone = 'default',
  value,
  wide = false,
}: {
  label: string
  surfaceTone?: 'default' | 'mint'
  value: string
  wide?: boolean
}) {
  const tokens = useKaelChatTokens()
  const paintTone = surfaceTone === 'mint' ? 'phaseField' : 'field'
  const borderColor = surfaceTone === 'mint' ? tokens.borderStrong : tokens.border

  return (
    <View style={[styles.briefField, wide ? styles.briefFieldWide : null, { backgroundColor: tokens.raised, borderColor }, kaelSurfacePaint(tokens, paintTone)]}>
      <Text style={[styles.briefFieldLabel, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.briefFieldValue, { color: tokens.text }]} numberOfLines={wide ? 3 : 2}>
        {value}
      </Text>
    </View>
  )
}

function localizedArtifactFallback(language: AppLanguage) {
  return language === 'en' ? 'No live artifact yet' : 'Chưa có dấu mốc sống'
}

function localizedDoneEvent(language: AppLanguage) {
  return language === 'en' ? 'No next event' : 'Không có sự kiện kế tiếp'
}

function workflowSectionSummary(sections: WorkflowPhaseContext['sections'], language: AppLanguage) {
  const labels = sections.slice(0, 4).map((section) => {
    const mode = section.mode ? workflowArtifactModeLabel(section.mode, language) : workflowSourceOfTruthLabel(section.sourceOfTruth, language)
    return `${section.title[language]} · ${mode}`
  })
  if (sections.length > 4) {
    labels.push(language === 'en' ? `+${sections.length - 4} more` : `+${sections.length - 4} mục nữa`)
  }
  return labels.length > 0 ? labels.join('\n') : (language === 'en' ? 'No visible section yet' : 'Chưa có mục hiển thị')
}

export function EstimateInline({
  estimate,
  language,
  text,
}: {
  estimate: NonNullable<KaelChatResponse['session']['estimate']>
  language: AppLanguage
  text: KaelChatText
}) {
  const tokens = useKaelChatTokens()

  return (
    <View style={[styles.inlineEstimate, { borderColor: tokens.border }]}>
      <Text style={[styles.inlineEstimateText, { color: tokens.muted }]}>
        {text.labels.price}: {formatPriceRange(estimate.price_min, estimate.price_max)}
      </Text>
    </View>
  )
}

export function EstimateCard({
  canStartOrchestration,
  estimate,
  language,
  onStartOrchestration,
  orchestrating,
  orchestrationStarted,
  text,
}: {
  canStartOrchestration: boolean
  estimate: NonNullable<KaelChatResponse['session']['estimate']>
  language: AppLanguage
  onStartOrchestration: () => void
  orchestrating: boolean
  orchestrationStarted: boolean
  text: KaelChatText
}) {
  const tokens = useKaelChatTokens()
  const problem = localizedGeneratedText(estimate.problem_summary || estimate.problem_category, language, text.estimateProblemFallback)
  const advisory = localizedOptionalGeneratedText(estimate.advisory, language)
  // A-2 (Notes.md): when Kael flagged the estimate as low-confidence it sets
  // needs_inspection; show it explicitly so the customer reads the range as
  // preliminary (prevents "giá chắc -> tranh chấp khi thợ tới").
  const needsInspection = estimate.needs_inspection === true
  const inspectionBody = localizedOptionalGeneratedText(estimate.needs_inspection_reason, language)
    ?? (language === 'vi'
      ? 'Kael cần thợ xác nhận tại hiện trường trước khi chốt giá; khoảng giá trên là ước tính sơ bộ.'
      : 'Kael needs an on-site check before confirming the price; the range above is preliminary.')
  const disclaimer = language === 'vi'
    ? LOCAL_WORKFLOW_PRICE_DISCLAIMER
    : localizedGeneratedText(estimate.disclaimer, language, text.estimateDisclaimerFallback)
  const orchestrationBusy = orchestrating
  const actionLabel = orchestrationBusy
    ? text.orchestrating
    : orchestrationStarted
      ? text.nextAction.confirmed
      : canStartOrchestration
        ? text.orchestrate
        : text.nextAction.await_input

  return (
    <View style={[styles.estimateCard, styles.estimateMintCard, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }, kaelSurfacePaint(tokens, 'phaseContext')]} testID="customer-kael-chat-estimate-card">
      <View style={[styles.estimateMintAura, { backgroundColor: tokens.aqua }]} testID="customer-kael-chat-estimate-mint-aura" />
      <View style={[styles.estimateMintEdge, { backgroundColor: tokens.glassHighlight }]} />
      <View style={styles.estimateHeader}>
        <Text style={[styles.sectionTitle, { color: tokens.text }]}>{text.estimateTitle}</Text>
      </View>
      <InfoRow label={text.labels.service} value={localizedServiceLabel(estimate.service_type, language)} />
      <InfoRow label={text.labels.problem} value={problem} />
      <InfoRow label={text.labels.price} value={formatPriceRange(estimate.price_min, estimate.price_max)} />
      <InfoRow label={text.labels.complexity} value={text.complexity[estimate.complexity]} />
      <InfoRow label={text.labels.confidence} value={`${Math.round(estimate.confidence * 100)}%`} />
      {needsInspection ? (
        <View style={[styles.inspectionNotice, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]} testID="customer-kael-chat-needs-inspection">
          <Text style={[styles.inspectionNoticeTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Cần kiểm tra tại hiện trường' : 'On-site inspection needed'}
          </Text>
          <Text style={[styles.inspectionNoticeBody, { color: tokens.muted }]}>{inspectionBody}</Text>
        </View>
      ) : null}
      {advisory ? <InfoRow label={text.labels.advisory} value={advisory} /> : null}
      <InfoRow label={text.labels.platformFee} value={formatPlatformFee(language)} />
      <InfoRow
        label={text.labels.summaryTotal}
        value={formatPriceRange(
          Math.round(estimate.price_min * PLATFORM_FEE_MULTIPLIER),
          Math.round(estimate.price_max * PLATFORM_FEE_MULTIPLIER),
        )}
      />
      <InfoRow label={text.labels.cancellationNote} value={text.cancellationBody} />
      <Text style={[styles.disclaimer, { color: tokens.muted }]} testID="customer-kael-chat-price-disclaimer">
        {disclaimer}
      </Text>
      <KaelButton
        accessibilityState={{ busy: orchestrationBusy, disabled: true }}
        label={actionLabel}
        disabled onPress={onStartOrchestration}
        showPrimaryGradient={false}
        style={[styles.primaryButton, { backgroundColor: tokens.disabled }]}
        testID="customer-kael-chat-orchestration"
        textStyle={[styles.primaryButtonText, { color: tokens.subtleText }]}
      />
    </View>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const tokens = useKaelChatTokens()
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.infoValue, { color: tokens.text }]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  )
}

function formatPriceRange(min: number, max: number) {
  return `${vndFormatter.format(min)}đ - ${vndFormatter.format(max)}đ`
}

function formatPlatformFee(language: AppLanguage) {
  const value = PLATFORM_FEE_CUSTOMER * 100
  return language === 'vi' ? `~${String(value).replace('.', ',')}%` : `~${value}%`
}

function localizedGeneratedText(value: string, language: AppLanguage, fallback: string) {
  const trimmed = value.trim()
  if (trimmed.length === 0) return fallback
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return fallback
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return fallback
  return trimmed
}

function localizedOptionalGeneratedText(value: string | null | undefined, language: AppLanguage) {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (language === 'en' && vietnameseSignalPattern.test(trimmed)) return null
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return null
  return trimmed
}

function ProcessStepCard({ index, title }: { index: string; title: string }) {
  const tokens = useKaelChatTokens()

  return (
    <View style={[styles.agentStepCard, { backgroundColor: tokens.raised, borderColor: tokens.border }, kaelSurfacePaint(tokens, 'step')]}>
      <Text style={[styles.agentStepIndex, { color: tokens.primary }]}>{index}</Text>
      <Text style={[styles.agentStepTitle, { color: tokens.text }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  )
}

function TraceRow({
  body,
  index,
  label,
  state,
  tone,
}: {
  body: string
  index: string
  label: string
  state: string
  tone: 'done' | 'locked' | 'question' | 'waiting'
}) {
  const tokens = useKaelChatTokens()
  const isWarm = tone === 'question'
  const isLocked = tone === 'locked'
  const stateSurface = {
    backgroundColor: tone === 'done' ? tokens.service : isWarm ? tokens.warm : isLocked ? tokens.ghost : tokens.raised,
    borderColor: tone === 'done' ? tokens.borderStrong : isWarm ? tokens.copper : tokens.border,
    color: tone === 'done' ? tokens.primary : isWarm ? tokens.copper : isLocked ? tokens.muted : tokens.muted,
  }

  return (
    <View style={styles.traceRow}>
      <Text style={[styles.traceIndex, { backgroundColor: tokens.service, borderColor: tokens.border, color: tokens.primary }, kaelSurfacePaint(tokens, 'index')]}>{index}</Text>
      <View style={styles.traceCopy}>
        <Text style={[styles.traceLabel, { color: tokens.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.traceBody, { color: tokens.muted }]} numberOfLines={2}>
          {body}
        </Text>
      </View>
      <Text style={[styles.traceState, stateSurface, kaelStatePaint(tokens, tone)]} numberOfLines={1}>
        {state}
      </Text>
    </View>
  )
}

function ChatBackIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18 9 12l6-6" stroke={color} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function ChatChevronIcon({ color, open }: { color: string; open: boolean }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" style={open ? styles.chatArchiveChevronOpen : undefined}>
      <Path d="m7 10 5 5 5-5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function ChatPlusIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  )
}

function ChatMicIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5a3.3 3.3 0 0 0-3.3 3.3v4.4a3.3 3.3 0 0 0 6.6 0V6.8A3.3 3.3 0 0 0 12 3.5Z" stroke={color} strokeWidth={2} />
      <Path d="M5.7 10.7a6.3 6.3 0 0 0 12.6 0M12 17v3.5M9.2 20.5h5.6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function ChatSendIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2 11 13" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m22 2-7 20-4-9-9-4 20-7Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}
