import { Pressable, Text } from 'react-native'

import type { CustomerThemeTokens } from '../customer-theme'
import { LiquidNavIcon, type LiquidNavIconName } from './liquid-nav-icons'
import { customerV21DockStyles as styles } from './dock-styles'

export function CustomerV21DockTabButton({
  icon,
  label,
  onPress,
  selected,
  testID,
  tokens,
}: {
  icon: LiquidNavIconName
  label: string
  onPress: () => void
  selected: boolean
  testID: string
  tokens: CustomerThemeTokens
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.dockItem, pressed ? styles.dockItemPressed : null]}
      testID={testID}
    >
      <LiquidNavIcon
        color={selected ? tokens.primary : tokens.muted}
        name={icon}
        selected={selected}
        style={[styles.dockIcon, selected ? styles.dockIconActive : null]}
        testID={`${testID}-icon`}
      />
      <Text numberOfLines={1} style={[styles.dockLabel, selected ? styles.dockLabelActive : null, { color: selected ? tokens.primary : tokens.muted }]}>{label}</Text>
    </Pressable>
  )
}
