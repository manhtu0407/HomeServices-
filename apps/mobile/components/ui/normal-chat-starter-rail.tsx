import { ScrollView, StyleSheet, Text } from 'react-native'

import { getNormalChatStarterSuggestions } from './normal-chat-composer-model'
import { LiquidPillButton } from './liquid-pill-button'
import type { GlassMode } from './tokens'
import type { AppLanguage } from '@/lib/app-language'
import { color, typography } from '@/design/theme'
import type { NormalChatSuggestionRole } from '@nestscout/shared'

export type NormalChatStarterColors = {
  opaqueBackground: string
  opaqueBorder: string
  text: string
}

const LIGHT_STARTER_COLORS: NormalChatStarterColors = {
  opaqueBackground: color.surface.soft,
  opaqueBorder: color.surface.stroke,
  text: color.text.primary,
}

// Starter chips use the header pill material, so they follow the screen theme instead of a fixed
// light mint fill that stayed bright in dark mode.
export function NormalChatStarterRail({
  actorRole,
  colors = LIGHT_STARTER_COLORS,
  language,
  mode = 'light',
  onSelect,
  visible,
}: {
  actorRole: NormalChatSuggestionRole
  colors?: NormalChatStarterColors
  language: AppLanguage
  mode?: GlassMode
  onSelect: (draft: string) => void
  visible: boolean
}) {
  if (!visible) return null

  const starters = getNormalChatStarterSuggestions(language, actorRole)
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      style={styles.rail}
      testID="normal-chat-starter-section"
    >
      {starters.map((item) => (
        <LiquidPillButton
          accessibilityLabel={item.label}
          key={item.id}
          mode={mode}
          onPress={() => onSelect(item.draft)}
          opaqueBackgroundColor={colors.opaqueBackground}
          opaqueBorderColor={colors.opaqueBorder}
          style={styles.chip}
          testID={`normal-chat-starter-${item.id}`}
        >
          <Text numberOfLines={1} style={[styles.label, { color: colors.text }]}>
            {item.label}
          </Text>
        </LiquidPillButton>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  chip: { minWidth: 140 },
  content: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 2, paddingVertical: 10 },
  label: { ...typography.callout, fontWeight: '700', paddingHorizontal: 18, textAlign: 'center' },
  rail: { flexGrow: 0, maxHeight: 64 },
})
