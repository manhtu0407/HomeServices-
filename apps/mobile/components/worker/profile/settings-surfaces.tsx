import {
  Pressable,
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'

import { useWorkerThemeMode } from '../worker-theme'
import { styles } from './settings-styles'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SettingsChoiceRow({
  body,
  onPress,
  selected,
  testID,
  title,
}: {
  body: string
  onPress: () => void
  selected: boolean
  testID: string
  title: string
}) {
  const isDark = useWorkerThemeMode() === 'dark'

  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.choiceRow, isDark ? styles.choiceRowDark : null, selected ? styles.choiceRowSelected : null, selected && isDark ? styles.choiceRowSelectedDark : null, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <View style={styles.choiceCopy}>
        <Text style={[styles.choiceTitle, isDark ? styles.choiceTitleDark : null]}>{title}</Text>
        <Text style={[styles.choiceBody, isDark ? styles.choiceBodyDark : null]}>{body}</Text>
      </View>
      <View style={[styles.choiceMark, isDark ? styles.choiceMarkDark : null, selected ? styles.choiceMarkSelected : null]}>
        {selected ? <View style={styles.choiceMarkDot} /> : null}
      </View>
    </Pressable>
  )
}

export function WorkerV5ReadOnlyToggleList({
  items,
  reduceTransparency,
}: {
  items: readonly { enabled: boolean; label: string; value: string }[]
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.toggleList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-toggle-list">
      {items.map((item, index) => (
        <View key={`${item.label}-${item.value}`} style={styles.toggleRow} testID={`worker-v5-toggle-row-${index}`}>
          <View style={styles.toggleTextColumn}>
            <Text style={styles.toggleLabel} numberOfLines={2} testID={`worker-v5-toggle-label-${index}`}>{item.label}</Text>
            <Text style={styles.toggleValue} numberOfLines={2} testID={`worker-v5-toggle-value-${index}`}>{item.value}</Text>
          </View>
          <View
            accessibilityRole="switch"
            accessibilityState={{ checked: item.enabled, disabled: true }}
            style={[styles.toggleTrack, item.enabled ? styles.toggleTrackOn : null]}
            testID={`worker-v5-toggle-track-${index}`}
          >
            <View style={[styles.toggleKnob, item.enabled ? styles.toggleKnobOn : null]} />
          </View>
        </View>
      ))}
    </View>
  )
}
