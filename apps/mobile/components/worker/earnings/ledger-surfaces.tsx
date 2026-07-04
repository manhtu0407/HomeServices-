import type { ComponentType } from 'react'
import { Text as RNText, View, type TextProps } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { formatVndDong, textByLanguage } from '../ui/format'
import type { WorkerV5StatusTimelineBaseProps } from '../jobs/timeline-surfaces'
import { WorkerV5EarningsHomeHeroAura } from '../ui/aura-surfaces'
import { styles } from './ledger-styles'

type WorkerV5LedgerEarnings = {
  gross_earnings?: number | null
  net_earnings?: number | null
  platform_fee_total?: number | null
  total_jobs_paid?: number | null
} | null | undefined

type WorkerV5LedgerListAuraComponent = ComponentType<{
  testID: string
}>

type WorkerV5LedgerStatusTimelineComponent = ComponentType<WorkerV5StatusTimelineBaseProps>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5LedgerHero({
  earnings,
  language,
  reduceTransparency,
}: {
  earnings: WorkerV5LedgerEarnings
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const netValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  const net = formatVndDong(netValue, language)

  return (
    <View style={[styles.paymentTotalCard, styles.ledgerHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-ledger-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeHeroAura testID="worker-v5-ledger-mint-aura" /> : null}
      <View style={styles.paymentTotalCopy}>
        <Text style={styles.paymentTotalCaption} numberOfLines={1}>{textByLanguage(language, 'Thu nhập ròng', 'Net earnings')}</Text>
        <Text style={styles.paymentTotalAmount} numberOfLines={2} testID="worker-v5-ledger-amount">{net}</Text>
      </View>
    </View>
  )
}

export function WorkerV5LedgerBreakdownCard({
  earnings,
  language,
  listAura: ListAura,
  reduceTransparency,
}: {
  earnings: WorkerV5LedgerEarnings
  language: AppLanguage
  listAura: WorkerV5LedgerListAuraComponent
  reduceTransparency: boolean
}) {
  const grossValue = typeof earnings?.gross_earnings === 'number' ? earnings.gross_earnings : 0
  const platformFeeValue = typeof earnings?.platform_fee_total === 'number' ? earnings.platform_fee_total : 0
  const netValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  const paidJobsValue = typeof earnings?.total_jobs_paid === 'number' ? earnings.total_jobs_paid : 0
  const rows = [
    {
      label: textByLanguage(language, 'Thu nhập gộp', 'Gross income'),
      value: formatVndDong(grossValue, language),
    },
    {
      label: textByLanguage(language, 'Phí nền tảng', 'Platform fee'),
      value: platformFeeValue > 0 ? `-${formatVndDong(platformFeeValue, language)}` : formatVndDong(0, language),
    },
    {
      label: textByLanguage(language, 'Việc đã trả', 'Paid jobs'),
      value: `${paidJobsValue}`,
    },
  ]

  return (
    <View style={[styles.priceLinesCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-ledger-breakdown">
      {!reduceTransparency ? <ListAura testID="worker-v5-ledger-breakdown-mint-aura" /> : null}
      {rows.map((row, index) => (
        <View key={row.label} style={styles.priceLine}>
          <Text style={styles.priceLineLabel} numberOfLines={2} testID={`worker-v5-ledger-breakdown-label-${index}`}>{row.label}</Text>
          <Text style={styles.priceLineValue} numberOfLines={2} testID={`worker-v5-ledger-breakdown-value-${index}`}>{row.value}</Text>
        </View>
      ))}
      <View style={styles.priceTotalLine}>
        <Text style={styles.priceTotalLabel} numberOfLines={2}>{textByLanguage(language, 'Thu nhập ròng', 'Net income')}</Text>
        <Text style={styles.priceTotalValue} numberOfLines={2} testID="worker-v5-ledger-net-total">
          {formatVndDong(netValue, language)}
        </Text>
      </View>
    </View>
  )
}

export function WorkerV5LedgerTraceTimeline({
  earnings,
  language,
  reduceTransparency,
  statusTimeline: StatusTimeline,
}: {
  earnings: WorkerV5LedgerEarnings
  language: AppLanguage
  reduceTransparency: boolean
  statusTimeline: WorkerV5LedgerStatusTimelineComponent
}) {
  const paidJobsValue = typeof earnings?.total_jobs_paid === 'number' ? earnings.total_jobs_paid : 0
  const netValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  const jobsReady = paidJobsValue > 0
  const netReady = netValue > 0
  const rows = [
    {
      meta: textByLanguage(language, `${paidJobsValue} việc đã trả`, `${paidJobsValue} paid jobs`),
      state: jobsReady ? 'done' as const : 'todo' as const,
      title: textByLanguage(language, 'Gom giao dịch', 'Transaction rollup'),
    },
    {
      meta: formatVndDong(netValue, language),
      state: netReady ? 'done' as const : jobsReady ? 'active' as const : 'todo' as const,
      title: textByLanguage(language, 'Ghi sổ ví thu nhập', 'Income wallet ledger'),
    },
  ]

  return <StatusTimeline formulaAura reduceTransparency={reduceTransparency} rows={rows} testID="worker-v5-ledger-trace" />
}
