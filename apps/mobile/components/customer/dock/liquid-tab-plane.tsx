import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PanResponder, Pressable, Text, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'

import { GlassSurface } from '@/components/ui/glass-surface'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import { liquidTabLensTheme } from '@/design/theme'

import type { CustomerThemeTokens } from '../customer-theme'
import {
  CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
  CUSTOMER_LIQUID_NAV_RAIL_PADDING,
  customerV21DockStyles as styles,
} from './dock-styles'
import { LiquidNavFilledIcon, type LiquidNavFilledIconName } from './liquid-nav-filled-icons'
import {
  LIQUID_LENS_LIFT_SCALE,
  liquidLensDragX,
  liquidLensRestX,
  liquidLensStretch,
  liquidTabIndexAt,
  liquidTabWidth,
  type LiquidTabGeometry,
} from './liquid-tab-plane-model'

export type LiquidTabItem<Key extends string> = {
  icon: LiquidNavFilledIconName
  key: Key
  label: string
  testID: string
}

// The glass plane's 1px border plus its rail padding: where the tabs and the lens start.
const LIQUID_TAB_INSET = CUSTOMER_LIQUID_NAV_RAIL_PADDING + 1
const LIQUID_TAB_HEIGHT = CUSTOMER_LIQUID_NAV_DOCK_HEIGHT - LIQUID_TAB_INSET * 2

// Four primary routes on one glass plane with a single selection lens. A finger lifts the lens
// into clear glass, drags it across the tabs, and drops it on release; a tap springs it across.
// Kael is never part of this plane: callers render it as a sibling in the same dock row.
export function LiquidTabPlane<Key extends string>({
  items,
  onSelect,
  reduceMotion,
  reduceTransparency,
  selectedKey,
  testID,
  tokens,
  width,
}: {
  items: readonly LiquidTabItem<Key>[]
  onSelect: (key: Key) => void
  reduceMotion: boolean
  reduceTransparency: boolean
  selectedKey: Key | null
  testID: string
  tokens: CustomerThemeTokens
  width: number
}) {
  const geometry: LiquidTabGeometry = { count: items.length, padding: LIQUID_TAB_INSET, width }
  const tabWidth = liquidTabWidth(geometry)
  const selectedIndex = selectedKey === null ? null : Math.max(items.findIndex((item) => item.key === selectedKey), 0)
  // A released lens rests on its target until the route catches up; any route change ends that.
  const [pending, setPending] = useState<{ index: number; routedIndex: number | null } | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [commit, setCommit] = useState({ count: 0, index: -1 })
  const restIndex = pending && pending.routedIndex === selectedIndex ? pending.index : selectedIndex
  const tintIndex = hoverIndex ?? restIndex
  const lensTheme = liquidTabLensTheme[tokens.mode]

  const lensX = useSharedValue(liquidLensRestX(restIndex ?? 0, geometry))
  const lift = useSharedValue(0)
  const liftScale = useSharedValue(1)
  const stretchX = useSharedValue(1)
  const stretchY = useSharedValue(1)
  const visible = useSharedValue(restIndex === null ? 0 : 1)
  const wrapperRef = useRef<View>(null)
  const frameRef = useRef<{ originX: number; scale: number } | null>(null)
  const pendingTouchRef = useRef<number | null>(null)
  const gestureRef = useRef({ dragging: false, startIndex: 0 })

  const settleTo = (index: number | null, travelTabs: number, velocity: number) => {
    cancelAnimation(lensX)
    cancelAnimation(stretchX)
    cancelAnimation(stretchY)
    lift.value = reduceMotion ? withTiming(0, { duration: motionDuration(120, true) }) : withSpring(0, motionTokens.liquid.press)
    liftScale.value = reduceMotion ? 1 : withSpring(1, motionTokens.liquid.pill)
    visible.value = withTiming(index === null ? 0 : 1, { duration: motionDuration(140, reduceMotion) })
    if (index === null) return
    const target = liquidLensRestX(index, geometry)
    if (reduceMotion) {
      lensX.value = withTiming(target, { duration: motionDuration(160, true) })
      stretchX.value = 1
      stretchY.value = 1
      return
    }
    const { scaleX, scaleY } = liquidLensStretch(travelTabs, velocity)
    lensX.value = withSpring(target, motionTokens.liquid.pill)
    stretchX.value = withSequence(withTiming(scaleX, { duration: 110 }), withSpring(1, motionTokens.liquid.pill))
    stretchY.value = withSequence(withTiming(scaleY, { duration: 110 }), withSpring(1, motionTokens.liquid.pill))
  }


  const toLocalX = (pageX: number) => {
    const frame = frameRef.current
    return frame ? (pageX - frame.originX) / frame.scale : null
  }

  const pressAt = (localX: number) => {
    const index = liquidTabIndexAt(localX, geometry)
    gestureRef.current = { dragging: true, startIndex: restIndex ?? index }
    setHoverIndex(index)
    cancelAnimation(lensX)
    visible.value = 1
    lift.value = reduceMotion ? withTiming(1, { duration: motionDuration(120, true) }) : withSpring(1, motionTokens.liquid.press)
    liftScale.value = reduceMotion ? 1 : withSpring(LIQUID_LENS_LIFT_SCALE, motionTokens.liquid.press)
    lensX.value = reduceMotion
      ? liquidLensRestX(index, geometry)
      : withSpring(liquidLensDragX(localX, geometry), motionTokens.liquid.press)
  }

  const dragTo = (localX: number) => {
    const index = liquidTabIndexAt(localX, geometry)
    setHoverIndex((current) => (current === index ? current : index))
    lensX.value = reduceMotion ? liquidLensRestX(index, geometry) : liquidLensDragX(localX, geometry)
  }

  const release = (localX: number | null, velocity: number) => {
    const { startIndex } = gestureRef.current
    gestureRef.current = { dragging: false, startIndex }
    setHoverIndex(null)
    if (localX === null) {
      settleTo(restIndex, 0, 0)
      return
    }
    const index = liquidTabIndexAt(localX, geometry)
    setPending({ index, routedIndex: selectedIndex })
    setCommit((current) => ({ count: current.count + 1, index }))
    settleTo(index, index - startIndex, velocity)
    onSelect(items[index].key)
  }

  const cancel = () => {
    gestureRef.current = { dragging: false, startIndex: gestureRef.current.startIndex }
    pendingTouchRef.current = null
    setHoverIndex(null)
    settleTo(restIndex, 0, 0)
  }

  // PanResponder keeps its callbacks imperatively, so it talks to a stable delegate whose
  // handlers are replaced after every commit instead of being rebuilt during render.
  const [responder] = useState(() => ({
    cancel: () => undefined as void,
    grant: (_pageX: number) => undefined as void,
    move: (_pageX: number) => undefined as void,
    release: (_pageX: number, _velocity: number) => undefined as void,
    settle: (_index: number | null) => undefined as void,
  }))
  useLayoutEffect(() => {
    Object.assign(responder, {
      cancel,
      grant: (pageX: number) => {
        pendingTouchRef.current = pageX
        frameRef.current = null
        // The dock row scales while the page scrolls, so the plane is measured on every touch.
        wrapperRef.current?.measureInWindow((originX, _y, measuredWidth) => {
          frameRef.current = { originX, scale: width > 0 && measuredWidth > 0 ? measuredWidth / width : 1 }
          const latest = pendingTouchRef.current
          const localX = latest === null ? null : toLocalX(latest)
          if (localX !== null) pressAt(localX)
        })
      },
      move: (pageX: number) => {
        pendingTouchRef.current = pageX
        const localX = toLocalX(pageX)
        if (localX !== null && gestureRef.current.dragging) dragTo(localX)
      },
      release: (pageX: number, velocity: number) => {
        release(toLocalX(pageX), velocity)
        pendingTouchRef.current = null
      },
      settle: (index: number | null) => settleTo(index, 0, 0),
    })
  })

  useEffect(() => {
    if (gestureRef.current.dragging || tabWidth === 0) return
    responder.settle(restIndex)
  }, [responder, restIndex, tabWidth])

  const [panResponder] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderGrant: (_event, gesture) => responder.grant(gesture.x0),
    onPanResponderMove: (_event, gesture) => responder.move(gesture.moveX),
    onPanResponderRelease: (_event, gesture) => responder.release(gesture.moveX || gesture.x0, gesture.vx),
    onPanResponderTerminate: () => responder.cancel(),
    onPanResponderTerminationRequest: () => false,
    onStartShouldSetPanResponderCapture: () => true,
  }))

  const lensStyle = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [
      { translateX: lensX.value },
      { scaleX: stretchX.value * liftScale.value },
      { scaleY: stretchY.value * liftScale.value },
    ],
  }))
  const liftLayerStyle = useAnimatedStyle(() => ({ opacity: reduceTransparency ? 0 : lift.value }), [reduceTransparency])

  return (
    <View
      ref={wrapperRef}
      style={{ height: CUSTOMER_LIQUID_NAV_DOCK_HEIGHT, width }}
      testID={`${testID}-plane`}
      {...panResponder.panHandlers}
    >
      <GlassSurface
        backgroundColor={tokens.glass}
        borderColor={tokens.glassBorder}
        material="liquid"
        mode={tokens.mode}
        style={[styles.dockPlane, { width }]}
        testID={testID}
        variant="nav"
      >
        {null}
      </GlassSurface>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.dockLens,
          {
            backgroundColor: reduceTransparency ? tokens.statusSurface : lensTheme.restFill,
            borderColor: reduceTransparency ? tokens.borderStrong : lensTheme.restBorder,
            height: LIQUID_TAB_HEIGHT,
            top: LIQUID_TAB_INSET,
            width: tabWidth,
          },
          lensStyle,
        ]}
        testID={`${testID}-lens`}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.dockLensLift, { backgroundColor: lensTheme.liftFill, borderColor: lensTheme.liftBorder, boxShadow: lensTheme.liftShadow }, liftLayerStyle]}
        />
      </Animated.View>
      <View pointerEvents="box-none" style={[styles.dockTabs, { height: LIQUID_TAB_HEIGHT, left: LIQUID_TAB_INSET, right: LIQUID_TAB_INSET, top: LIQUID_TAB_INSET }]}>
        {items.map((item, index) => (
          <LiquidTabButton
            bounceToken={commit.index === index ? commit.count : 0}
            icon={item.icon}
            key={item.key}
            label={item.label}
            onPress={() => onSelect(item.key)}
            reduceMotion={reduceMotion}
            selected={selectedIndex === index}
            testID={item.testID}
            tinted={tintIndex === index}
            tokens={tokens}
          />
        ))}
      </View>
    </View>
  )
}

function LiquidTabButton({
  bounceToken,
  icon,
  label,
  onPress,
  reduceMotion,
  selected,
  testID,
  tinted,
  tokens,
}: {
  bounceToken: number
  icon: LiquidNavFilledIconName
  label: string
  onPress: () => void
  reduceMotion: boolean
  selected: boolean
  testID: string
  tinted: boolean
  tokens: CustomerThemeTokens
}) {
  const iconScale = useSharedValue(1)
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }))
  // Apple HIG Materials: labels on glass use the highest-contrast label colour; the accent marks
  // only the selected tab.
  const color = tinted ? tokens.primary : tokens.text

  useEffect(() => {
    if (bounceToken === 0 || reduceMotion) return
    iconScale.value = withSequence(withTiming(1.16, { duration: 110 }), withSpring(1, motionTokens.liquid.pill))
  }, [bounceToken, iconScale, reduceMotion])

  // Touches are owned by the plane's responder; onPress serves screen readers and keyboards.
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.dockItem}
      testID={testID}
    >
      <Animated.View style={iconStyle}>
        <LiquidNavFilledIcon
          color={color}
          name={icon}
          style={[styles.dockIcon, tinted ? styles.dockIconActive : null]}
          testID={`${testID}-icon`}
        />
      </Animated.View>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.82}
        numberOfLines={1}
        style={[styles.dockLabel, tinted ? styles.dockLabelActive : null, { color }]}
      >
        {label}
      </Text>
    </Pressable>
  )
}
