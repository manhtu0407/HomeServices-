import { Image } from 'expo-image'
import { Pressable, Text, type ImageSourcePropType } from 'react-native'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21DockStyles as styles } from './dock-styles'

export function CustomerV21DockTabButton({
  image,
  label,
  onPress,
  selected,
  testID,
  tokens,
}: {
  image: ImageSourcePropType
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
      <Image contentFit="contain" source={image} style={[styles.dockIcon, selected ? styles.dockIconActive : null]} />
      <Text numberOfLines={1} style={[styles.dockLabel, selected ? styles.dockLabelActive : null, { color: selected ? tokens.primary : tokens.muted }]}>{label}</Text>
    </Pressable>
  )
}
