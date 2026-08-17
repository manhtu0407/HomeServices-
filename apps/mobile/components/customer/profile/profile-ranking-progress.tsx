import { Fragment } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

import { useV21Theme } from '../ui/use-v21-theme'
import { customerV21ProfileUtilityStyles as styles } from './profile-utility-styles'

const milestonePositions = [12, 70, 128, 186, 244] as const

type ProfileRankingMilestone = {
  active: boolean
  label: string
  value: number
}

export function ProfileRankingProgress({ percent, testID }: { percent: number; testID?: string }) {
  const { tokens } = useV21Theme()
  const clampedPercent = Math.max(0, Math.min(100, percent))
  const activeMilestones = clampedPercent === 0
    ? 1
    : Math.min(milestonePositions.length, Math.floor((clampedPercent / 100) * (milestonePositions.length - 1)) + 1)

  return (
    <View style={styles.profileRankingEntryProgress} testID={testID}>
      <Svg height={28} preserveAspectRatio="none" viewBox="0 0 260 28" width="100%">
        <Path
          d="M12 14H244"
          fill="none"
          stroke={tokens.border}
          strokeDasharray="1 9"
          strokeLinecap="round"
          strokeWidth={2}
        />
        {milestonePositions.map((x, index) => {
          const active = index < activeMilestones
          const isStart = index === 0
          return (
            <Fragment key={x}>
              <Circle
                cx={x}
                cy={14}
                fill={isStart || !active ? tokens.raised : tokens.primary}
                r={isStart ? 6 : 5}
                stroke={active ? tokens.primary : tokens.border}
                strokeWidth={isStart ? 1.5 : 1}
              />
              {isStart ? <Circle cx={x} cy={14} fill={tokens.primary} r={2} /> : null}
            </Fragment>
          )
        })}
        <Path d="M244 3v22M244 4l11 4-11 4" fill={tokens.primary} stroke={tokens.primary} strokeLinejoin="round" strokeWidth={1} />
      </Svg>
    </View>
  )
}

export function ProfileRankingMilestoneRail({ nodes, testID }: { nodes: readonly ProfileRankingMilestone[]; testID?: string }) {
  const { tokens } = useV21Theme()
  const positions = [10, 70, 130, 190, 250]

  return (
    <View style={styles.profileRankingMilestoneRail} testID={testID}>
      <Svg height={28} preserveAspectRatio="none" viewBox="0 0 260 28" width="100%">
        <Path
          d="M10 14H250"
          fill="none"
          stroke={tokens.border}
          strokeDasharray="1 8"
          strokeLinecap="round"
          strokeWidth={2}
        />
        {nodes.map((node, index) => {
          const x = positions[index] ?? positions[positions.length - 1]
          return (
            <Circle
              cx={x}
              cy={14}
              fill={node.active ? tokens.primary : tokens.raised}
              key={node.value}
              r={node.active ? 6 : 5.5}
              stroke={node.active ? tokens.primary : tokens.border}
              strokeWidth={node.active ? 1.5 : 1.25}
              testID={testID ? `${testID}-node-${node.value}` : undefined}
            />
          )
        })}
      </Svg>
      <View style={styles.profileRankingMilestoneLabels}>
        {nodes.map((node) => (
          <View
            accessibilityLabel={`${node.value}. ${node.label}`}
            key={node.value}
            style={styles.profileRankingMilestoneLabelFrame}
            testID={testID ? `${testID}-label-${node.value}` : `customer-v21-profile-rank-node-${node.value}`}
          >
            <Text numberOfLines={1} style={[styles.profileRankingMilestoneLabel, { color: node.active ? tokens.text : tokens.muted }]}>
              {node.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
