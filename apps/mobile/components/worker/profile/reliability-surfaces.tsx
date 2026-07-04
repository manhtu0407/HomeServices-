import type { ComponentType, ReactNode } from 'react'
import {
  Image,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { WorkerV5IconName } from '../dock/types'
import {
  workerV5RankingAxisIcon,
  workerV5ReliabilityAxisMeta,
  workerV5ReliabilityAxisTitle,
  type WorkerV5ReliabilityAxis,
} from '../ui/performance'
import { styles } from './reliability-styles'

type WorkerV5ReliabilityAura = ComponentType<{ testID: string }>
type WorkerV5ReliabilityIcons = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5ReliabilityFillRenderer = (props: {
  hasData: boolean
  index: number
  score: number
}) => ReactNode

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ReliabilityComponentList({
  axes,
  icons,
  language,
  listAura: ListAura,
  reduceTransparency,
  renderAxisFill,
}: {
  axes: WorkerV5ReliabilityAxis[]
  icons: WorkerV5ReliabilityIcons
  language: AppLanguage
  listAura: WorkerV5ReliabilityAura
  reduceTransparency: boolean
  renderAxisFill: WorkerV5ReliabilityFillRenderer
}) {
  return (
    <View style={[styles.reliabilityAxisList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-reliability-components">
      {!reduceTransparency ? <ListAura testID="worker-v5-reliability-components-mint-aura" /> : null}
      {axes.map((axis, index) => (
        <View key={axis.id} style={styles.reliabilityAxisRow}>
          <View style={styles.reliabilityAxisIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={icons[workerV5RankingAxisIcon(axis.id)]} style={styles.reliabilityAxisIcon} />
          </View>
          <View style={styles.reliabilityAxisCopy}>
            <Text style={styles.reliabilityAxisTitle} numberOfLines={2} testID={`worker-v5-reliability-axis-title-${index}`}>{workerV5ReliabilityAxisTitle(axis.id, language)}</Text>
            <Text style={styles.reliabilityAxisMeta} numberOfLines={1} testID={`worker-v5-reliability-axis-meta-${index}`}>{workerV5ReliabilityAxisMeta(axis, language)}</Text>
            <View style={styles.reliabilityAxisTrack}>
              {renderAxisFill({
                hasData: axis.hasData,
                index,
                score: axis.score,
              })}
            </View>
          </View>
          <Text style={styles.reliabilityAxisScore} numberOfLines={1} testID={`worker-v5-reliability-axis-score-${index}`}>{axis.score}/100</Text>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5ReliabilityStatTile({ label, testID, value }: { label: string; testID: string; value: string }) {
  return (
    <View style={styles.reliabilityStatTile} testID={testID}>
      <View pointerEvents="none" style={styles.cardTopHighlight} />
      <Text style={styles.reliabilityStatValue} numberOfLines={1} testID={`${testID}-value`}>{value}</Text>
      <Text style={styles.reliabilityStatLabel} numberOfLines={2} testID={`${testID}-label`}>{label}</Text>
    </View>
  )
}
