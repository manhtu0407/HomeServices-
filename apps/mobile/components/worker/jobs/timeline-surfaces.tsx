import type { ComponentType } from 'react'
import {
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import { styles } from './timeline-styles'

type WorkerV5TimelineAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5TimelineState = 'active' | 'done' | 'todo'

type WorkerV5TimelineRow = {
  meta: string
  state: WorkerV5TimelineState
  title: string
}

export type WorkerV5StatusTimelineBaseProps = {
  formulaAura?: boolean
  reduceTransparency?: boolean
  rows: readonly WorkerV5TimelineRow[]
  testID: string
}

type WorkerV5StatusTimelineProps = WorkerV5StatusTimelineBaseProps & {
  caseWideAura?: WorkerV5TimelineAuraComponent
  zipAura?: WorkerV5TimelineAuraComponent
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5StatusTimeline({
  caseWideAura: CaseWideAura,
  formulaAura = false,
  reduceTransparency = false,
  rows,
  testID,
  zipAura: ZipAura,
}: WorkerV5StatusTimelineProps) {
  return (
    <View style={[styles.timeline, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {formulaAura && !reduceTransparency && CaseWideAura && ZipAura ? (
        <>
          <CaseWideAura scope="StatusTimelineWide" style={styles.timelineFormulaAura} testID={`${testID}-mint-aura`} />
          <ZipAura scope="StatusTimelineFine" style={styles.timelineFormulaZipAura} testID={`${testID}-zip-mint-aura`} />
        </>
      ) : null}
      <View pointerEvents="none" style={styles.timelineRail} />
      {rows.map((row, index) => (
        <View key={`${row.title}-${row.meta}`} style={styles.timelineItem}>
          <View
            style={[
              styles.timelineDot,
              row.state === 'done' ? styles.timelineDotDone : null,
              row.state === 'active' ? styles.timelineDotActive : null,
            ]}
          />
          <Text style={styles.timelineTitle} numberOfLines={2} testID={`${testID}-title-${index}`}>{row.title}</Text>
          <Text style={styles.timelineMeta} numberOfLines={2} testID={`${testID}-meta-${index}`}>{row.meta}</Text>
        </View>
      ))}
    </View>
  )
}
