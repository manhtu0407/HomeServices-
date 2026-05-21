import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
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
      <View pointerEvents="none" style={styles.hiddenMarker} testID="liquid-toolbar-selection" />
      <View pointerEvents="none" style={styles.hiddenMarker} testID="toolbar-active-pill-icon-label" />
      <View pointerEvents="none" style={styles.hiddenMarker} testID="toolbar-inactive-compact-icon-label" />
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
              focused ? styles.itemFocused : null,
              reduceMotionAwarePressStyle(pressed, reduceMotion),
            ]}
            testID={item.testID}
          >
            {focused && !reduceMotion ? (
              <View
                pointerEvents="none"
                style={[
                  styles.liquidPill,
                  {
                    backgroundColor: mode === 'dark' ? 'rgba(105,222,198,0.16)' : 'rgba(193,255,241,0.64)',
                    borderColor: mode === 'dark' ? 'rgba(105,222,198,0.22)' : 'rgba(8,120,110,0.12)',
                  },
                ]}
              >
                <View style={[styles.liquidCore, { backgroundColor: mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(68,232,204,0.30)' }]} />
                <View style={[styles.liquidSheen, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.52)' }]} />
              </View>
            ) : null}
            {iconForItem(item, focused)}
            {item.label ? (
              <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.label, focused ? styles.labelFocused : styles.labelInactive, { color: labelColor }]}>
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
    position: 'relative',
  },
  hiddenMarker: { height: 0, opacity: 0, position: 'absolute', width: 0 },
  item: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 22,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 52,
    position: 'relative',
    zIndex: 2,
  },
  itemFocused: {
    transform: [{ translateY: -1 }],
  },
  label: {
    fontWeight: '700',
    lineHeight: 13,
  },
  labelFocused: {
    fontSize: 11,
    opacity: 1,
  },
  labelInactive: {
    fontSize: 10,
    opacity: 0.72,
  },
  liquidCore: {
    borderRadius: 999,
    height: 42,
    opacity: 0.74,
    position: 'absolute',
    right: 7,
    top: 4,
    width: 42,
  },
  liquidPill: {
    borderCurve: 'continuous',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  liquidSheen: {
    borderRadius: 999,
    height: 18,
    left: 12,
    opacity: 0.46,
    position: 'absolute',
    right: 16,
    top: 6,
  },
})
