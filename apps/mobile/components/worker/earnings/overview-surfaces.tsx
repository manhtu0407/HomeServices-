import type { ComponentType } from 'react'
import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { formatCompactVnd, formatVndDong, textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'
import { styles } from './overview-styles'

type WorkerV5EarningsDailyRow = {
  date: string
  net_earnings: number
  paid_job_count: number
}

type WorkerV5EarningsOverview = {
  daily_earnings?: WorkerV5EarningsDailyRow[] | null
  gross_earnings?: number | null
  net_earnings?: number | null
  pending_payment_amount?: number | null
} | null | undefined

type WorkerV5EarningsAuraComponent = ComponentType<{
  testID: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5EarningsHero({
  earnings,
  heroAura: _heroAura,
  language,
  reduceTransparency,
  walletIcon,
}: {
  earnings: WorkerV5EarningsOverview
  heroAura: WorkerV5EarningsAuraComponent
  language: AppLanguage
  reduceTransparency: boolean
  walletIcon: ImageSourcePropType
}) {
  const hasGross = Boolean(earnings?.gross_earnings && earnings.gross_earnings > 0)
  const amount = hasGross
    ? formatVndDong(earnings?.gross_earnings ?? 0, language)
    : textByLanguage(language, 'Chưa có thu nhập thật', 'No real income yet')
  const stats = [
    {
      label: textByLanguage(language, 'Đã thanh toán', 'Settled'),
      value: earnings?.net_earnings && earnings.net_earnings > 0 ? formatCompactVnd(earnings.net_earnings, language) : textByLanguage(language, 'Chưa có', 'None'),
    },
    {
      label: textByLanguage(language, 'Đang chờ', 'Pending'),
      value: earnings?.pending_payment_amount && earnings.pending_payment_amount > 0 ? formatCompactVnd(earnings.pending_payment_amount, language) : textByLanguage(language, 'Không có', 'None'),
    },
    {
      label: textByLanguage(language, 'Có thể rút', 'Available'),
      value: earnings?.net_earnings && earnings.net_earnings > 0 ? formatCompactVnd(earnings.net_earnings, language) : textByLanguage(language, 'Chưa có', 'None'),
    },
  ]
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-earnings-hero">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="EarningsOverviewHero"
        testID="worker-v5-earnings-hero-formula-mint-aura"
      />
      <View style={styles.earningsHeroContent}>
        <View style={styles.earningsHeroMainRow}>
          <View style={styles.earningsHeroCopy}>
            <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-earnings-amount">{amount}</Text>
            <Text style={styles.earningsHeroMeta} numberOfLines={2}>{hasGross ? textByLanguage(language, 'Đã ghi sổ thu nhập', 'Income ledger recorded') : textByLanguage(language, 'Chờ hệ thống ghi sổ thu nhập', 'Waiting for system income ledger')}</Text>
            <WorkerV5DetailRail
              items={hasGross
                ? [
                  { glyph: 'document', label: textByLanguage(language, 'Đã ghi sổ', 'Recorded') },
                  { glyph: 'money', label: textByLanguage(language, 'Thu nhập ròng', 'Net income') },
                ]
                : [
                  { glyph: 'sync', label: textByLanguage(language, 'Chờ đối soát', 'Waiting settlement') },
                  { glyph: 'shield', label: textByLanguage(language, 'Số liệu thật', 'Real figures only') },
                ]}
              testID="worker-v5-earnings-hero-detail"
            />
          </View>
        </View>
        <View style={styles.earningsStatGrid} testID="worker-v5-earnings-stat-grid">
          {stats.map((item, index) => (
            <View key={item.label} style={styles.earningsStatTile} testID={`worker-v5-earnings-stat-${index}`}>
              <Text style={styles.earningsStatValue} numberOfLines={1} testID={`worker-v5-earnings-stat-value-${index}`}>{item.value}</Text>
              <Text style={styles.earningsStatLabel} numberOfLines={2}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <WorkerV5IntegratedIcon
        bleed={18}
        edge="left"
        image={walletIcon}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-earnings-hero-icon"
        tone="money"
        variant="heroPanel"
      />
    </View>
  )
}

export function WorkerV5EarningsTransactionList({
  documentIcon,
  emptyStateIcon,
  language,
  listAura: _listAura,
  recent,
  reduceTransparency,
}: {
  documentIcon: ImageSourcePropType
  emptyStateIcon: ImageSourcePropType
  language: AppLanguage
  listAura: WorkerV5EarningsAuraComponent
  recent: readonly WorkerV5EarningsDailyRow[]
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.earningsTransactionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-earnings-transactions">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="EarningsTransactionList"
        testID="worker-v5-earnings-transactions-formula-mint-aura"
      />
      {recent.length ? recent.map((row, index) => (
        <View key={row.date} style={styles.earningsTransactionRow} testID={`worker-v5-earnings-transaction-${index}`}>
          <WorkerV5IntegratedIcon bleed={13} image={documentIcon} reduceTransparency={reduceTransparency} tone="document" variant="panel" />
          <View style={styles.earningsTransactionCopy}>
            <Text style={styles.earningsTransactionTitle} numberOfLines={1}>{row.date}</Text>
            <WorkerV5DetailRail
              items={[
                { glyph: 'document', label: textByLanguage(language, `${row.paid_job_count} việc`, `${row.paid_job_count} jobs`) },
                { glyph: 'check', label: textByLanguage(language, 'Đã thanh toán', 'Settled') },
              ]}
              testID={`worker-v5-earnings-transaction-detail-${index}`}
            />
          </View>
          <Text style={styles.earningsTransactionAmount} numberOfLines={2} testID={`worker-v5-earnings-transaction-amount-${index}`}>+{formatVndDong(row.net_earnings, language)}</Text>
        </View>
      )) : (
        <View style={styles.earningsTransactionRow}>
          <WorkerV5IntegratedIcon
            bleed={13}
            image={emptyStateIcon}
            reduceTransparency={reduceTransparency}
            testID="worker-v5-earnings-empty-transaction-icon"
            tone="document"
            variant="panel"
          />
          <View style={styles.earningsTransactionCopy}>
            <Text style={styles.earningsTransactionTitle} numberOfLines={2}>{textByLanguage(language, 'Chưa có giao dịch gần đây', 'No recent transactions')}</Text>
            <WorkerV5DetailRail
              items={[
                { glyph: 'sync', label: textByLanguage(language, 'Chờ đồng bộ', 'Waiting to sync') },
                { glyph: 'document', label: textByLanguage(language, 'Sổ đối soát thật', 'Real ledger only') },
              ]}
              testID="worker-v5-earnings-empty-transaction-detail"
            />
          </View>
        </View>
      )}
    </View>
  )
}
