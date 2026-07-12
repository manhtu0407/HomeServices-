import { Pressable, StyleSheet, Text, View } from 'react-native'
import { entryTheme } from '../theme'
import { ProviderBrandIcon } from './icons'

export function ProviderButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      accessibilityLabel={`Tiếp tục với ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [styles.button, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={styles.mark}><ProviderBrandIcon provider="google" size={18} /></View>
      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={styles.label}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.90)', borderColor: entryTheme.color.surface.stroke, borderRadius: 18, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, height: 46, justifyContent: 'center', minWidth: 0, paddingHorizontal: 6 },
  label: { color: entryTheme.color.text.strong, flexShrink: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  mark: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, height: 22, justifyContent: 'center', width: 22, ...entryTheme.shadow.soft },
  pressed: { opacity: 0.78 },
})
