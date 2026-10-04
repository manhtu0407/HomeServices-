import { Text, View, type StyleProp, type TextStyle } from 'react-native'
import type { AppLanguage } from '@/lib/app-language'

export function NormalChatGhostOverlay({
  draft,
  draftColor,
  language,
  onAccept,
  suggestionColor,
  suffix,
  textStyle,
}: {
  draft: string
  draftColor: string
  language: AppLanguage
  onAccept: () => void
  suggestionColor: string
  suffix: string
  textStyle: StyleProp<TextStyle>
}) {
  return (
    <View pointerEvents="box-none" style={{ bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0, zIndex: 2 }} testID="normal-chat-ghost-layer">
      <Text accessible={false} style={[textStyle, { color: 'transparent' }]}>
        <Text style={{ color: draftColor }}>{draft}</Text>
        <Text
          accessibilityHint={language === 'vi'
            ? 'Thêm phần gợi ý vào nội dung tin nhắn có thể chỉnh sửa.'
            : 'Adds the suggested text to the editable message draft.'}
          accessibilityLabel={language === 'vi' ? `Thêm phần gợi ý: ${suffix}` : `Add suggestion: ${suffix}`}
          accessibilityRole="button"
          onPress={onAccept}
          style={{ color: suggestionColor, opacity: 0.72 }}
          testID="normal-chat-ghost-accept"
        >
          {suffix}
        </Text>
      </Text>
    </View>
  )
}
