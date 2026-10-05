import { useRef, useState } from 'react'
import {
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelSendStopGlyph } from '@/components/ui/kael-send-stop-glyph'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useKaelComposerInputSizing } from '@/components/ui/kael-composer-input-height'
import { KaelTextField } from '@/components/ui/kael-primitives'
import { NormalChatGhostOverlay } from '@/components/ui/normal-chat-ghost-overlay'
import { LiquidControlButton } from '@/components/ui/liquid-back-button'
import { NormalChatStarterRail } from '@/components/ui/normal-chat-starter-rail'
import { EMPTY_NORMAL_CHAT_SUGGESTIONS, getNormalChatGhostSuffix, getNormalChatSendPalette } from '@/components/ui/normal-chat-composer-model'
import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

import type { CustomerThemeTokens } from '../customer-theme'
import { ChatMediaCameraIcon } from './chat-surfaces'
import { MediaDraftPreviewTray } from './media-draft-preview-tray'
import { customerV21ChatStyles as chatStyles } from './chat-styles'
import { canSubmitCustomerKaelComposer } from './customer-kael-composer-state'
import { CUSTOMER_KAEL_MESSAGE_MAX_LENGTH } from './customer-kael-message-limits'

export type RootChatStyles = {
  bodyText: StyleProp<TextStyle>
  composer: StyleProp<ViewStyle>
  composerInput: StyleProp<TextStyle>
  composerTextFieldShell: StyleProp<ViewStyle>
  composerTextFieldStack: StyleProp<ViewStyle>
  errorText: StyleProp<TextStyle>
  flex: StyleProp<ViewStyle>
  sendButton: StyleProp<ViewStyle>
}

export function KaelChatComposer({
  allowVideoSelection,
  canUseComposerMedia,
  composerBusy,
  composerMediaDraftCount,
  composerMediaDrafts,
  composerSending = false,
  composerPlaceholder,
  draft,
  hasVoiceTranscript,
  language,
  onBlur,
  onDraftChange,
  onFocus,
  onPickMedia,
  onRemoveComposerMediaDraft,
  onSendMessage,
  onStopMessage,
  normalChatStarterVisible = false,
  normalChatSuggestions = EMPTY_NORMAL_CHAT_SUGGESTIONS,
  rootStyles,
  stopAvailable = true,
  textInputNoOutlineStyle,
  tokens,
}: {
  allowVideoSelection: boolean
  canUseComposerMedia: boolean
  composerBusy: boolean
  composerSending?: boolean
  composerMediaDraftCount: number
  composerMediaDrafts: LocalMediaUploadDraft[]
  composerPlaceholder: string
  draft: string
  hasVoiceTranscript: boolean
  language: AppLanguage
  onBlur: () => void
  onDraftChange: (value: string) => void
  onFocus: () => void
  onPickMedia: () => void
  onRemoveComposerMediaDraft: (index: number) => void
  onSendMessage: () => void
  onStopMessage: () => void
  normalChatStarterVisible?: boolean
  normalChatSuggestions?: { id: string; text: string }[]
  rootStyles: RootChatStyles
  /** False while the busy request has no cancellation path; Stop must not claim to cancel it. */
  stopAvailable?: boolean
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const { reduceMotion } = useGlassAccessibility()
  const inputRef = useRef<TextInput>(null)
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const canSubmit = canSubmitCustomerKaelComposer({
    busy: composerBusy,
    draft,
    mediaDraftCount: canUseComposerMedia ? composerMediaDraftCount : 0,
    voiceTranscript: hasVoiceTranscript ? 'voice' : '',
  })
  const mediaPickerEnabled = canUseComposerMedia && !composerBusy && composerMediaDraftCount < 5
  const normalChatImageDrafts = !allowVideoSelection
    ? composerMediaDrafts.filter((item) => item.type === 'image')
    : []
  const activeMediaIconColor = tokens.mode === 'light' ? color.text.strong : tokens.primaryText
  const normalSendPalette = getNormalChatSendPalette(composerSending)
  const isLightNormalChat = !allowVideoSelection && tokens.mode === 'light'
  const activeSendBackground = tokens.mode === 'light' ? color.mint.white : tokens.primary
  const activeSendBorder = tokens.mode === 'light' ? color.surface.stroke : tokens.borderStrong
  const activeSendForeground = tokens.mode === 'light' ? color.text.strong : tokens.primaryText
  // The idle send button is a visible soft disc, the same as the Worker composer's.
  const idleSendBackground = tokens.mode === 'light' ? color.surface.soft : tokens.glassStrong
  const idleSendBorder = tokens.mode === 'light' ? color.surface.stroke : tokens.glassBorder
  const inputSizing = useKaelComposerInputSizing(draft)
  const ghost = !allowVideoSelection && !composerBusy
    ? getNormalChatGhostSuffix(draft, normalChatSuggestions, selection, isComposing)
    : null
  const liveGhostContext = useRef({ draft, isComposing, selection, suggestions: normalChatSuggestions })
  liveGhostContext.current = { draft, isComposing, selection, suggestions: normalChatSuggestions }
  const acceptGhost = () => {
    const latest = liveGhostContext.current
    const currentGhost = getNormalChatGhostSuffix(latest.draft, latest.suggestions, latest.selection, latest.isComposing)
    if (!currentGhost || currentGhost.suggestionId !== ghost?.suggestionId) return
    onDraftChange(latest.draft ? `${latest.draft}${currentGhost.text}` : currentGhost.text)
    setSelection(null)
    inputRef.current?.focus()
  }
  const inputTextStyle = [rootStyles.composerInput, inputSizing.inputStyle, textInputNoOutlineStyle, { color: tokens.text }]
  return (
    <>
      {normalChatStarterVisible && !allowVideoSelection ? (
        <NormalChatStarterRail
          actorRole="customer"
          colors={{ opaqueBackground: tokens.raised, opaqueBorder: tokens.border, text: tokens.text }}
          language={language}
          mode={tokens.mode}
          onSelect={(starterDraft) => {
            onDraftChange(starterDraft)
            setSelection(null)
            inputRef.current?.focus()
          }}
          visible
        />
      ) : null}
      {ghost && !normalChatStarterVisible ? (
        <Text style={{ color: tokens.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' }} testID="customer-v21-kael-ghost-hint">
          {language === 'vi' ? 'Chạm chữ mờ để thêm vào tin nhắn.' : 'Tap the faded text to add it to your message.'}
        </Text>
      ) : null}
      <GlassSurface
        backgroundColor={tokens.glass}
        borderColor={tokens.glassBorder}
        material="liquid"
        mode={tokens.mode}
        style={[
          rootStyles.composer,
          chatStyles.chatComposer,
          normalChatImageDrafts.length > 0 ? chatStyles.chatComposerWithImages : null,
        ]}
        testID="customer-v21-kael-composer-frame"
        variant="control"
      >
        {normalChatImageDrafts.length > 0 ? (
          <MediaDraftPreviewTray
            busy={composerBusy}
            drafts={composerMediaDrafts}
            language={language}
            onRemove={onRemoveComposerMediaDraft}
            variant="composer-images"
            tokens={tokens}
          />
        ) : null}
        <View style={[
          chatStyles.chatComposerControls,
          normalChatImageDrafts.length > 0
            ? chatStyles.chatComposerControlsFullWidth
            : chatStyles.chatComposerControlsExpanded,
        ]}>
        <Pressable
          accessibilityLabel={canUseComposerMedia
            ? allowVideoSelection
              ? (language === 'vi' ? 'Thêm ảnh hoặc video' : 'Add photo or video')
              : (language === 'vi' ? 'Thêm ảnh' : 'Add photo')
            : (language === 'vi' ? 'Ảnh và video dùng trong Xử lý công việc' : 'Photos and videos are for Work handling')}
          accessibilityRole="button"
          accessibilityState={{ disabled: !mediaPickerEnabled }}
          disabled={!mediaPickerEnabled}
          hitSlop={3}
          onPress={onPickMedia}
          style={({ pressed }) => [
            chatStyles.chatMediaButton,
            {
              borderRadius: 22,
              height: 44,
              width: 44,
            },
            pressed && !reduceMotion ? { transform: [{ scale: 0.96 }] } : null,
          ]}
          testID="customer-v21-kael-media-picker"
        >
          <ChatMediaCameraIcon
            color={mediaPickerEnabled ? activeMediaIconColor : tokens.muted}
            size={27}
            style={!allowVideoSelection ? chatStyles.chatMediaIconOpticallyAligned : undefined}
          />
          {allowVideoSelection && composerMediaDraftCount > 0 ? (
            <View
              style={[chatStyles.chatMediaBadge, { backgroundColor: tokens.primary }]}
              testID="customer-v21-kael-media-count"
            >
              <Text style={[chatStyles.chatMediaBadgeText, { color: tokens.primaryText }]}>
                {composerMediaDraftCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <KaelTextField
          editable={!composerBusy}
          inputRef={inputRef}
          inputShellAdornment={ghost ? (
            <NormalChatGhostOverlay
              draft={draft}
              draftColor={tokens.text}
              language={language}
              onAccept={acceptGhost}
              suggestionColor={tokens.muted}
              suffix={ghost.text}
              textStyle={inputTextStyle}
            />
          ) : undefined}
          inputShellStyle={rootStyles.composerTextFieldShell}
          inputShellTestID="customer-v21-kael-input-shell"
          multiline
          onChange={(event) => {
            const nativeEvent = event.nativeEvent as typeof event.nativeEvent & { composing?: boolean; isComposing?: boolean }
            setIsComposing(Boolean(nativeEvent.isComposing ?? nativeEvent.composing))
          }}
          onBlur={onBlur}
          onChangeText={(nextDraft) => {
            setSelection(null)
            onDraftChange(nextDraft)
          }}
          onContentSizeChange={inputSizing.onContentSizeChange}
          onFocus={onFocus}
          onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
          onSubmitEditing={onSendMessage}
          maxLength={CUSTOMER_KAEL_MESSAGE_MAX_LENGTH}
          placeholder={ghost ? '' : composerPlaceholder}
          placeholderTextColor={tokens.subtleText}
          returnKeyType={inputSizing.returnKeyType}
          selectionColor={isLightNormalChat ? color.kaelChatSend.idleForeground : tokens.primary}
          scrollEnabled={inputSizing.scrollEnabled}
          shellStyle={rootStyles.composerTextFieldStack}
          submitBehavior={inputSizing.submitBehavior}
          style={[...inputTextStyle, { color: ghost ? 'transparent' : tokens.text, zIndex: 1 }]}
          testID="customer-v21-kael-input"
          value={draft}
        />
        {!composerBusy && canSubmit ? (
          // Ready to send: the header's liquid glass control, so the active button reads as the same
          // material as the back button. Empty and Stop keep their own clearer states.
          <LiquidControlButton
            accessibilityLabel={language === 'vi' ? 'Gửi tin nhắn cho Kael' : 'Send message to Kael'}
            accessibilityState={{ busy: false }}
            mode={tokens.mode}
            onPress={onSendMessage}
            size={44}
            style={rootStyles.sendButton}
            testID="customer-v21-kael-send"
          >
            <KaelSendStopGlyph
              arrowColor={tokens.text}
              reduceMotion={reduceMotion}
              stopColor={tokens.text}
              stopping={false}
              testIDPrefix="customer-v21-kael"
            />
          </LiquidControlButton>
        ) : (
          <Pressable
            accessibilityLabel={composerBusy
              ? stopAvailable
                ? (language === 'vi' ? 'Dừng phản hồi' : 'Stop response')
                : (language === 'vi' ? 'Kael đang xử lý' : 'Kael is working')
              : (language === 'vi' ? 'Gửi tin nhắn cho Kael' : 'Send message to Kael')}
            accessibilityRole="button"
            accessibilityState={{ busy: composerBusy, disabled: composerBusy ? !stopAvailable : !canSubmit }}
            disabled={composerBusy ? !stopAvailable : !canSubmit}
            onPress={composerBusy ? onStopMessage : onSendMessage}
            style={({ pressed }) => [
              rootStyles.sendButton,
              {
                alignItems: 'center',
                backgroundColor: isLightNormalChat
                  ? normalSendPalette.background
                  : composerBusy || canSubmit ? activeSendBackground : idleSendBackground,
                borderColor: composerBusy || canSubmit ? activeSendBorder : idleSendBorder,
                borderRadius: 22,
                borderWidth: 1,
                height: 44,
                justifyContent: 'center',
                width: 44,
              },
              pressed && !reduceMotion ? { transform: [{ scale: 0.96 }] } : null,
            ]}
            testID="customer-v21-kael-send"
          >
            <KaelSendStopGlyph
              arrowColor={isLightNormalChat
                ? normalSendPalette.foreground
                : canSubmit ? activeSendForeground : tokens.muted}
              reduceMotion={reduceMotion}
              stopColor={isLightNormalChat ? normalSendPalette.foreground : activeSendForeground}
              stopping={composerBusy && stopAvailable}
              testIDPrefix="customer-v21-kael"
            />
          </Pressable>
        )}
        </View>
      </GlassSurface>
      <Text
        style={[chatStyles.chatComposerDisclaimer, { color: tokens.muted }]}
        testID="customer-v21-kael-chat-disclaimer"
      >
        {language === 'vi'
          ? 'Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.'
          : 'Kael can make mistakes. Check important information.'}
      </Text>
    </>
  )
}
