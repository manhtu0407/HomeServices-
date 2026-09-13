import {
  ActivityIndicator,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

import { LiquidControlButton, LiquidSendArrowIcon } from '@/components/ui/liquid-back-button'
import { KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { SourceCardSkin } from '../ui/aura-surfaces'
import { ChatComposerAura, ChatMediaCameraIcon } from './chat-surfaces'
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
  canUseComposerMedia,
  composerBusy,
  composerMediaDraftCount,
  composerPlaceholder,
  draft,
  hasVoiceTranscript,
  language,
  onBlur,
  onDraftChange,
  onFocus,
  onPickMedia,
  onSendMessage,
  reduceTransparency,
  rootStyles,
  textInputNoOutlineStyle,
  tokens,
}: {
  canUseComposerMedia: boolean
  composerBusy: boolean
  composerMediaDraftCount: number
  composerPlaceholder: string
  draft: string
  hasVoiceTranscript: boolean
  language: AppLanguage
  onBlur: () => void
  onDraftChange: (value: string) => void
  onFocus: () => void
  onPickMedia: () => void
  onSendMessage: () => void
  reduceTransparency: boolean
  rootStyles: RootChatStyles
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const canSubmit = canSubmitCustomerKaelComposer({
    busy: composerBusy,
    draft,
    mediaDraftCount: canUseComposerMedia ? composerMediaDraftCount : 0,
    voiceTranscript: hasVoiceTranscript ? 'voice' : '',
  })
  return (
    <>
      <View
        style={[
          rootStyles.composer,
          chatStyles.chatComposer,
          { backgroundColor: tokens.raised, borderColor: 'rgba(255,255,255,0.92)' },
        ]}
      >
        <SourceCardSkin />
        <ChatComposerAura reduceTransparency={reduceTransparency} />
        <LiquidControlButton
          accessibilityLabel={canUseComposerMedia
            ? (language === 'vi' ? 'Thêm ảnh hoặc video' : 'Add photo or video')
            : (language === 'vi' ? 'Ảnh và video dùng trong Xử lý công việc' : 'Photos and videos are for Work handling')}
          accessibilityState={{ disabled: composerBusy || !canUseComposerMedia }}
          dimWhenDisabled={false}
          disabled={composerBusy || !canUseComposerMedia}
          hitSlop={3}
          mode={tokens.mode}
          onPress={onPickMedia}
          radius={14}
          size={38}
          style={chatStyles.chatMediaButton}
          testID="customer-v21-kael-media-picker"
        >
          <ChatMediaCameraIcon color={tokens.primary} />
          {composerMediaDraftCount > 0 ? (
            <View
              style={[chatStyles.chatMediaBadge, { backgroundColor: tokens.primary }]}
              testID="customer-v21-kael-media-count"
            >
              <Text style={[chatStyles.chatMediaBadgeText, { color: tokens.primaryText }]}>
                {composerMediaDraftCount}
              </Text>
            </View>
          ) : null}
        </LiquidControlButton>
        <KaelTextField
          editable={!composerBusy}
          inputShellStyle={rootStyles.composerTextFieldShell}
          inputShellTestID="customer-v21-kael-input-shell"
          onBlur={onBlur}
          onChangeText={onDraftChange}
          onFocus={onFocus}
          onSubmitEditing={onSendMessage}
          maxLength={CUSTOMER_KAEL_MESSAGE_MAX_LENGTH}
          placeholder={composerPlaceholder}
          placeholderTextColor={tokens.subtleText}
          returnKeyType="send"
          shellStyle={rootStyles.composerTextFieldStack}
          style={[rootStyles.composerInput, textInputNoOutlineStyle, { color: tokens.text }]}
          testID="customer-v21-kael-input"
          value={draft}
        />
        <LiquidControlButton
          accessibilityLabel={language === 'vi' ? 'Gửi tin nhắn cho Kael' : 'Send message to Kael'}
          accessibilityState={{ busy: composerBusy, disabled: !canSubmit }}
          dimWhenDisabled={false}
          disabled={!canSubmit}
          mode={tokens.mode}
          onPress={onSendMessage}
          size={44}
          style={rootStyles.sendButton}
          testID="customer-v21-kael-send"
        >
          {composerBusy
            ? <ActivityIndicator color={tokens.text} />
            : <LiquidSendArrowIcon color={tokens.text} testID="customer-v21-kael-send-arrow" />}
        </LiquidControlButton>
      </View>
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
