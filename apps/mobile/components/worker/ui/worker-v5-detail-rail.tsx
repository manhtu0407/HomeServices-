import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

import { color, typography } from '@/design/theme'

export type WorkerV5DetailGlyph =
  | 'arrival'
  | 'check'
  | 'document'
  | 'identity'
  | 'language'
  | 'location'
  | 'memory'
  | 'money'
  | 'service'
  | 'settings'
  | 'shield'
  | 'signal'
  | 'spark'
  | 'sync'

export type WorkerV5DetailRailItem = {
  glyph: WorkerV5DetailGlyph
  label: string
}

type WorkerV5DetailRailLayout = 'inline' | 'stacked'

function WorkerV5DetailGlyphMark({ glyph }: { glyph: WorkerV5DetailGlyph }) {
  if (glyph === 'arrival') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Circle cx={8} cy={8} fill="none" r={5.6} stroke="#36BBA7" strokeWidth={1.5} />
        <Path d="M8 4.5v3.8l2.5 1.5" fill="none" stroke="#128F80" strokeLinecap="round" strokeWidth={1.5} />
      </Svg>
    )
  }
  if (glyph === 'check') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Circle cx={8} cy={8} fill="#DDF8F2" r={6.2} />
        <Path d="m4.9 8.1 2 2.1 4.4-4.7" fill="none" stroke="#119B89" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.55} />
      </Svg>
    )
  }
  if (glyph === 'document') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Path d="M4 2.2h5.1L12 5.1v8.1H4z" fill="#E5F9F5" stroke="#43BDAA" strokeLinejoin="round" strokeWidth={1.2} />
        <Path d="M9.1 2.2v3h3M6 8h4M6 10.4h3" fill="none" stroke="#168E80" strokeLinecap="round" strokeWidth={1.1} />
      </Svg>
    )
  }
  if (glyph === 'identity') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Circle cx={8} cy={5.3} fill="#73D4C2" r={2.6} />
        <Path d="M3.5 13.1c.7-2.2 2.2-3.3 4.5-3.3s3.8 1.1 4.5 3.3" fill="#DDF8F2" stroke="#249F90" strokeLinecap="round" strokeWidth={1.1} />
      </Svg>
    )
  }
  if (glyph === 'language') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Circle cx={8} cy={8} fill="#E5F9F5" r={5.9} stroke="#42BBA9" strokeWidth={1.2} />
        <Path d="M2.6 8h10.8M8 2.2c1.6 1.6 2.3 3.5 2.3 5.8S9.6 12.2 8 13.8C6.4 12.2 5.7 10.3 5.7 8S6.4 3.8 8 2.2Z" fill="none" stroke="#168E80" strokeLinecap="round" strokeWidth={1} />
      </Svg>
    )
  }
  if (glyph === 'location') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Path d="M8 2.1a4.1 4.1 0 0 0-4.1 4.1c0 3.1 4.1 7.7 4.1 7.7s4.1-4.6 4.1-7.7A4.1 4.1 0 0 0 8 2.1Z" fill="#DDF8F2" stroke="#28A896" strokeWidth={1.2} />
        <Circle cx={8} cy={6.2} fill="#2DB7A3" r={1.35} />
      </Svg>
    )
  }
  if (glyph === 'memory') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Rect fill="#E5F9F5" height={9.5} rx={3.2} stroke="#41BCA9" strokeWidth={1.2} width={12} x={2} y={2.3} />
        <Circle cx={5.5} cy={7} fill="#2DB7A3" r={1.1} />
        <Circle cx={8} cy={7} fill="#7AD8C7" r={1.1} />
        <Circle cx={10.5} cy={7} fill="#2DB7A3" r={1.1} />
        <Path d="M6.2 12.1 5.1 14l2.8-1.8" fill="#E5F9F5" stroke="#41BCA9" strokeLinejoin="round" strokeWidth={1.05} />
      </Svg>
    )
  }
  if (glyph === 'money') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Path d="M2.4 4.8h9.7a1.5 1.5 0 0 1 1.5 1.5v5.1a1.5 1.5 0 0 1-1.5 1.5H3.9a1.5 1.5 0 0 1-1.5-1.5V4.8Z" fill="#E5F9F5" stroke="#3BB9A6" strokeWidth={1.2} />
        <Path d="M2.7 5V3.8c0-.8.7-1.4 1.5-1.4h6.1" fill="none" stroke="#178F81" strokeLinecap="round" strokeWidth={1.1} />
        <Circle cx={10.7} cy={9} fill="#27AE9A" r={1.2} />
      </Svg>
    )
  }
  if (glyph === 'service') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Path d="m11.2 2 2.5 2.5-2 2-1.2-1.2-4.6 4.6 1.2 1.2-2 2L2.6 10.6l2-2 1.2 1.2 4.6-4.6L9.2 4l2-2Z" fill="#70D4C2" stroke="#1B9E8D" strokeLinejoin="round" strokeWidth={.8} />
      </Svg>
    )
  }
  if (glyph === 'settings') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Path d="M3 4h10M3 8h10M3 12h10" fill="none" stroke="#209A8A" strokeLinecap="round" strokeWidth={1.3} />
        <Circle cx={6} cy={4} fill="#DDF8F2" r={1.7} stroke="#2DB7A3" strokeWidth={1.1} />
        <Circle cx={10.6} cy={8} fill="#DDF8F2" r={1.7} stroke="#2DB7A3" strokeWidth={1.1} />
        <Circle cx={7.5} cy={12} fill="#DDF8F2" r={1.7} stroke="#2DB7A3" strokeWidth={1.1} />
      </Svg>
    )
  }
  if (glyph === 'shield') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Path d="M8 2.2 12.6 4v3.5c0 2.8-1.9 4.9-4.6 6.2-2.7-1.3-4.6-3.4-4.6-6.2V4L8 2.2Z" fill="#E5F9F5" stroke="#36B7A4" strokeLinejoin="round" strokeWidth={1.2} />
        <Path d="m5.6 7.8 1.6 1.6 3.2-3.2" fill="none" stroke="#168E80" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} />
      </Svg>
    )
  }
  if (glyph === 'signal') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Path d="M2.4 12.8h2V9h-2v3.8Zm4.6 0h2V5.9H7v6.9Zm4.6 0h2V2.6h-2v10.2Z" fill="#33B8A4" />
      </Svg>
    )
  }
  if (glyph === 'spark') {
    return (
      <Svg height={16} viewBox="0 0 16 16" width={16}>
        <Path d="m8 1.8 1.2 4.1 4.1 1.2-4.1 1.2L8 12.4 6.8 8.3 2.7 7.1l4.1-1.2L8 1.8Z" fill="#65D1C0" />
        <Circle cx={12.6} cy={12.1} fill="#2EB39F" r={1.25} />
      </Svg>
    )
  }
  return (
    <Svg height={16} viewBox="0 0 16 16" width={16}>
      <Path d="M12.5 5.9A5.2 5.2 0 0 0 3.7 4.4L2.4 5.7m1.1-2.9.2 1.9 1.9-.2M3.5 10.1a5.2 5.2 0 0 0 8.8 1.5l1.3-1.3m-1.1 2.9-.2-1.9-1.9.2" fill="none" stroke="#229C8C" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} />
    </Svg>
  )
}

export function WorkerV5DetailRail({
  items,
  layout = 'inline',
  prominent = false,
  showDividers = true,
  testID,
}: {
  items: readonly WorkerV5DetailRailItem[]
  layout?: WorkerV5DetailRailLayout
  prominent?: boolean
  showDividers?: boolean
  testID?: string
}) {
  if (!items.length) return null
  const stacked = layout === 'stacked'
  return (
    <View style={[styles.rail, stacked && styles.railStacked]} testID={testID}>
      {items.map((item, index) => (
        <View key={`${item.glyph}-${item.label}`} style={[styles.item, stacked && styles.itemStacked]}>
          <WorkerV5DetailGlyphMark glyph={item.glyph} />
          <Text numberOfLines={1} style={[styles.label, prominent && styles.labelProminent]}>{item.label}</Text>
          {!stacked && showDividers && index < items.length - 1 ? <View style={styles.divider} testID={testID ? `${testID}-divider-${index}` : undefined} /> : null}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  divider: {
    backgroundColor: 'rgba(179, 211, 205, 0.86)',
    height: 16,
    marginHorizontal: 5,
    width: 1,
  } satisfies ViewStyle,
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 3,
  } satisfies ViewStyle,
  itemStacked: {
    width: '100%',
  } satisfies ViewStyle,
  label: {
    color: color.text.secondary,
    flexShrink: 1,
    ...typography.caption2,
    fontWeight: '600',
  } satisfies TextStyle,
  labelProminent: {
    ...typography.caption1,
    fontWeight: '600',
  } satisfies TextStyle,
  rail: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    minWidth: 0,
  } satisfies ViewStyle,
  railStacked: {
    alignItems: 'flex-start',
    flexDirection: 'column',
    gap: 2,
  } satisfies ViewStyle,
})
