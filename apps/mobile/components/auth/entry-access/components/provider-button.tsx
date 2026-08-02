import { Pressable, StyleSheet, Text, View } from 'react-native'
import { entryTheme } from '../theme'
import { type ProviderBrand, ProviderBrandIcon } from './icons'

export function ProviderButton({ accessibilityLabel, disabled, label, onPress, provider, testID }: { accessibilityLabel: string; disabled?: boolean; label: string; onPress: () => void; provider: ProviderBrand; testID: string }) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.button, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
      testID={testID}
    >
      <View style={styles.mark}><ProviderBrandIcon provider={provider} size={20} /></View>
      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={styles.label}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.90)', borderColor: entryTheme.color.surface.stroke, borderRadius: 18, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, height: 52, justifyContent: 'center', minWidth: 0, paddingHorizontal: 8 },
  disabled: { opacity: 0.52 },
  label: { color: entryTheme.color.text.strong, flexShrink: 1, fontSize: 13, fontWeight: '700', letterSpacing: 0, lineHeight: 18 },
  mark: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, height: 26, justifyContent: 'center', width: 26, ...entryTheme.shadow.soft },
  pressed: { opacity: 0.78 },
})
