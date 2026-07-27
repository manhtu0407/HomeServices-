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

type WorkerV5EarningsTransaction = {
  job_id: string
  display_code: string | null
  payment_state: 'pending' | 'available' | 'on_hold' | 'reversed'
  worker_net: number
  commission_level: number
  commission_rate_bps: number
}

type WorkerV5EarningsOverview = {
  available_balance?: number | null
  current_commission_level?: number | null
  current_commission_rate_bps?: number | null
  net_earnings?: number | null
  on_hold_amount?: number | null
  pending_payment_amount?: number | null
  recent_transactions?: WorkerV5EarningsTransaction[] | null
} | null | undefined

type WorkerV5EarningsAuraComponent = ComponentType<{
  testID: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function formatCommissionRate(rateBps: number | null | undefined) {
  if (typeof rateBps !== 'number' || !Number.isInteger(rateBps) || rateBps < 0) return null
  const whole = Math.floor(rateBps / 100)
  const decimal = rateBps % 100
  return decimal === 0 ? `${whole}%` : `${whole}.${String(decimal).padStart(2, '0')}%`
}

function paymentStateLabel(
  paymentState: WorkerV5EarningsTransaction['payment_state'],
  language: AppLanguage,
) {
  switch (paymentState) {
    case 'available':
      return textByLanguage(language, 'Đã ghi có', 'Available')
    case 'pending':
      return textByLanguage(language, 'Chờ SePay xác thực', 'Awaiting SePay')
    case 'on_hold':
      return textByLanguage(language, 'Tạm giữ đối soát', 'On hold')
    case 'reversed':
      return textByLanguage(language, 'Đã đảo giao dịch', 'Reversed')
  }
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
  const availableBalance = earnings?.available_balance ?? 0
  const pendingAmount = earnings?.pending_payment_amount ?? 0
  const onHoldAmount = earnings?.on_hold_amount ?? 0
  const hasAvailableBalance = availableBalance > 0
  const commissionRate = formatCommissionRate(earnings?.current_commission_rate_bps)
  const pending = textByLanguage(language, 'Chờ dữ liệu', 'Pending')
  const amount = !earnings
    ? textByLanguage(language, 'Chờ dữ liệu số dư', 'Balance data pending')
    : hasAvailableBalance
      ? formatVndDong(availableBalance, language)
      : textByLanguage(language, 'Chưa có số dư khả dụng', 'No available balance yet')
  const stats = [
    {
      label: textByLanguage(language, 'Đã ghi có', 'Available'),
      value: !earnings
        ? pending
        : hasAvailableBalance
          ? formatCompactVnd(availableBalance, language)
          : textByLanguage(language, 'Chưa có', 'None'),
    },
    {
      label: textByLanguage(language, 'Chờ SePay', 'Awaiting SePay'),
      value: !earnings
        ? pending
        : pendingAmount > 0
          ? formatCompactVnd(pendingAmount, language)
          : textByLanguage(language, 'Không có', 'None'),
    },
    {
      label: textByLanguage(language, 'Hoa hồng hiện tại', 'Current commission'),
      value: !earnings || !commissionRate
        ? pending
        : `${commissionRate}${earnings.current_commission_level ? ` · ${textByLanguage(language, `Bậc ${earnings.current_commission_level}`, `Level ${earnings.current_commission_level}`)}` : ''}`,
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
            <Text style={styles.earningsHeroMeta} numberOfLines={2}>
              {!earnings
                ? textByLanguage(language, 'Đang chờ nguồn số dư thật', 'Waiting for the real balance source')
                : hasAvailableBalance
                  ? textByLanguage(language, 'Số dư trong tài khoản thợ trên ứng dụng', 'Worker in-app account balance')
                  : textByLanguage(language, 'Chỉ SePay xác thực mới ghi có số dư', 'Only verified SePay payments credit the balance')}
            </Text>
            <WorkerV5DetailRail
              items={!earnings
                ? [
                  { glyph: 'sync', label: textByLanguage(language, 'Chờ nguồn thật', 'Waiting for real source') },
                  { glyph: 'shield', label: textByLanguage(language, 'Chỉ hiện số liệu đã ghi sổ', 'Recorded figures only') },
                ]
                : hasAvailableBalance
                ? [
                  { glyph: 'check', label: textByLanguage(language, 'Đã ghi có trong ứng dụng', 'Credited in app') },
                  { glyph: 'shield', label: textByLanguage(language, 'Chưa chuyển ra ngân hàng', 'Not paid out to bank') },
                ]
                : [
                  { glyph: 'sync', label: pendingAmount > 0 ? textByLanguage(language, 'Chờ SePay xác thực', 'Awaiting SePay') : textByLanguage(language, 'Chờ đối soát', 'Waiting settlement') },
                  { glyph: 'shield', label: onHoldAmount > 0 ? textByLanguage(language, 'Có khoản tạm giữ', 'Funds on hold') : textByLanguage(language, 'Số liệu thật', 'Real figures only') },
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
  dataAvailable,
  documentIcon,
  emptyStateIcon,
  language,
  listAura: _listAura,
  recent,
  reduceTransparency,
}: {
  dataAvailable: boolean
  documentIcon: ImageSourcePropType
  emptyStateIcon: ImageSourcePropType
  language: AppLanguage
  listAura: WorkerV5EarningsAuraComponent
  recent: readonly WorkerV5EarningsTransaction[]
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
        <View key={row.job_id} style={styles.earningsTransactionRow} testID={`worker-v5-earnings-transaction-${index}`}>
          <WorkerV5IntegratedIcon bleed={13} image={documentIcon} reduceTransparency={reduceTransparency} tone="document" variant="panel" />
          <View style={styles.earningsTransactionCopy}>
            <Text style={styles.earningsTransactionTitle} numberOfLines={1}>
              {row.display_code ?? textByLanguage(language, 'Giao dịch công việc', 'Job transaction')}
            </Text>
            <WorkerV5DetailRail
              items={[
                { glyph: row.payment_state === 'available' ? 'check' : 'sync', label: paymentStateLabel(row.payment_state, language) },
                { glyph: 'money', label: textByLanguage(language, `Bậc ${row.commission_level} · phí ${formatCommissionRate(row.commission_rate_bps) ?? '—'}`, `Level ${row.commission_level} · fee ${formatCommissionRate(row.commission_rate_bps) ?? '—'}`) },
              ]}
              testID={`worker-v5-earnings-transaction-detail-${index}`}
            />
          </View>
          <Text style={styles.earningsTransactionAmount} numberOfLines={2} testID={`worker-v5-earnings-transaction-amount-${index}`}>
            {row.payment_state === 'available' ? '+' : ''}{formatVndDong(row.worker_net, language)}
          </Text>
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
            <Text style={styles.earningsTransactionTitle} numberOfLines={2} testID="worker-v5-earnings-empty-transaction-title">
              {dataAvailable
                ? textByLanguage(language, 'Chưa có giao dịch gần đây', 'No recent transactions')
                : textByLanguage(language, 'Chờ dữ liệu giao dịch thật', 'Transaction data pending')}
            </Text>
            <WorkerV5DetailRail
              items={[
                { glyph: 'sync', label: dataAvailable ? textByLanguage(language, 'Chờ đồng bộ', 'Waiting to sync') : textByLanguage(language, 'Chờ nguồn thật', 'Waiting for real source') },
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
