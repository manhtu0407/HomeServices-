import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import { motionTokens } from './motion-tokens'

import {
  createDockScrollState,
  resolveDockScrollState,
  type DockScrollState,
} from './dock-scroll-state-model'

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
  const stateRef = useRef<DockScrollState | null>(null)
  if (stateRef.current === null) stateRef.current = createDockScrollState()
  const [collapsed, setCollapsed] = useState(false)

  const reportScrollOffset = useCallback((offsetY: number) => {
    const previous = stateRef.current ?? createDockScrollState()
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
  return use(DockScrollContext)
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
    scale.value = withSpring(compact ? 0.94 : 1, motionTokens.liquid.press)
    translateY.value = withSpring(compact ? 4 : 0, motionTokens.liquid.press)
  }, [collapsed, reduceMotion, scale, translateY])

  return useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }))
}
