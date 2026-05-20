import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'
import { useGlassAccessibility } from './accessibility-motion'
import { GlassSurface } from './glass-surface'
import { reduceMotionAwarePressStyle } from './reduce-motion-aware-animation'
import { type GlassMode } from './tokens'

export type FloatingGlassTabItem<Key extends string> = {
  accessibilityLabel?: string
  key: Key
  label?: string
  testID?: string
}

type FloatingGlassTabBarProps<Key extends string, Item extends FloatingGlassTabItem<Key> = FloatingGlassTabItem<Key>> = {
  activeKey: Key
  iconForItem: (item: Item, focused: boolean) => ReactNode
  items: Item[]
  mode?: GlassMode
  onItemPress: (item: Item) => void
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function FloatingGlassTabBar<Key extends string, Item extends FloatingGlassTabItem<Key> = FloatingGlassTabItem<Key>>({
  activeKey,
  iconForItem,
  items,
  mode = 'light',
  onItemPress,
  style,
  testID,
}: FloatingGlassTabBarProps<Key, Item>) {
  const { reduceMotion } = useGlassAccessibility()

  return (
    <GlassSurface mode={mode} style={[styles.bar, style]} testID={testID} variant="nav">
      {items.map((item) => {
        const focused = item.key === activeKey
        const labelColor = focused
          ? mode === 'dark'
            ? '#CFF7EE'
            : '#08786E'
          : mode === 'dark'
            ? '#8FB0AA'
            : '#6B817D'
        return (
          <Pressable
            accessibilityLabel={item.accessibilityLabel ?? item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            key={item.key}
            onPress={() => onItemPress(item)}
            style={({ pressed }) => [
              styles.item,
              focused ? { backgroundColor: mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(216,247,239,0.68)' } : null,
              reduceMotionAwarePressStyle(pressed, reduceMotion),
            ]}
            testID={item.testID}
          >
            {iconForItem(item, focused)}
            {item.label ? (
              <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.label, { color: labelColor }]}>
                {item.label}
              </Text>
            ) : null}
          </Pressable>
        )
      })}
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
    minHeight: 64,
    padding: 6,
  },
  item: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 22,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 52,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
})
