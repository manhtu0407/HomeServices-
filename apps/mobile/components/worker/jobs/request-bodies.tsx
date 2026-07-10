import {
  Pressable,
  StyleSheet,
  Text as RNText,
  type TextProps,
} from 'react-native'
import Svg, { Defs, LinearGradient, Rect } from 'react-native-svg'

import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { styles } from './request-body-styles'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5AcceptConfirmButton({
  disabled,
  label,
  onPress,
  reduceTransparency,
}: {
  disabled: boolean
  label: string
  onPress: () => void
  reduceTransparency: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.acceptConfirmButton,
        reduceTransparency && styles.primaryActionButtonSource,
        disabled && styles.acceptConfirmDisabled,
        pressed && !disabled ? styles.pressed : null,
      ]}
      testID="worker-v5-accept-confirm-action"
    >
      {!reduceTransparency ? (
        <Svg
          pointerEvents="none"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
          testID="worker-v5-accept-confirm-formula-fill"
          viewBox="0 0 100 56"
        >
          <Defs>
            <LinearGradient id="worker-v5-accept-confirm-fill" x1="0" x2="1" y1="0" y2="0">
              <Stop offset="0" stopColor="#31D7C2" />
              <Stop offset="0.48" stopColor="#09B29E" />
              <Stop offset="1" stopColor="#077C72" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="56" rx="0" fill="url(#worker-v5-accept-confirm-fill)" />
        </Svg>
      ) : null}
      <Text style={styles.acceptConfirmText} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}
