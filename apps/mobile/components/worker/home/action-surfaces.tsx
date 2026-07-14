import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import type { WorkerV5ScreenId } from '../dock/types'
import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { WorkerV5IntegratedIcon, type WorkerV5IntegratedIconTone } from '../ui/integrated-icon-surfaces'
import { WorkerV5DetailRail, type WorkerV5DetailRailItem } from '../ui/worker-v5-detail-rail'
import { styles } from './action-styles'

export { WorkerV5KaelBriefCard } from './kael-brief-surfaces'
export { WorkerV5QuickActionGrid } from './quick-action-grid-surfaces'

type WorkerV5HomeQuickActionItem = {
  details: readonly WorkerV5DetailRailItem[]
  icon: ImageSourcePropType
  meta: string
  targetId: WorkerV5ScreenId
  tone: WorkerV5IntegratedIconTone
  title: string
}
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5HomeQuickActionGrid({
  items,
  onOpen,
  reduceMotion,
  reduceTransparency,
}: {
  items: ReadonlyArray<WorkerV5HomeQuickActionItem>
  onOpen: (id: WorkerV5ScreenId) => void
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.quickActionGrid} testID="worker-v5-quick-action-grid">
      {items.map((item, index) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.meta}`}
          key={`${item.icon}-${item.title}`}
          onPress={() => onOpen(item.targetId)}
          style={({ pressed }) => [
            styles.quickActionCard,
            styles.homeQuickActionCard,
            reduceTransparency && styles.opaqueCard,
            pressed && !reduceMotion ? styles.pressed : null,
          ]}
          testID={`worker-v5-quick-action-${index}`}
        >
          <WorkerV5FormulaMintCardAura
            reduceTransparency={reduceTransparency}
            scope={`HomeQuickAction${index}`}
            testID={`worker-v5-home-quick-action-formula-mint-aura-${index}`}
          />
          <WorkerV5IntegratedIcon bleed={10} image={item.icon} reduceTransparency={reduceTransparency} tone={item.tone} variant="compactPanel" />
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionTitle} numberOfLines={2} testID={`worker-v5-quick-action-title-${index}`}>{item.title}</Text>
            <Text style={styles.quickActionMeta} numberOfLines={2} testID={`worker-v5-quick-action-meta-${index}`}>{item.meta}</Text>
            <WorkerV5DetailRail items={item.details} layout="stacked" showDividers={false} testID={`worker-v5-home-quick-action-detail-${index}`} />
          </View>
        </Pressable>
      ))}
    </View>
  )
}
