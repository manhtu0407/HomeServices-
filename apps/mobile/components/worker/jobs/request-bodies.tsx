import {
  Pressable,
  StyleSheet,
  Text as RNText,
  type TextProps,
} from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

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
              <Stop offset="0" stopColor="#2DD4BF" />
              <Stop offset="0.28" stopColor="#20CDB9" />
              <Stop offset="0.52" stopColor="#12BCAA" />
              <Stop offset="0.78" stopColor="#069889" />
              <Stop offset="1" stopColor="#008579" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="56" rx="0" fill="url(#worker-v5-accept-confirm-fill)" />
        </Svg>
      ) : null}
      <Text style={styles.acceptConfirmText} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}
