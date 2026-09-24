import { StyleSheet, Text, View } from 'react-native'
import Svg, { Line, Path, Rect } from 'react-native-svg'

import type { AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import { useStageSixText } from './worker-jobs-zip-prototype-scope-type'

const INK = '#0A1730'
const MUTED = '#7290A7'
const MINT = '#079688'
const MINT_SOFT = '#E2F7F2'
const MINT_PILL = '#E4F8F4'
const MINT_TEXT = '#168F83'
const BORDER = '#C6EEE7'

function EmptyMark() {
  return (
    <Svg width={58} height={58} viewBox="0 0 64 64" fill="none" style={styles.mark}>
      <Line x1={32} y1={4} x2={32} y2={10} stroke="#0A9786" strokeWidth={2.8} strokeLinecap="round" />
      <Line x1={17.5} y1={9.5} x2={21.2} y2={14.3} stroke="#0A9786" strokeWidth={2.8} strokeLinecap="round" />
      <Line x1={46.5} y1={9.5} x2={42.8} y2={14.3} stroke="#0A9786" strokeWidth={2.8} strokeLinecap="round" />
      <Path d="M18.6 27.6L23.6 18.5H40.5L45.5 27.6" stroke={MINT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={15.5} y={27.3} width={33} height={23} rx={4.5} stroke={MINT} strokeWidth={3} />
      <Path d="M16.8 28.2H26.3C27.6 31.2 29.5 32.6 32.2 32.6C34.9 32.6 36.8 31.2 38.1 28.2H47.9" stroke={MINT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function Bulb() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M8.2 15.6C6.9 14.5 6 12.8 6 10.8C6 7.4 8.7 4.7 12 4.7C15.3 4.7 18 7.4 18 10.8C18 12.8 17.1 14.5 15.8 15.6C14.8 16.4 14.2 17.2 14 18H10C9.8 17.2 9.2 16.4 8.2 15.6Z" stroke="#0A9E8B" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1={9.8} y1={20.4} x2={14.2} y2={20.4} stroke="#0A9E8B" strokeWidth={1.9} strokeLinecap="round" />
      <Line x1={10.6} y1={22} x2={13.4} y2={22} stroke="#0A9E8B" strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  )
}

export function WorkerJobsScopeEmptyCard({ language }: { language: AppLanguage }) {
  const text = useStageSixText()
  return (
    <View style={styles.card} testID="worker-v5-stage-six-evidence-empty">
      <View style={styles.illustration}>
        <View style={[styles.bubble, { width: 27, height: 27, left: '34%', top: 21, opacity: 0.86 }]} />
        <View style={[styles.bubble, { width: 20, height: 20, left: '40%', top: 4, opacity: 0.48 }]} />
        <View style={[styles.bubble, { width: 19, height: 19, right: '40%', top: 3, opacity: 0.5 }]} />
        <View style={[styles.bubble, { width: 28, height: 28, right: '33%', top: 20, opacity: 0.8 }]} />
        <View style={[styles.bubble, { width: 15, height: 15, right: '30%', top: 34, opacity: 0.34 }]} />
        <EmptyMark />
      </View>
      <Text style={[styles.title, text('emptyTitle')]}>{textByLanguage(language, 'Chưa có thông tin nào', 'No information yet')}</Text>
      <Text style={[styles.description, text('emptyBody')]}>
        {textByLanguage(language, 'Thêm hạng mục, lý do, bằng chứng hoặc giá.', 'Add scope items, reason, evidence or price.')}
      </Text>
      <View style={styles.hintPill}>
        <Bulb />
        <Text style={[styles.hintText, text('emptyHint')]}>
          {textByLanguage(language, 'Thông tin sẽ hiện ở đây khi bạn thêm.', 'Details will show here once you add them.')}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: MINT_SOFT,
    borderRadius: 999,
    position: 'absolute',
  },
  card: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderColor: BORDER,
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: '0 2px 8px rgba(123,189,176,0.025)',
    maxWidth: 366,
    minHeight: 188,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingTop: 17,
    width: '100%',
  },
  description: {
    color: MUTED,
    marginTop: 5,
    maxWidth: 290,
    textAlign: 'center',
  },
  hintPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: MINT_PILL,
    borderRadius: 15,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginTop: 10,
    maxWidth: '100%',
    minHeight: 30,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  hintText: {
    color: MINT_TEXT,
    flexShrink: 1,
    textAlign: 'center',
  },
  illustration: {
    alignItems: 'center',
    height: 62,
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  mark: {
    zIndex: 2,
  },
  title: {
    color: INK,
    marginTop: -1,
    textAlign: 'center',
  },
})
