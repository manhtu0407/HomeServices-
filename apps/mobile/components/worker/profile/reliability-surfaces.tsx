import type { ComponentType, ReactNode } from 'react'
import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import {
  workerV5ReliabilityAxisMeta,
  workerV5ReliabilityAxisTitle,
  type WorkerV5ReliabilityAxis,
} from '../ui/performance'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import { WorkerV5DetailRail, type WorkerV5DetailGlyph } from '../ui/worker-v5-detail-rail'
import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { styles as lightStyles } from './reliability-styles'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'
import { styles as formulaStylesLight } from './worker-profile-formula-styles'

type WorkerV5ReliabilityAura = ComponentType<{ testID: string }>
type WorkerV5ReliabilityIcons = Record<string, ImageSourcePropType>
type WorkerV5ReliabilityFillRenderer = (props: {
  hasData: boolean
  index: number
  score: number
}) => ReactNode

function Text({ style, ...props }: TextProps) {
  const styles = useWorkerThemedStyles(lightStyles)
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function workerV5ReliabilityDetail(axisId: string, language: AppLanguage): { glyph: WorkerV5DetailGlyph; label: string } {
  if (axisId === 'arrival') return { glyph: 'arrival', label: textByLanguage(language, 'Lịch & thời gian', 'Schedule and timing') }
  if (axisId === 'completion') return { glyph: 'document', label: textByLanguage(language, 'Bằng chứng hoàn tất', 'Completion evidence') }
  return { glyph: 'identity', label: textByLanguage(language, 'Phản hồi khách', 'Customer feedback') }
}

export function WorkerV5ReliabilityComponentList({
  axes,
  axisIcons,
  language,
  listAura: _listAura,
  reduceTransparency,
  renderAxisFill,
}: {
  axes: WorkerV5ReliabilityAxis[]
  axisIcons: WorkerV5ReliabilityIcons
  language: AppLanguage
  listAura: WorkerV5ReliabilityAura
  reduceTransparency: boolean
  renderAxisFill: WorkerV5ReliabilityFillRenderer
}) {
  const styles = useWorkerThemedStyles(lightStyles)
  return (
    <View style={[styles.reliabilityAxisList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-reliability-components">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="WorkerReliabilityComponents"
        testID="worker-v5-reliability-components-mint-aura"
      />
      {axes.map((axis, index) => (
        <View key={axis.id} style={styles.reliabilityAxisRow}>
          <WorkerV5IntegratedIcon
            image={axisIcons[axis.id] ?? axisIcons.fallback}
            reduceTransparency={reduceTransparency}
            testID={`worker-v5-reliability-axis-icon-${index}`}
            tone={axis.id === 'arrival' ? 'signal' : axis.id === 'completion' ? 'document' : 'identity'}
            variant="panel"
          />
          <View style={styles.reliabilityAxisCopy}>
            <Text style={styles.reliabilityAxisTitle} numberOfLines={2} testID={`worker-v5-reliability-axis-title-${index}`}>{workerV5ReliabilityAxisTitle(axis.id, language)}</Text>
            <Text style={styles.reliabilityAxisMeta} numberOfLines={1} testID={`worker-v5-reliability-axis-meta-${index}`}>{workerV5ReliabilityAxisMeta(axis, language)}</Text>
            <WorkerV5DetailRail
              items={[
                workerV5ReliabilityDetail(axis.id, language),
                axis.hasData
                  ? { glyph: 'check', label: textByLanguage(language, 'Đã ghi nhận', 'Recorded') }
                  : { glyph: 'sync', label: textByLanguage(language, 'Chờ nguồn thật', 'Waiting for real source') },
              ]}
              testID={`worker-v5-reliability-axis-detail-${index}`}
            />
            <View style={styles.reliabilityAxisTrack}>
              {renderAxisFill({
                hasData: axis.hasData,
                index,
                score: axis.score,
              })}
            </View>
          </View>
          <Text style={styles.reliabilityAxisScore} numberOfLines={1} testID={`worker-v5-reliability-axis-score-${index}`}>
            {axis.hasData ? `${axis.score}/100` : textByLanguage(language, 'Chờ', 'Pending')}
          </Text>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5ReliabilityStatTile({ label, testID, value }: { label: string; testID: string; value: string }) {
  const formulaStyles = useWorkerThemedStyles(formulaStylesLight)
  const styles = useWorkerThemedStyles(lightStyles)
  return (
    <View style={[styles.reliabilityStatTile, formulaStyles.compactMetric]} testID={testID}>
      <View pointerEvents="none" style={styles.cardTopHighlight} />
      <Text style={styles.reliabilityStatValue} numberOfLines={1} testID={`${testID}-value`}>{value}</Text>
      <Text style={styles.reliabilityStatLabel} numberOfLines={2} testID={`${testID}-label`}>{label}</Text>
    </View>
  )
}
