import { Image } from 'expo-image'
import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'

import type { WorkerV5IconName } from '../dock/types'
import { styles } from './action-styles'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'

type WorkerV5IconMap = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5QuickActionItem = {
  icon: WorkerV5IconName
  meta: string
  title: string
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5QuickActionGrid({
  icons,
  items,
  reduceTransparency,
}: {
  icons: WorkerV5IconMap
  items: readonly WorkerV5QuickActionItem[]
  reduceTransparency: boolean
}) {
  const opaqueCard = useWorkerThemedStyles(styles).opaqueCard
  return (
    <View style={styles.quickActionGrid} testID="worker-v5-quick-action-grid">
      {items.map((item, index) => (
        <View key={`${item.icon}-${item.title}`} style={[styles.quickActionCard, reduceTransparency && opaqueCard]} testID={`worker-v5-quick-action-${index}`}>
          <View style={styles.quickActionIconTile}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={icons[item.icon]} style={styles.quickActionIcon} />
          </View>
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionTitle} numberOfLines={2} testID={`worker-v5-quick-action-title-${index}`}>{item.title}</Text>
            <Text style={styles.quickActionMeta} numberOfLines={2} testID={`worker-v5-quick-action-meta-${index}`}>{item.meta}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
