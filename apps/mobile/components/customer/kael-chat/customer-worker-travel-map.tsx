import { typography } from '@/design/theme'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { SvgXml } from 'react-native-svg'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import type { AppLanguage } from '@/lib/app-language'
import type { LocalWorkerTravel } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import {
  buildTravelReadout,
  formatTravelAge,
  formatTravelDistance,
  projectTravel,
  smoothPathData,
  type TravelPoint,
  type TravelProjection,
} from './case-work-travel-model'
import { ROUTE_MAP_BACKDROP, ROUTE_MAP_BACKDROP_HEIGHT, ROUTE_MAP_BACKDROP_WIDTH } from './route-map-backdrop'

// The map is a light mint illustration in both themes. Progress is mint, the road ahead is grey-blue
// dots, the straight line to the building is amber dots, and the building is an amber house.
const INK = '#0B3540'
const MINT = '#0BC39D'
const MINT_CORE = '#12CFA6'
const AHEAD = '#86AAA9'
const AMBER = '#FBBB25'
const GOLD = '#FFB51B'
const TAG_EDGE = '#BFEDEA'
const HOME_TAG = '#FFFCF1'
const HOME_TAG_EDGE = '#F6DC9C'
const PULSE_MS = 2200
const TAG_HEIGHT = 28
const TAG_EDGE_GAP = 6
const MARKER_CLEARANCE = 22
const ROUTE_INSETS = { bottom: 30, left: 28, right: 32, top: 58 }

type Tag = { left: number; top: number; width: number; below: boolean; tailLeft: number }

export function CustomerWorkerTravelMap({
  destinationLabel,
  language,
  now: nowProp,
  reduceMotion: reduceMotionProp,
  tokens,
  travel,
  workerName,
}: {
  destinationLabel: string
  language: AppLanguage
  now?: number
  reduceMotion?: boolean
  tokens: CustomerThemeTokens
  travel: LocalWorkerTravel
  workerName: string | null
}) {
  const vi = language === 'vi'
  const accessibility = useGlassAccessibility()
  const reduceMotion = reduceMotionProp ?? accessibility.reduceMotion
  const [width, setWidth] = useState(0)
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    if (nowProp !== undefined) return
    const timer = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [nowProp])
  const now = nowProp ?? tick
  const readout = useMemo(() => buildTravelReadout(travel, now, language), [language, now, travel])
  const height = Math.round((width * ROUTE_MAP_BACKDROP_HEIGHT) / ROUTE_MAP_BACKDROP_WIDTH)
  const projection = useMemo(
    () => (width > 0 ? projectTravel(travel, width, height, ROUTE_INSETS) : null),
    [height, travel, width],
  )
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))

  const remaining = formatTravelDistance(readout.remainingMeters, language)
  const traveled = formatTravelDistance(readout.traveledMeters, language)
  const total = formatTravelDistance(readout.totalMeters, language)
  const bird = formatTravelDistance(readout.birdMeters, language)
  const age = formatTravelAge(readout.ageSeconds, language)
  const workerTag = workerName ?? (vi ? 'Thợ' : 'Worker')
  const mapLabel = vi
    ? `Thợ còn ${remaining} đường đi, chim bay ${bird}, vị trí cập nhật ${age}`
    : `The worker is ${remaining} by road, ${bird} direct, position updated ${age}`

  const xml = useMemo(
    () => (projection ? buildMapXml(width, height, projection, readout.stale) : null),
    [height, projection, readout.stale, width],
  )
  const tags = useMemo(
    () => (projection
      ? placeTags(
          [
            { at: projection.worker, label: workerTag },
            { at: projection.destination, label: destinationLabel },
          ],
          { height, width },
        )
      : []),
    [destinationLabel, height, projection, width, workerTag],
  )

  return (
    <View style={styles.root} testID="customer-v21-worker-travel">
      <View accessibilityLabel={mapLabel} accessibilityRole="image" onLayout={onLayout} style={[styles.canvas, { height: height || undefined }]} testID="customer-v21-worker-travel-map">
        {xml && projection ? (
          <>
            <SvgXml height={height} width={width} xml={xml} />
            {readout.stale ? null : <WorkerPulse at={projection.worker} reduceMotion={reduceMotion} />}
            {tags[0] ? <MapTag home={false} label={workerTag} tag={tags[0]} /> : null}
            {tags[1] ? <MapTag home label={destinationLabel} tag={tags[1]} /> : null}
          </>
        ) : null}
      </View>

      <View style={styles.readout}>
        <View style={styles.readoutRow}>
          <View style={styles.readoutMain}>
            <Text style={[styles.eta, { color: tokens.text }]} testID="customer-v21-worker-travel-eta">
              {readout.stale
                ? (vi ? 'Đang chờ vị trí mới' : 'Waiting for a new position')
                : (vi ? `${readout.minutesLeft} phút` : `${readout.minutesLeft} min`)}
            </Text>
            <Text style={[styles.caption, { color: tokens.muted }]}>
              {readout.arrivalClock
                ? (vi ? `Dự kiến đến lúc ${readout.arrivalClock}` : `Expected at ${readout.arrivalClock}`)
                : (vi ? `Vị trí cuối ${age}. Giờ đến chỉ tính khi có vị trí mới` : `Last position ${age}. Arrival time needs a fresh position`)}
            </Text>
          </View>
          <View style={styles.readoutSide}>
            <Text style={[styles.distance, { color: tokens.text }]} testID="customer-v21-worker-travel-remaining">{remaining}</Text>
            <Text style={[styles.caption, { color: tokens.muted }]}>{vi ? 'còn lại' : 'to go'}</Text>
          </View>
        </View>
        <View style={[styles.track, { backgroundColor: tokens.border }]}>
          <View style={[styles.fill, { backgroundColor: tokens.primary, width: `${Math.round(readout.progress * 100)}%` }]} />
        </View>
        <Text style={[styles.caption, styles.sum, { color: tokens.muted }]} testID="customer-v21-worker-travel-sum">
          {vi
            ? `Đã đi ${traveled} + còn lại ${remaining} = ${total}`
            : `Driven ${traveled} + ahead ${remaining} = ${total}`}
        </Text>
      </View>
    </View>
  )
}

const f = (value: number) => value.toFixed(1)
const circle = (at: TravelPoint, radius: number, attributes: string) => `<circle cx="${f(at.x)}" cy="${f(at.y)}" r="${radius}" ${attributes}/>`

// The picture scaled to the card, then the trip on top in pixel sizes, so the line, the dots and the
// markers keep a readable weight whatever the card width.
function buildMapXml(width: number, height: number, projection: TravelProjection, stale: boolean) {
  const scale = width / ROUTE_MAP_BACKDROP_WIDTH
  const done = smoothPathData(projection.traveledPath)
  const ahead = smoothPathData(projection.remainingPath)
  const { destination, origin, worker } = projection
  const stroke = (d: string, color: string, size: number, extra: string) =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${size}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<g transform="scale(${scale.toFixed(5)})">${ROUTE_MAP_BACKDROP}</g>
<g id="CompletedRoute">${[
    stroke(done, '#0BCFA5', 24, 'opacity=".11"'),
    stroke(done, '#0BCCA0', 16, 'opacity=".14"'),
    stroke(done, '#0ACB9F', 11, 'opacity=".13"'),
    stroke(done, '#40F1CD', 8.5, 'opacity=".35"'),
    stroke(done, '#FFFFFF', 7, 'opacity=".9"'),
    stroke(done, MINT_CORE, 4.2, ''),
  ].join('')}</g>
<g id="RemainingRoute">${stroke(ahead, AHEAD, 5, 'stroke-dasharray="0.1 9.5" opacity=".92"')}</g>
<g id="BirdFlightRoute"><path d="M${f(worker.x)} ${f(worker.y)} L${f(destination.x)} ${f(destination.y)}" fill="none" stroke="${AMBER}" stroke-width="5" stroke-dasharray="0.1 10.5" stroke-linecap="round" opacity=".95"/></g>
<g id="StartMarker">${circle(origin, 14, 'fill="#A3F4DD" opacity=".14"')}${circle(origin, 10, 'fill="#FFFFFF"')}${circle(origin, 6.5, `fill="${MINT}"`)}</g>
<g id="CurrentMarker">${stale ? '' : circle(worker, 30, 'fill="#1DCCAB" opacity=".07"') + circle(worker, 22, 'fill="#1DCCAB" opacity=".1"')}${circle(worker, 17, `fill="#1DCCAB" opacity="${stale ? 0.06 : 0.14}"`)}${circle(worker, 12.5, 'fill="#FFFFFF"')}${circle(worker, 8.5, `fill="${stale ? AHEAD : '#0ABE97'}"`)}${circle({ x: worker.x - 3, y: worker.y - 3 }, 3, 'fill="#6BEBD2" opacity=".3"')}</g>
<g id="DestinationMarker">${circle(destination, 26, 'fill="#FFBF27" opacity=".08"')}${circle(destination, 21, 'fill="#FFBF27" opacity=".14"')}${circle(destination, 17, 'fill="#FFFFFF"')}${circle(destination, 13.5, `fill="${GOLD}"`)}<g transform="translate(${f(destination.x)} ${f(destination.y)}) scale(.36)"><path d="M-17 -1 L0 -18 L17 -1 L13 -1 L13 16 L6 16 L6 4 L-6 4 L-6 16 L-13 16 L-13 -1 Z" fill="#FFFFFF"/></g></g>
</svg>`
}

type TagItem = { at: TravelPoint; label: string }

// Name tags over the markers. Each tries above, then below, and takes the first spot that stays inside
// the card and clear of the markers and the other tag.
function placeTags(items: TagItem[], bounds: { height: number; width: number }): Tag[] {
  const obstacles = items.map(({ at }) => ({ height: MARKER_CLEARANCE * 2, left: at.x - MARKER_CLEARANCE, top: at.y - MARKER_CLEARANCE, width: MARKER_CLEARANCE * 2 }))
  const placed: Tag[] = []
  const clash = (rect: { left: number; top: number; width: number }) =>
    [...obstacles, ...placed.map((tag) => ({ height: TAG_HEIGHT, left: tag.left, top: tag.top, width: tag.width }))].some((other) =>
      rect.left < other.left + other.width && rect.left + rect.width > other.left &&
      rect.top < other.top + other.height && rect.top + TAG_HEIGHT > other.top)
  for (const { at, label } of items) {
    const width = Math.min(172, Math.max(72, label.length * 7.4 + 26))
    const left = Math.min(Math.max(at.x - width / 2, TAG_EDGE_GAP), bounds.width - width - TAG_EDGE_GAP)
    const candidates = [
      { below: false, left, top: at.y - MARKER_CLEARANCE - TAG_HEIGHT - 4 },
      { below: true, left, top: at.y + MARKER_CLEARANCE + 4 },
      { below: false, left: Math.min(Math.max(at.x - width - 6, TAG_EDGE_GAP), bounds.width - width - TAG_EDGE_GAP), top: at.y - TAG_HEIGHT / 2 },
      { below: false, left: Math.min(Math.max(at.x + 6, TAG_EDGE_GAP), bounds.width - width - TAG_EDGE_GAP), top: at.y - TAG_HEIGHT / 2 },
    ]
    const choice = candidates.find((c) => c.top >= TAG_EDGE_GAP && c.top + TAG_HEIGHT <= bounds.height - TAG_EDGE_GAP && !clash({ ...c, width })) ?? candidates[0]
    placed.push({ ...choice, tailLeft: Math.min(Math.max(at.x - choice.left - 5, 14), width - 24), width })
  }
  return placed
}

function MapTag({ home, label, tag }: { home: boolean; label: string; tag: Tag }) {
  const fill = home ? HOME_TAG : '#FFFFFF'
  const edge = home ? HOME_TAG_EDGE : TAG_EDGE
  return (
    <View pointerEvents="none" style={[styles.tag, { backgroundColor: fill, borderColor: edge, left: tag.left, top: tag.top, width: tag.width }]}>
      <Text numberOfLines={1} style={styles.tagText}>{label}</Text>
      <View
        style={[
          styles.tail,
          { backgroundColor: fill, borderColor: edge, left: tag.tailLeft },
          tag.below ? styles.tailTop : styles.tailBottom,
        ]}
      />
    </View>
  )
}

// One ring that swells and fades around the worker. A single timing restarted from its own callback,
// because Animated.loop does not restart on web.
function WorkerPulse({ at, reduceMotion }: { at: TravelPoint; reduceMotion: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduceMotion) return
    let live = true
    const run = () => {
      pulse.setValue(0)
      Animated.timing(pulse, { duration: PULSE_MS, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }).start(({ finished }) => {
        if (finished && live) run()
      })
    }
    run()
    return () => {
      live = false
      pulse.stopAnimation()
    }
  }, [pulse, reduceMotion])
  if (reduceMotion) return null
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: at.x - 22,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          top: at.y - 22,
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1.5] }) }],
        },
      ]}
    />
  )
}

const shadow = { shadowColor: '#5BBFAE', shadowOffset: { height: 3, width: 0 }, shadowOpacity: 0.18, shadowRadius: 8 } as const

const styles = StyleSheet.create({
  canvas: { backgroundColor: '#EDF9F5', borderColor: '#EAF7F4', borderRadius: 22, borderWidth: 1, overflow: 'hidden', width: '100%' },
  caption: { ...typography.footnote },
  distance: { ...typography.headline, fontVariant: ['tabular-nums'] },
  eta: { ...typography.title3, fontWeight: '600' },
  fill: { borderRadius: 3, height: 6 },
  readout: { gap: 10 },
  readoutMain: { flexShrink: 1, gap: 2 },
  readoutRow: { alignItems: 'flex-end', columnGap: 16, flexDirection: 'row', justifyContent: 'space-between' },
  readoutSide: { alignItems: 'flex-end', flexShrink: 0, gap: 2 },
  ring: { backgroundColor: 'rgba(29,204,171,0.4)', borderRadius: 22, height: 44, position: 'absolute', width: 44 },
  root: { gap: 14 },
  sum: { fontVariant: ['tabular-nums'] },
  tag: {
    ...shadow,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: TAG_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 8,
    position: 'absolute',
  },
  tagText: { ...typography.caption1, color: INK, fontWeight: '600', textAlign: 'center' },
  tail: { height: 10, position: 'absolute', transform: [{ rotate: '45deg' }], width: 10 },
  tailBottom: { borderBottomWidth: 1, borderRightWidth: 1, bottom: -6 },
  tailTop: { borderLeftWidth: 1, borderTopWidth: 1, top: -6 },
  track: { borderRadius: 3, height: 6, overflow: 'hidden' },
})
