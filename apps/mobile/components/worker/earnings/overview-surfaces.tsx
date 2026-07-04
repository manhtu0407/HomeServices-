import type { ComponentType } from 'react'
import {
  Image,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import { formatCompactVnd, formatVndDong, textByLanguage } from '../ui/format'
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
  heroAura: HeroAura,
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
      {!reduceTransparency ? (
        <HeroAura testID="worker-v5-earnings-mint-aura" />
      ) : null}
      <View style={styles.earningsHeroContent}>
        <View style={styles.earningsHeroMainRow}>
          <View style={styles.earningsHeroCopy}>
            <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-earnings-amount">{amount}</Text>
            <Text style={styles.earningsHeroMeta} numberOfLines={2}>{hasGross ? textByLanguage(language, 'Đã ghi sổ thu nhập', 'Income ledger recorded') : textByLanguage(language, 'Chờ hệ thống ghi sổ thu nhập', 'Waiting for system income ledger')}</Text>
          </View>
          <View style={styles.earningsHeroIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={walletIcon} style={styles.earningsHeroIcon} />
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
    </View>
  )
}

export function WorkerV5EarningsTransactionList({
  documentIcon,
  language,
  listAura: ListAura,
  recent,
  reduceTransparency,
  walletIcon,
}: {
  documentIcon: ImageSourcePropType
  language: AppLanguage
  listAura: WorkerV5EarningsAuraComponent
  recent: readonly WorkerV5EarningsDailyRow[]
  reduceTransparency: boolean
  walletIcon: ImageSourcePropType
}) {
  return (
    <View style={[styles.earningsTransactionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-earnings-transactions">
      {!reduceTransparency ? (
        <ListAura testID="worker-v5-earnings-transactions-mint-aura" />
      ) : null}
      {recent.length ? recent.map((row, index) => (
        <View key={row.date} style={styles.earningsTransactionRow} testID={`worker-v5-earnings-transaction-${index}`}>
          <View style={styles.earningsTransactionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={documentIcon} style={styles.earningsTransactionIcon} />
          </View>
          <View style={styles.earningsTransactionCopy}>
            <Text style={styles.earningsTransactionTitle} numberOfLines={1}>{row.date}</Text>
            <Text style={styles.earningsTransactionMeta} numberOfLines={2}>{textByLanguage(language, `${row.paid_job_count} việc đã trả`, `${row.paid_job_count} paid jobs`)}</Text>
          </View>
          <Text style={styles.earningsTransactionAmount} numberOfLines={2} testID={`worker-v5-earnings-transaction-amount-${index}`}>+{formatVndDong(row.net_earnings, language)}</Text>
        </View>
      )) : (
        <View style={styles.earningsTransactionRow}>
          <View style={styles.earningsTransactionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={walletIcon} style={styles.earningsTransactionIcon} />
          </View>
          <View style={styles.earningsTransactionCopy}>
            <Text style={styles.earningsTransactionTitle} numberOfLines={2}>{textByLanguage(language, 'Chưa có giao dịch gần đây', 'No recent transactions')}</Text>
            <Text style={styles.earningsTransactionMeta} numberOfLines={2}>{textByLanguage(language, 'Giao dịch chỉ hiện khi số đối soát thật đồng bộ.', 'Transactions appear only when the real ledger syncs.')}</Text>
          </View>
        </View>
      )}
    </View>
  )
}
