import { useCallback, useMemo, useRef, useState } from 'react'
import { PanResponder, type LayoutChangeEvent } from 'react-native'

export const MAP_MIN_ZOOM = 1
export const MAP_MAX_ZOOM = 3
export const MAP_ZOOM_STEP = 1.5

type Offset = { x: number; y: number }
type Size = { height: number; width: number }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** Zoom and pan of the route map image; zoom 1 is the whole route and the image never leaves the frame. */
export function useStageFourMapViewport() {
  const [scale, setScale] = useState(MAP_MIN_ZOOM)
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  const live = useRef({ offset: { x: 0, y: 0 } as Offset, scale: MAP_MIN_ZOOM, size: { height: 0, width: 0 } as Size })
  const panStart = useRef<Offset>({ x: 0, y: 0 })

  const fit = useCallback((next: Offset, nextScale: number): Offset => {
    const { size } = live.current
    const limitX = ((nextScale - 1) * size.width) / 2
    const limitY = ((nextScale - 1) * size.height) / 2
    return { x: clamp(next.x, -limitX, limitX), y: clamp(next.y, -limitY, limitY) }
  }, [])

  const apply = useCallback((nextScale: number, nextOffset: Offset) => {
    const fitted = fit(nextOffset, nextScale)
    live.current.scale = nextScale
    live.current.offset = fitted
    setScale(nextScale)
    setOffset(fitted)
  }, [fit])

  const zoomBy = useCallback((factor: number) => {
    const nextScale = clamp(live.current.scale * factor, MAP_MIN_ZOOM, MAP_MAX_ZOOM)
    apply(nextScale, live.current.offset)
  }, [apply])

  const panHandlers = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => live.current.scale > MAP_MIN_ZOOM && (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3),
    onPanResponderGrant: () => { panStart.current = live.current.offset },
    onPanResponderMove: (_event, gesture) => apply(live.current.scale, { x: panStart.current.x + gesture.dx, y: panStart.current.y + gesture.dy }),
    onPanResponderTerminationRequest: () => false,
  }).panHandlers, [apply])

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    live.current.size = { height: event.nativeEvent.layout.height, width: event.nativeEvent.layout.width }
  }, [])

  return {
    canZoomIn: scale < MAP_MAX_ZOOM - 0.001,
    canZoomOut: scale > MAP_MIN_ZOOM + 0.001,
    isMoved: scale > MAP_MIN_ZOOM + 0.001 || offset.x !== 0 || offset.y !== 0,
    offset,
    onLayout,
    panHandlers,
    reset: () => apply(MAP_MIN_ZOOM, { x: 0, y: 0 }),
    scale,
    zoomIn: () => zoomBy(MAP_ZOOM_STEP),
    zoomOut: () => zoomBy(1 / MAP_ZOOM_STEP),
  }
}

export type StageFourMapViewport = ReturnType<typeof useStageFourMapViewport>
