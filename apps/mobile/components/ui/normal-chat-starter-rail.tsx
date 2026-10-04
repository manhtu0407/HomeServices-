import { Pressable, ScrollView, Text, type ViewStyle } from 'react-native'

import { getNormalChatStarterSuggestions } from './normal-chat-composer-model'
import type { AppLanguage } from '@/lib/app-language'
import { color, typography } from '@/design/theme'
import type { NormalChatSuggestionRole } from '@nestscout/shared'

export function getNormalChatStarterChipStyle(pressed = false): ViewStyle {
  return {
    alignItems: 'center',
    backgroundColor: color.kaelChatSend.idleBackground,
    borderColor: color.surface.stroke,
    borderRadius: 26,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 156,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: color.brand.primary,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 1,
    opacity: pressed ? 0.84 : 1,
  }
}

export function NormalChatStarterRail({
  actorRole,
  language,
  onSelect,
  visible,
}: {
  actorRole: NormalChatSuggestionRole
  language: AppLanguage
  onSelect: (draft: string) => void
  visible: boolean
}) {
  if (!visible) return null

  const starters = getNormalChatStarterSuggestions(language, actorRole)
  return (
    <ScrollView
      contentContainerStyle={{ alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 2, paddingVertical: 4 }}
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, maxHeight: 64 }}
      testID="normal-chat-starter-section"
    >
      {starters.map((item) => (
        <Pressable
          accessibilityLabel={item.label}
          accessibilityRole="button"
          key={item.id}
          onPress={() => onSelect(item.draft)}
          style={({ pressed }) => getNormalChatStarterChipStyle(pressed)}
          testID={`normal-chat-starter-${item.id}`}
        >
          <Text style={{ color: color.kaelChatSend.idleForeground, ...typography.subheadline, fontWeight: '600', textAlign: 'center' }}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}
