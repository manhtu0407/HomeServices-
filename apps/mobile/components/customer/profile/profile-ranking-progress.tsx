import { Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { useV21Theme } from '../ui/use-v21-theme'
import { customerV21ProfileUtilityStyles as styles } from './profile-utility-styles'

type ProfileRankingMilestone = {
  active: boolean
  label: string
  value: number
}

export function ProfileRankingMilestoneRail({ nodes, testID }: { nodes: readonly ProfileRankingMilestone[]; testID?: string }) {
  const { tokens } = useV21Theme()
  const nodeSpacing = 100 / Math.max(nodes.length, 1)
  const nodeCenters = nodes.map((_, index) => (index + 0.5) * nodeSpacing)
  const trackPath = Array.from({ length: nodes.length * 2 }, (_, index) => {
    const intervalIndex = Math.floor(index / 2)
    const offset = index % 2 === 0 ? 0.25 : 0.75
    const center = (intervalIndex + offset) * nodeSpacing
    return `M${center - 0.5} 14H${center + 0.5}`
  })
    .join(' ')

  return (
    <View style={styles.profileRankingMilestoneRail} testID={testID}>
      <View style={styles.profileRankingMilestoneStage}>
        <Svg height={28} preserveAspectRatio="none" style={styles.profileRankingMilestoneTrack} testID={testID ? `${testID}-track` : undefined} viewBox="0 0 100 28" width="100%">
          <Path
            d={trackPath}
            fill="none"
            stroke={tokens.border}
            strokeLinecap="round"
            strokeWidth={2}
            testID={testID ? `${testID}-track-path` : undefined}
          />
        </Svg>
        <View style={styles.profileRankingMilestoneNodes}>
          {nodes.map((node, index) => (
            <View
              key={node.value}
              style={[
                styles.profileRankingMilestoneNode,
                {
                  backgroundColor: node.active ? tokens.primary : tokens.raised,
                  borderColor: node.active ? tokens.primary : tokens.border,
                  left: `${nodeCenters[index]}%`,
                },
              ]}
              testID={testID ? `${testID}-node-${node.value}` : undefined}
            />
          ))}
        </View>
      </View>
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
