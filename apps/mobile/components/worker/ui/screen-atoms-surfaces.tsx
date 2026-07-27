import { type ReactNode } from 'react'
import { Text as RNText, View, type TextProps } from 'react-native'
import { MintAura } from '@/components/ui/kael-primitives'
import { WorkerV5IconName } from '../dock/types'
import { styles } from '../worker-v5-flow-styles'
import { WorkerV5CustomerMapMintAura, WorkerV5EarningsHomeListAura } from './aura-surfaces'
import { WorkerV5InfoRow as WorkerV5PrimitiveInfoRow } from './primitives-surfaces'
import { WORKER_V5_PROFILE_ICON_VISUAL_BOOST, workerV5Icons } from './screen-icons'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function InfoListCard({
  aura,
  children,
  reduceTransparency,
}: {
  aura?: 'accountSecurity' | 'demandMap'
  children: ReactNode
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.infoListCard, reduceTransparency && styles.opaqueCard]}>
      {!reduceTransparency ? <MintAura intensity="component" style={styles.listCardMintAura} testID="worker-v5-list-mint-aura" /> : null}
      {aura === 'demandMap' && !reduceTransparency ? (
        <WorkerV5CustomerMapMintAura
          scope="DemandMapInfoList"
          style={styles.demandMapInfoListAura}
          testID="worker-v5-demand-info-mint-aura"
        />
      ) : null}
      {aura === 'accountSecurity' && !reduceTransparency ? (
        <WorkerV5EarningsHomeListAura testID="worker-v5-account-security-mint-aura" />
      ) : null}
      {children}
    </View>
  )
}

export function WorkerV5ScreenInfoRow({
  icon,
  label,
  reduceTransparency = false,
  value,
}: {
  icon: WorkerV5IconName
  label: string
  reduceTransparency?: boolean
  value: string
}) {
  return (
    <WorkerV5PrimitiveInfoRow
      icon={icon}
      icons={workerV5Icons}
      iconVisualBoost={WORKER_V5_PROFILE_ICON_VISUAL_BOOST}
      label={label}
      reduceTransparency={reduceTransparency}
      value={value}
    />
  )
}

export function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <View pointerEvents="none" style={styles.cardTopHighlight} />
      <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

