import type { ComponentType } from 'react'
import { Text as RNText, View, type TextProps } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import { styles } from './payout-styles'

type WorkerV5PayoutEarnings = {
  net_earnings?: number | null
} | null | undefined

type WorkerV5PayoutListAuraComponent = ComponentType<{
  testID: string
}>

const workerV5PayoutAmountFormatters = {
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }),
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5PayoutAmountCard({
  earnings,
  language,
  listAura: ListAura,
  reduceTransparency,
}: {
  earnings: WorkerV5PayoutEarnings
  language: AppLanguage
  listAura: WorkerV5PayoutListAuraComponent
  reduceTransparency: boolean
}) {
  const amount = typeof earnings?.net_earnings === 'number'
    ? workerV5PayoutAmountFormatters[language].format(earnings.net_earnings)
    : textByLanguage(language, 'Chưa có dữ liệu', 'No data')
  return (
    <View style={[styles.payoutAmountInputCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-amount-card">
      {!reduceTransparency ? <ListAura testID="worker-v5-payout-amount-mint-aura" /> : null}
      <Text style={styles.payoutAmountInputValue} numberOfLines={2} testID="worker-v5-payout-amount-value">
        {amount}
      </Text>
      <Text style={styles.payoutAmountCurrency} numberOfLines={1}>
        đ
      </Text>
    </View>
  )
}

export function WorkerV5PayoutLimitPolicyCard({
  language,
  listAura: ListAura,
  reduceTransparency,
}: {
  language: AppLanguage
  listAura: WorkerV5PayoutListAuraComponent
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.payoutLimitPolicyCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-limit-policy">
      {!reduceTransparency ? <ListAura testID="worker-v5-payout-limit-policy-mint-aura" /> : null}
      <Text style={styles.boundaryTitle} numberOfLines={2}>{textByLanguage(language, 'Trạng thái chuyển tiền', 'Payout status')}</Text>
      <Text style={[styles.boundaryBody, styles.payoutLimitPolicyCopy]} numberOfLines={6} testID="worker-v5-payout-limit-policy-copy">
        {textByLanguage(
          language,
          'Luồng chuyển tiền và quản lý tài khoản ngân hàng chưa được bật trong ứng dụng. Số liệu đang hiển thị chỉ là thu nhập đã ghi nhận, không phải số dư có thể rút.',
          'Payouts and bank-account management are not enabled in the app. The figures shown are recorded earnings, not a withdrawable balance.',
        )}
      </Text>
    </View>
  )
}
