import { StyleSheet, Text } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { typography } from '@/design/theme'

import { LiquidPillButton } from './liquid-pill-button'
import type { GlassMode } from './tokens'

// "New conversation" at the top of the Kael session menu, for Customer and Worker alike: the header
// pill material, a little larger than a list row so it reads as the primary action, and inset inside
// the menu frame rather than bleeding to its edges.
export function KaelSessionNewButton({
  accentColor,
  disabled,
  label,
  mode,
  onPress,
  opaqueBackgroundColor,
  opaqueBorderColor,
  testIDPrefix,
}: {
  accentColor: string
  disabled: boolean
  label: string
  mode: GlassMode
  onPress: () => void
  opaqueBackgroundColor: string
  opaqueBorderColor: string
  testIDPrefix: string
}) {
  return (
    <LiquidPillButton
      accessibilityLabel={label}
      disabled={disabled}
      height={48}
      mode={mode}
      onPress={onPress}
      opaqueBackgroundColor={opaqueBackgroundColor}
      opaqueBorderColor={opaqueBorderColor}
      style={[styles.frame, disabled ? styles.disabled : null]}
      testID={`${testIDPrefix}-session-new`}
    >
      <Svg height={20} testID={`${testIDPrefix}-session-new-plus`} viewBox="0 0 24 24" width={20}>
        <Path d="M12 5.5v13M5.5 12h13" fill="none" stroke={accentColor} strokeLinecap="round" strokeWidth={2.2} />
      </Svg>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        numberOfLines={1}
        style={[styles.label, { color: accentColor }]}
        testID={`${testIDPrefix}-session-new-label`}
      >
        {label}
      </Text>
    </LiquidPillButton>
  )
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.48 },
  frame: { alignSelf: 'stretch' },
  // 14pt bold keeps the full label inside the menu's fixed 208pt width; native also shrinks to fit.
  label: { ...typography.subheadline, flexShrink: 1, fontSize: 14, fontWeight: '700', lineHeight: 19 },
})
