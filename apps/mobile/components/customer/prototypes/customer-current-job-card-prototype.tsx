import { Image } from 'expo-image'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

import { typography } from '@/design/theme'

import { customerV21HomeV4Assets } from '../ui/assets'
import { useCustomerV21SurfaceTheme, V21Screen } from '../ui/shared-surfaces'

const DESIGN_WIDTH = 829
const DESIGN_HEIGHT = 132
const WIDE_REFERENCE_CARD_WIDTH = 844
const LINE_WIDTH: Record<number, number> = { 1: 0, 2: 82, 3: 164, 4: 218 }

export function CustomerCurrentJobCardPrototype() {
  const { width: viewportWidth } = useWindowDimensions()
  const { tokens } = useCustomerV21SurfaceTheme()
  const wideReference = viewportWidth >= 680
  const cardWidth = wideReference
    ? Math.min(Math.max(viewportWidth - 50, 280), WIDE_REFERENCE_CARD_WIDTH)
    : Math.min(Math.max(viewportWidth - 48, 280), DESIGN_WIDTH)
  const scale = cardWidth / DESIGN_WIDTH
  const q = (size: number) => size * scale
  const step = 2

  return (
    <V21Screen screenId="2.1-home" testID="customer-current-job-card-prototype">
      <View
        accessibilityLabel="Vệ sinh nhà. Thợ đã nhận. Bước 2 trên 4. Hôm nay, 14:00. Thời gian dự kiến: 2 – 3 giờ"
        style={[styles.card, wideReference ? styles.wideCard : null, { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: 'rgba(190,218,214,0.74)', borderRadius: q(28), height: q(DESIGN_HEIGHT), width: cardWidth }]}
        testID="customer-current-job-card-prototype-card"
      >
        <View style={[styles.asset, { backgroundColor: '#FFFFFF', borderColor: '#D7E7E4', borderRadius: q(20), height: q(82), left: q(27), top: q(9), width: q(82) }]}>
          <Image accessible={false} contentFit="contain" source={customerV21HomeV4Assets.currentJob.home_cleaning} style={{ height: q(76), width: q(57) }} />
        </View>

        <View style={[styles.copy, { left: q(132), top: q(24) }]}>
          <Text style={[styles.service, { color: tokens.text, fontSize: q(23), lineHeight: q(28) }]}>Vệ sinh nhà</Text>
          <Text style={[styles.caseCode, { color: '#657B83', fontSize: q(18), lineHeight: q(22), marginTop: q(3) }]}>#MOH-260052</Text>
        </View>

        <View style={[styles.status, { backgroundColor: '#DDF7F3', borderRadius: q(22), left: q(343), minHeight: q(43), minWidth: q(132), paddingHorizontal: q(18), top: q(27) }]}>
          <Text style={[styles.statusText, { color: '#10AA9F', fontSize: q(17), lineHeight: q(22) }]}>Thợ đã nhận</Text>
        </View>

        <View accessibilityLabel="Bước 2 trên 4" style={[styles.progress, { height: q(51), left: q(527), top: q(22), width: q(258) }]}>
          <View style={[styles.progressTrack, { backgroundColor: '#D6E4E2', height: q(3), left: q(20), right: q(20), top: q(24) }]} />
          <View style={[styles.progressFill, { backgroundColor: '#10AA9F', height: q(3), left: q(20), top: q(24), width: q(LINE_WIDTH[step]) }]} />
          {[1, 2, 3, 4].map((number) => {
            const active = number <= step
            return (
              <View key={number} style={[styles.progressNode, { backgroundColor: active ? '#10AA9F' : '#FFFFFF', borderColor: active ? '#10AA9F' : '#C8D9D7', borderRadius: q(21), borderWidth: active ? 0 : q(2), height: q(41), width: q(41) }]}>
                <Text style={[styles.progressNodeText, { color: active ? '#FFFFFF' : '#71858C', fontSize: q(17), lineHeight: q(22) }]}>{number}</Text>
              </View>
            )
          })}
        </View>

        <View style={[styles.meta, { backgroundColor: '#F7FBFA', borderColor: '#E0ECEA', borderRadius: q(17), bottom: q(11), height: q(34), left: q(132), paddingHorizontal: q(18), right: q(30) }]}>
          <View style={[styles.metaItem, { gap: q(10) }]}>
            <CalendarIcon color="#6A8088" size={q(17)} />
            <Text adjustsFontSizeToFit minimumFontScale={0.62} numberOfLines={1} style={[styles.metaText, { color: '#6A8088', fontSize: q(15), lineHeight: q(18) }]}>Hôm nay, 14:00</Text>
          </View>
          <View style={[styles.metaDivider, { backgroundColor: '#D9E6E4', height: q(18), marginLeft: q(12) }]} />
          <View style={[styles.metaItem, { gap: q(10), marginLeft: q(18) }]}>
            <ClockIcon color="#6A8088" size={q(17)} />
            <Text adjustsFontSizeToFit minimumFontScale={0.62} numberOfLines={1} style={[styles.metaText, { color: '#6A8088', fontSize: q(15), lineHeight: q(18) }]}>Thời gian dự kiến: 2 – 3 giờ</Text>
          </View>
        </View>
      </View>
    </V21Screen>
  )
}

function CalendarIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Path d="M5.2 6.2h13.6v13H5.2zM7.5 3.6v3M16.5 3.6v3M4.7 9.2h14.6" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} />
    </Svg>
  )
}

function ClockIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Circle cx="12" cy="12" r="8.4" stroke={color} strokeWidth={1.7} />
      <Path d="M12 7.6v4.8l3.1 1.8" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} />
    </Svg>
  )
}

const styles = StyleSheet.create({
  asset: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
  },
  card: {
    alignSelf: 'center',
    borderWidth: 1,
    marginTop: 3,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#5D8480',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  wideCard: {
    alignSelf: 'flex-start',
    marginLeft: 23,
  },
  caseCode: {
    ...typography.footnote,
    fontWeight: '600',
  },
  copy: {
    position: 'absolute',
  },
  meta: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'absolute',
  },
  metaDivider: {
    width: 1,
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    minWidth: 0,
  },
  metaText: {
    flexShrink: 1,
    fontWeight: '600',
  },
  progress: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 51,
    justifyContent: 'space-between',
    position: 'absolute',
  },
  progressFill: {
    height: 3,
    position: 'absolute',
  },
  progressNode: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  progressNodeText: {
    fontWeight: '800',
  },
  progressTrack: {
    height: 3,
    position: 'absolute',
  },
  service: {
    fontWeight: '800',
  },
  status: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  statusText: {
    fontWeight: '800',
  },
})
