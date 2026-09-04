import { useState } from 'react'
import { Pressable, Text as RNText, View, type TextProps } from 'react-native'

import { LiquidNavIcon, type LiquidNavIconName } from '@/components/customer/dock/liquid-nav-icons'
import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse } from '@/lib/api-types'

import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import { textByLanguage } from '../ui/format'
import { WorkerIncomeDashboard } from './income-dashboard-surface'
import { workerIncomeDashboardTokens as incomeTokens } from './income-dashboard-tokens'
import type { WorkerEarningsPeriod } from './overview-model'
import { styles } from './salary-overview-styles'

type WorkerSalaryTokens = ReturnType<typeof getWorkerThemeTokens>
type WorkerV5EarningsUtilityIconName = Extract<LiquidNavIconName, 'activity' | 'document' | 'earnings' | 'withdrawal'>

function Text({ color, style, ...props }: TextProps & { color?: string }) {
  return <RNText {...props} style={[styles.workerCustomerFontText, color ? { color } : null, style]} />
}

function formatCommissionRate(rateBps: number | null | undefined) {
  if (typeof rateBps !== 'number' || !Number.isInteger(rateBps) || rateBps < 0) return null
  const whole = Math.floor(rateBps / 100)
  const decimal = rateBps % 100
  return decimal === 0 ? `${whole}%` : `${whole}.${String(decimal).padStart(2, '0')}%`
}

function surface(tokens: WorkerSalaryTokens) {
  return {
    backgroundColor: tokens.raised,
    borderColor: tokens.border,
  }
}

function utilitySurface(tokens: WorkerSalaryTokens) {
  return {
    backgroundColor: tokens.mode === 'light' ? incomeTokens.colors.contentSurface : tokens.raised,
    borderColor: tokens.mode === 'light' ? incomeTokens.colors.borderSoft : tokens.border,
  }
}

export function WorkerV5EarningsDataNotice({
  error,
  language,
  onRetry,
  reduceTransparency = false,
  retryTestID,
  testID,
}: {
  error: string | null
  language: AppLanguage
  onRetry: () => Promise<boolean>
  reduceTransparency?: boolean
  retryTestID: string
  testID: string
}) {
  const [retrying, setRetrying] = useState(false)
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens

  const retry = async () => {
    if (retrying) return
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  if (!error) return null

  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.dataNotice, surface(tokens)]} testID={testID}>
      <Text color={tokens.text} style={styles.dataNoticeTitle}>{textByLanguage(language, 'Chưa thể tải thông tin thu nhập', 'Earnings data is unavailable')}</Text>
      <Text color={tokens.muted} style={styles.dataNoticeBody}>{textByLanguage(language, 'Kiểm tra kết nối rồi thử lại. Số dư chưa được thay đổi.', 'Check your connection and try again. Your balance has not changed.')}</Text>
      <Pressable
        accessibilityLabel={textByLanguage(language, 'Thử lại tải thông tin thu nhập', 'Retry earnings data')}
        accessibilityRole="button"
        accessibilityState={{ disabled: retrying }}
        disabled={retrying}
        onPress={() => void retry()}
        style={({ pressed }) => [styles.dataNoticeRetry, { borderColor: tokens.borderStrong }, pressed && !retrying ? styles.pressed : null, retrying && styles.dataNoticeRetryDisabled]}
        testID={retryTestID}
      >
        <Text color={tokens.primary} style={styles.dataNoticeRetryLabel}>{retrying
          ? textByLanguage(language, 'Đang thử lại…', 'Retrying…')
          : textByLanguage(language, 'Thử lại', 'Try again')}</Text>
      </Pressable>
    </View>
  )
}

export function WorkerV5EarningsDashboard({
  earningsError,
  earnings,
  initialPeriod = 'month',
  language,
  onRetry,
  onWithdraw,
  reduceMotion,
  reduceTransparency,
}: {
  earnings: EarningsResponse | null | undefined
  earningsError: string | null
  initialPeriod?: WorkerEarningsPeriod
  language: AppLanguage
  onRetry: () => Promise<boolean>
  onWithdraw?: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.dashboard} testID="worker-v5-earnings-dashboard-stack">
      <WorkerIncomeDashboard
        earnings={earnings}
        earningsError={earningsError}
        initialPeriod={initialPeriod}
        language={language}
        onWithdraw={onWithdraw}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
      />
      {earningsError ? (
        <WorkerV5EarningsDataNotice
          error={earningsError}
          language={language}
          onRetry={onRetry}
          reduceTransparency={reduceTransparency}
          retryTestID="worker-v5-earnings-retry"
          testID="worker-v5-earnings-error"
        />
      ) : null}
    </View>
  )
}

function WorkerV5EarningsUtilityRow({
  detail,
  icon,
  onPress,
  reduceMotion,
  testID,
  title,
  tokens,
}: {
  detail: string
  icon: WorkerV5EarningsUtilityIconName
  onPress: () => void
  reduceMotion: boolean
  testID: string
  title: string
  tokens: WorkerSalaryTokens
}) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.utilityRow, pressed && !reduceMotion ? styles.pressed : null]}
      testID={testID}
    >
      <View style={styles.iconTile} testID={`${testID}-icon-tile`}>
        <LiquidNavIcon
          color={tokens.primary}
          name={icon}
          selected
          size={incomeTokens.layout.utilityIconSize}
          testID={`${testID}-icon`}
        />
      </View>
      <View style={styles.utilityCopy}>
        <Text color={tokens.text} style={styles.utilityTitle}>{title}</Text>
        <Text color={tokens.muted} style={styles.utilityDetail} testID={`${testID}-detail`}>{detail}</Text>
      </View>
      <Text color={tokens.primary} style={styles.utilityChevron}>›</Text>
    </Pressable>
  )
}

export function WorkerV5EarningsUtilities({
  accountIcon,
  commissionIcon,
  commissionRateBps,
  historyIcon,
  language,
  onOpenAccount,
  onOpenCommission,
  onOpenHistory,
  reduceMotion,
  reduceTransparency,
}: {
  accountIcon: WorkerV5EarningsUtilityIconName
  commissionIcon: WorkerV5EarningsUtilityIconName
  commissionRateBps?: number | null
  historyIcon: WorkerV5EarningsUtilityIconName
  language: AppLanguage
  onOpenAccount: () => void
  onOpenCommission: () => void
  onOpenHistory: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const commissionRate = formatCommissionRate(commissionRateBps)

  return (
    <View style={styles.utilitySection} testID="worker-v5-earnings-utilities-section">
      <View style={[styles.utilityCard, utilitySurface(tokens)]} testID="worker-v5-earnings-utilities">
        <WorkerV5EarningsUtilityRow detail={textByLanguage(language, 'Khoản ghi có và đối soát', 'Credits and reconciliation')} icon={historyIcon} onPress={onOpenHistory} reduceMotion={reduceMotion} testID="worker-v5-earnings-utility-history" title={textByLanguage(language, 'Lịch sử giao dịch', 'Transaction history')} tokens={tokens} />
        <View style={[styles.divider, { backgroundColor: tokens.border }]} />
        <WorkerV5EarningsUtilityRow detail={textByLanguage(language, 'Nơi nhận tiền của bạn', 'Where you receive funds')} icon={accountIcon} onPress={onOpenAccount} reduceMotion={reduceMotion} testID="worker-v5-earnings-utility-account" title={textByLanguage(language, 'Tài khoản nhận tiền', 'Receiving account')} tokens={tokens} />
        <View style={[styles.divider, { backgroundColor: tokens.border }]} />
        <WorkerV5EarningsUtilityRow detail={commissionRate ? textByLanguage(language, `Mức hiện tại ${commissionRate}`, `Current rate ${commissionRate}`) : textByLanguage(language, 'Theo giao dịch', 'Per transaction')} icon={commissionIcon} onPress={onOpenCommission} reduceMotion={reduceMotion} testID="worker-v5-earnings-utility-commission" title={textByLanguage(language, 'Chính sách hoa hồng', 'Commission policy')} tokens={tokens} />
      </View>
    </View>
  )
}
