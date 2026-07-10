import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'

const DOCK_SCROLL_DIRECTION_THRESHOLD = 12
const DOCK_SCROLL_TOP_THRESHOLD = 4

export type DockScrollState = {
  anchorY: number
  collapsed: boolean
}

export function createDockScrollState(): DockScrollState {
  return { anchorY: 0, collapsed: false }
}

export function resolveDockScrollState(previous: DockScrollState, offsetY: number): DockScrollState {
  const nextY = Number.isFinite(offsetY) ? Math.max(0, offsetY) : 0

  if (nextY <= DOCK_SCROLL_TOP_THRESHOLD) {
    return { anchorY: nextY, collapsed: false }
  }

  const deltaY = nextY - previous.anchorY
  if (Math.abs(deltaY) < DOCK_SCROLL_DIRECTION_THRESHOLD) return previous

  return { anchorY: nextY, collapsed: deltaY > 0 }
}

type DockScrollContextValue = {
  collapsed: boolean
  reportScrollOffset: (offsetY: number) => void
  resetDockScroll: () => void
}

const defaultDockScrollContext: DockScrollContextValue = {
  collapsed: false,
  reportScrollOffset: () => undefined,
  resetDockScroll: () => undefined,
}

const DockScrollContext = createContext<DockScrollContextValue>(defaultDockScrollContext)

export function DockScrollStateProvider({ children }: { children: ReactNode }) {
  const stateRef = useRef(createDockScrollState())
  const [collapsed, setCollapsed] = useState(false)

  const reportScrollOffset = useCallback((offsetY: number) => {
    const previous = stateRef.current
    const next = resolveDockScrollState(previous, offsetY)
    stateRef.current = next
    if (next.collapsed !== previous.collapsed) setCollapsed(next.collapsed)
  }, [])

  const resetDockScroll = useCallback(() => {
    stateRef.current = createDockScrollState()
    setCollapsed(false)
  }, [])

  const value = useMemo(() => ({ collapsed, reportScrollOffset, resetDockScroll }), [collapsed, reportScrollOffset, resetDockScroll])

  return <DockScrollContext.Provider value={value}>{children}</DockScrollContext.Provider>
}

export function useDockScrollState() {
  return useContext(DockScrollContext)
}

export function useDockScrollHandler() {
  const { reportScrollOffset } = useDockScrollState()
  return useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    reportScrollOffset(event.nativeEvent.contentOffset.y)
  }, [reportScrollOffset])
}

export function useDockScrollTransform(collapsed: boolean, reduceMotion: boolean) {
  const scale = useSharedValue(1)
  const translateY = useSharedValue(0)

  useEffect(() => {
    const compact = collapsed && !reduceMotion
    scale.value = withTiming(compact ? 0.94 : 1, { duration: 180 })
    translateY.value = withTiming(compact ? 4 : 0, { duration: 180 })
  }, [collapsed, reduceMotion, scale, translateY])

  return useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }))
}
