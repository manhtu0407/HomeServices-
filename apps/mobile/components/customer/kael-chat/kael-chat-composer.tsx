import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

import { KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { SourceCardSkin } from '../ui/aura-surfaces'
import { ChatComposerAura, ChatMediaCameraIcon } from './chat-surfaces'
import { customerV21ChatStyles as chatStyles } from './chat-styles'

export type RootChatStyles = {
  bodyText: StyleProp<TextStyle>
  composer: StyleProp<ViewStyle>
  composerInput: StyleProp<TextStyle>
  composerTextFieldShell: StyleProp<ViewStyle>
  composerTextFieldStack: StyleProp<ViewStyle>
  errorText: StyleProp<TextStyle>
  flex: StyleProp<ViewStyle>
  sendButton: StyleProp<ViewStyle>
  sendText: StyleProp<TextStyle>
}

export function KaelChatComposer({
  canUseComposerMedia,
  composerBusy,
  composerMediaDraftCount,
  composerPlaceholder,
  draft,
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
        <Pressable
          accessibilityLabel={language === 'vi' ? 'Thêm ảnh hoặc video' : 'Add photo or video'}
          accessibilityRole="button"
          accessibilityState={{ disabled: composerBusy || !canUseComposerMedia }}
          disabled={composerBusy || !canUseComposerMedia}
          onPress={onPickMedia}
          style={[
            chatStyles.chatMediaButton,
            !canUseComposerMedia ? chatStyles.chatMediaButtonDisabled : null,
            { backgroundColor: tokens.service, borderColor: tokens.border },
          ]}
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
        </Pressable>
        <KaelTextField
          editable={!composerBusy}
          inputShellStyle={rootStyles.composerTextFieldShell}
          onBlur={onBlur}
          onChangeText={onDraftChange}
          onFocus={onFocus}
          onSubmitEditing={onSendMessage}
          placeholder={composerPlaceholder}
          placeholderTextColor={tokens.subtleText}
          returnKeyType="send"
          shellStyle={rootStyles.composerTextFieldStack}
          style={[rootStyles.composerInput, textInputNoOutlineStyle, { color: tokens.text }]}
          testID="customer-v21-kael-input"
          value={draft}
        />
        <Pressable
          accessibilityLabel={language === 'vi' ? 'Gửi tin nhắn cho Kael' : 'Send message to Kael'}
          accessibilityRole="button"
          accessibilityState={{ busy: composerBusy, disabled: composerBusy }}
          disabled={composerBusy}
          onPress={onSendMessage}
          style={[rootStyles.sendButton, { backgroundColor: tokens.primary }]}
          testID="customer-v21-kael-send"
        >
          {composerBusy
            ? <ActivityIndicator color={tokens.primaryText} />
            : <Text style={[rootStyles.sendText, { color: tokens.primaryText }]}>↑</Text>}
        </Pressable>
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
