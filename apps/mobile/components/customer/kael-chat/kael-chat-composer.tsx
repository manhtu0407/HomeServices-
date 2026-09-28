import { useState } from 'react'
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

import { GlassSurface } from '@/components/ui/glass-surface'
import { LiquidSendArrowIcon } from '@/components/ui/liquid-back-button'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

import type { CustomerThemeTokens } from '../customer-theme'
import { ChatMediaCameraIcon } from './chat-surfaces'
import { MediaDraftPreviewTray } from './media-draft-preview-tray'
import { customerV21ChatStyles as chatStyles } from './chat-styles'
import { canSubmitCustomerKaelComposer } from './customer-kael-composer-state'
import { CUSTOMER_KAEL_MESSAGE_MAX_LENGTH } from './customer-kael-message-limits'

const COMPOSER_MIN_HEIGHT = 44
const COMPOSER_MAX_HEIGHT = 124

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
  rootStyles,
  stopAvailable = true,
  textInputNoOutlineStyle,
  tokens,
}: {
  allowVideoSelection: boolean
  canUseComposerMedia: boolean
  composerBusy: boolean
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
  rootStyles: RootChatStyles
  /** False while the busy request has no cancellation path; Stop must not claim to cancel it. */
  stopAvailable?: boolean
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const { reduceMotion } = useGlassAccessibility()
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
  const activeSendBackground = tokens.mode === 'light' ? color.mint.white : tokens.primary
  const activeSendBorder = tokens.mode === 'light' ? color.surface.stroke : tokens.borderStrong
  const activeSendForeground = tokens.mode === 'light' ? color.text.strong : tokens.primaryText
  // Measurement survives edits that keep the line count: native fires no new
  // contentSize event for them, and web can fire it before the new draft renders.
  const [measuredInput, setMeasuredInput] = useState({ hasDraft: Boolean(draft), height: COMPOSER_MIN_HEIGHT })
  if (measuredInput.hasDraft !== Boolean(draft)) {
    setMeasuredInput({ hasDraft: Boolean(draft), height: draft ? measuredInput.height : COMPOSER_MIN_HEIGHT })
  }
  const inputHeight = draft ? measuredInput.height : COMPOSER_MIN_HEIGHT
  return (
    <>
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
          <ChatMediaCameraIcon color={mediaPickerEnabled ? activeMediaIconColor : tokens.muted} size={27} />
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
          inputShellStyle={rootStyles.composerTextFieldShell}
          inputShellTestID="customer-v21-kael-input-shell"
          multiline
          onBlur={onBlur}
          onChangeText={onDraftChange}
          onContentSizeChange={(event) => {
            const nextHeight = event.nativeEvent.contentSize.height
            const height = Math.min(Math.max(nextHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT)
            setMeasuredInput((current) => ({ ...current, height }))
          }}
          onFocus={onFocus}
          onSubmitEditing={onSendMessage}
          maxLength={CUSTOMER_KAEL_MESSAGE_MAX_LENGTH}
          placeholder={composerPlaceholder}
          placeholderTextColor={tokens.subtleText}
          returnKeyType="send"
          scrollEnabled={inputHeight >= COMPOSER_MAX_HEIGHT}
          shellStyle={rootStyles.composerTextFieldStack}
          style={[rootStyles.composerInput, { height: inputHeight }, textInputNoOutlineStyle, { color: tokens.text }]}
          testID="customer-v21-kael-input"
          value={draft}
        />
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
              backgroundColor: composerBusy ? activeSendBackground : canSubmit ? activeSendBackground : tokens.glassStrong,
              borderColor: composerBusy || canSubmit ? activeSendBorder : tokens.glassBorder,
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
          {composerBusy && stopAvailable
            ? (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    backgroundColor: activeSendForeground,
                    borderRadius: 2,
                    height: 12,
                    width: 12,
                  }}
                  testID="customer-v21-kael-stop-square"
                />
          </View>
          )
            : <LiquidSendArrowIcon color={canSubmit ? activeSendForeground : tokens.muted} testID="customer-v21-kael-send-arrow" />}
        </Pressable>
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
