import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'

import { liquidPopUpMenuTheme } from '@/design/theme'
import type { CustomerThemeTokens } from '@/components/customer/customer-theme'

import { useGlassAccessibility } from './accessibility-motion'
import { GlassSurface } from './glass-surface'
import { motionDuration, motionTokens } from './motion-tokens'

export type LiquidPopUpOption<Value extends string> = { label: string; value: Value }

type Anchor = { height: number; width: number; x: number; y: number }

const MENU_WIDTH = 208
const MENU_ROW_HEIGHT = 44
const MENU_PADDING = 6
const MENU_RADIUS = 22
const CLOSE_MS = 180

// Apple pop-up button (HIG "Pop-up buttons"): a glass capsule showing the current choice. Tapping
// it morphs the button into a Liquid Glass menu of mutually exclusive options ("the button morphs
// into the overlay", WWDC25 284), the current option carries a checkmark (HIG "Menus"), choosing
// closes the menu and the button shows the new value, and a tap anywhere else dismisses it.
export function LiquidPopUpButton<Value extends string>({
  accessibilityHint,
  accessibilityLabel,
  menuAccessibilityLabel,
  onChange,
  options,
  testID,
  tokens,
  value,
}: {
  accessibilityHint: string
  accessibilityLabel: string
  menuAccessibilityLabel: string
  onChange: (value: Value) => void
  options: readonly LiquidPopUpOption<Value>[]
  testID: string
  tokens: CustomerThemeTokens
  value: Value
}) {
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const window = useWindowDimensions()
  const triggerRef = useRef<View>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [open, setOpen] = useState(false)
  const progress = useSharedValue(0)
  const press = useSharedValue(1)
  const theme = liquidPopUpMenuTheme[tokens.mode]
  const current = options.find((option) => option.value === value)?.label ?? ''
  const menuHeight = options.length * MENU_ROW_HEIGHT + MENU_PADDING * 2

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const show = (measured: Anchor | null) => {
    setAnchor(measured)
    setOpen(true)
    progress.value = reduceMotion
      ? withTiming(1, { duration: motionDuration(160, true) })
      : withSpring(1, motionTokens.liquid.pill)
  }

  const openMenu = () => {
    if (open) return
    const node = triggerRef.current
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, width, height) => show({ height, width, x, y }))
    } else {
      show(null)
    }
  }

  const closeMenu = () => {
    progress.value = withTiming(0, { duration: motionDuration(CLOSE_MS, reduceMotion) })
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), motionDuration(CLOSE_MS, reduceMotion))
  }

  const choose = (next: Value) => {
    onChange(next)
    closeMenu()
  }

  // The menu grows out of the trigger's own frame, pinned to its trailing top corner.
  const origin = anchor ?? { height: 32, width: 88, x: window.width - 16 - 88, y: 96 }
  const right = Math.max(window.width - (origin.x + origin.width), 8)
  const top = Math.min(origin.y, window.height - menuHeight - 16)

  const menuStyle = useAnimatedStyle(() => {
    const extrapolate = { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.EXTEND }
    return {
      borderRadius: interpolate(progress.value, [0, 1], [origin.height / 2, MENU_RADIUS], extrapolate),
      height: interpolate(progress.value, [0, 1], [origin.height, menuHeight], extrapolate),
      width: interpolate(progress.value, [0, 1], [origin.width, MENU_WIDTH], extrapolate),
    }
  })
  const menuContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 0.9], [0, 1], Extrapolation.CLAMP),
  }))
  const triggerStyle = useAnimatedStyle(() => ({
    opacity: open ? interpolate(progress.value, [0, 0.2], [1, 0], Extrapolation.CLAMP) : 1,
    transform: [{ scale: press.value }],
  }), [open])

  return (
    <>
      <Animated.View style={triggerStyle}>
        <Pressable
          accessibilityHint={accessibilityHint}
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          onPress={openMenu}
          onPressIn={() => {
            if (!reduceMotion) press.value = withSpring(0.94, motionTokens.liquid.press)
          }}
          onPressOut={() => {
            press.value = reduceMotion ? 1 : withSpring(1, motionTokens.liquid.pill)
          }}
          ref={triggerRef}
          testID={`${testID}-trigger`}
        >
          <GlassSurface
            backgroundColor={tokens.glassStrong}
            borderColor={tokens.glassBorder}
            material="liquid"
            mode={tokens.mode}
            style={styles.trigger}
            variant="control"
          >
            <Text numberOfLines={1} style={[styles.triggerLabel, { color: tokens.text }]}>{current}</Text>
          </GlassSurface>
        </Pressable>
      </Animated.View>
      <Modal animationType="none" onRequestClose={closeMenu} statusBarTranslucent transparent visible={open}>
        <Pressable
          accessibilityLabel={menuAccessibilityLabel}
          onPress={closeMenu}
          style={StyleSheet.absoluteFill}
          testID={`${testID}-dismiss`}
        />
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={closeMenu}
          style={[styles.menu, { boxShadow: reduceTransparency ? undefined : theme.shadow, right, top }, menuStyle]}
          testID={`${testID}-menu`}
        >
          <GlassSurface
            backgroundColor={theme.fallbackFill}
            borderColor={tokens.glassBorder}
            material="liquid"
            mode={tokens.mode}
            nativeUntinted
            style={styles.menuGlass}
            variant="sheet"
          >
            {null}
          </GlassSurface>
          <Animated.View accessibilityLabel={menuAccessibilityLabel} accessibilityRole="menu" style={[styles.menuContent, menuContentStyle]}>
            {options.map((option) => {
              const selected = option.value === value
              return (
                <Pressable
                  accessibilityLabel={option.label}
                  accessibilityRole="menuitem"
                  accessibilityState={{ checked: selected, selected }}
                  key={option.value}
                  onPress={() => choose(option.value)}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.rowPressed }]}
                  testID={`${testID}-${option.value}`}
                >
                  <View style={styles.check}>{selected ? <Checkmark color={tokens.text} /> : null}</View>
                  <Text numberOfLines={1} style={[styles.rowLabel, { color: tokens.text }]}>{option.label}</Text>
                </Pressable>
              )
            })}
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  )
}

function Checkmark({ color }: { color: string }) {
  return (
    <Svg height={14} viewBox="0 0 16 14" width={16}>
      <Path d="M2 7.4 6.1 11.5 14 2.5" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.1} />
    </Svg>
  )
}

const styles = StyleSheet.create({
  check: { alignItems: 'center', justifyContent: 'center', width: 28 },
  menu: { overflow: 'hidden', position: 'absolute' },
  menuContent: { padding: MENU_PADDING },
  menuGlass: { ...StyleSheet.absoluteFill, borderCurve: 'continuous', borderRadius: MENU_RADIUS, borderWidth: 1 },
  row: { alignItems: 'center', borderCurve: 'continuous', borderRadius: 14, flexDirection: 'row', height: MENU_ROW_HEIGHT, paddingRight: 14 },
  rowLabel: { flex: 1, fontSize: 17, lineHeight: 22 },
  trigger: { alignItems: 'center', borderCurve: 'continuous', borderRadius: 16, borderWidth: 1, flexDirection: 'row', height: 32, justifyContent: 'center', paddingHorizontal: 14 },
  triggerLabel: { fontSize: 13, fontWeight: '600', lineHeight: 16 },
})
