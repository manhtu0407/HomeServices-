import { Text as RNText, View, type TextProps } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse } from '@/lib/api-types'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { formatVndDong, textByLanguage } from '../ui/format'
import { styles } from './transaction-history-styles'

type WorkerTransaction = EarningsResponse['recent_transactions'][number]

const transactionDateFormatter: Record<AppLanguage, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
  vi: new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function transactionTitle(transaction: WorkerTransaction, language: AppLanguage) {
  if (transaction.entry_type === 'cash_commission_debit') {
    return textByLanguage(language, 'Hoa hồng trả trực tiếp', 'Direct-payment commission')
  }
  return transaction.display_code || textByLanguage(language, 'Khoản thu từ công việc', 'Job earnings')
}

function transactionStatus(transaction: WorkerTransaction, language: AppLanguage) {
  const labels: Record<WorkerTransaction['payment_state'], { en: string; vi: string }> = {
    available: { en: 'Available', vi: 'Đã ghi có' },
    cash_collected: { en: 'Commission collected', vi: 'Đã thu hoa hồng' },
    cash_reconciliation_due: { en: 'Reconciliation pending', vi: 'Chờ đối soát' },
    on_hold: { en: 'On hold', vi: 'Đang tạm giữ' },
    pending: { en: 'Pending', vi: 'Đang xử lý' },
    reversed: { en: 'Reversed', vi: 'Đã hoàn lại' },
  }
  return labels[transaction.payment_state][language]
}

function transactionDate(value: string, language: AppLanguage) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return textByLanguage(language, 'Chưa rõ ngày', 'Date unavailable')
  return transactionDateFormatter[language].format(date)
}

function transactionAmount(transaction: WorkerTransaction, language: AppLanguage) {
  const isDebit = transaction.entry_type === 'cash_commission_debit'
  const value = isDebit
    ? transaction.cash_commission_collected || transaction.cash_commission_due || transaction.platform_fee
    : transaction.worker_net
  return `${isDebit ? '−' : '+'}${formatVndDong(Math.abs(value), language)}`
}

export function WorkerV5TransactionHistory({
  earnings,
  language,
  reduceTransparency,
}: {
  earnings: EarningsResponse | null | undefined
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const transactions = earnings?.recent_transactions ?? []
  const emptyTitle = earnings
    ? textByLanguage(language, 'Chưa có giao dịch', 'No transactions yet')
    : textByLanguage(language, 'Đang chờ dữ liệu giao dịch', 'Waiting for transaction data')
  const emptyDetail = earnings
    ? textByLanguage(language, 'Khoản thu đã đối soát sẽ xuất hiện tại đây.', 'Reconciled earnings will appear here.')
    : textByLanguage(language, 'Ứng dụng chỉ hiển thị những khoản đã được ghi nhận.', 'Only recorded entries are shown.')

  return (
    <View
      style={[styles.historyCard, reduceTransparency && styles.opaqueCard]}
      testID="worker-v5-transaction-history"
    >
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="TransactionHistory"
        testID="worker-v5-transaction-history-formula-mint-aura"
      />
      {transactions.length === 0 ? (
        <View style={styles.emptyState} testID="worker-v5-transaction-history-empty">
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyDetail}>{emptyDetail}</Text>
        </View>
      ) : transactions.map((transaction, index) => (
        <View
          key={`${transaction.job_id}-${transaction.recorded_at}-${transaction.entry_type}`}
          style={[styles.transactionRow, index === transactions.length - 1 && styles.transactionRowLast]}
          testID={`worker-v5-transaction-row-${index}`}
        >
          <View style={styles.transactionCopy}>
            <Text style={styles.transactionTitle}>{transactionTitle(transaction, language)}</Text>
            <Text style={styles.transactionMeta}>
              {transactionDate(transaction.recorded_at, language)} · {transactionStatus(transaction, language)}
            </Text>
          </View>
          <Text
            style={[
              styles.transactionAmount,
              transaction.entry_type === 'cash_commission_debit' && styles.transactionAmountDebit,
            ]}
          >
            {transactionAmount(transaction, language)}
          </Text>
        </View>
      ))}
    </View>
  )
}
