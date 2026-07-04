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
  const balanceValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  const amount = new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 0 }).format(balanceValue)
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
      <Text style={styles.boundaryTitle} numberOfLines={2}>{textByLanguage(language, 'Chính sách giới hạn rút tiền', 'Withdrawal limit policy')}</Text>
      <Text style={[styles.boundaryBody, styles.payoutLimitPolicyCopy]} numberOfLines={6} testID="worker-v5-payout-limit-policy-copy">
        {textByLanguage(
          language,
          'NestScout không đặt hạn mức rút tiền cố định cho thợ. Mỗi yêu cầu rút tiền được xử lý theo số dư thật, tài khoản nhận tiền đã xác minh, trạng thái bảo mật và quy định vận hành hiện hành. Khi cần bảo vệ tài khoản hoặc tuân thủ pháp luật, hệ thống có thể yêu cầu kiểm tra bổ sung trước khi giải ngân.',
          'NestScout does not set a fixed worker withdrawal cap. Each payout request is processed against the real balance, a verified receiving account, security status, and current operating rules. Additional checks may be required before disbursement to protect the account or meet compliance needs.',
        )}
      </Text>
    </View>
  )
}
