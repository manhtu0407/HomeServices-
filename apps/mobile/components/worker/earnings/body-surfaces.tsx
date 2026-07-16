import type { ComponentType } from 'react'
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import type { WorkerV5IconName, WorkerV5ScreenId } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { workerV5CapturedIconAssets } from '../ui/worker-v5-icon-assets'
import {
  WorkerV5LedgerBreakdownCard,
  WorkerV5LedgerTraceTimeline,
} from './ledger-surfaces'
import {
  WorkerV5EarningsHero,
  WorkerV5EarningsTransactionList,
} from './overview-surfaces'
import { WorkerV5PayoutAmountCard } from './payout-surfaces'
import {
  WorkerV5PayoutAccountCard,
  WorkerV5PayoutRequestHero,
} from './payout-request-surfaces'
import {
  WorkerV5ActionRail,
  WorkerV5SingleSourceActionButton,
} from '../jobs/advisory-surfaces'
import { WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import type { WorkerV5StatusTimelineBaseProps } from '../jobs/timeline-surfaces'
import { styles } from './body-styles'
type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerV5IconMap = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5AuraComponent = ComponentType<{ testID: string }>
type WorkerV5ScopedAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>
type WorkerV5PrimaryFillComponent = ComponentType<{
  disabled: boolean
  variant?: 'default' | 'source'
}>
type WorkerV5StatusTimelineComponent = ComponentType<WorkerV5StatusTimelineBaseProps>
type WorkerV5LedgerHeroComponent = ComponentType<{
  earnings: WorkerV5Runtime['workerEarnings']
  language: AppLanguage
  reduceTransparency: boolean
}>
export function WorkerV5EarningsOverviewBody({
  caseWideAura,
  earningsHeroIcon,
  heroAura,
  icons,
  language,
  listAura,
  navigateToScreen,
  primaryFill,
  recentTransactionIcon,
  reduceTransparency,
  runtime,
  zipAura,
}: {
  caseWideAura: WorkerV5ScopedAuraComponent
  earningsHeroIcon: ImageSourcePropType
  heroAura: WorkerV5AuraComponent
  icons: WorkerV5IconMap
  language: AppLanguage
  listAura: WorkerV5AuraComponent
  navigateToScreen: (id: WorkerV5ScreenId) => void
  primaryFill: WorkerV5PrimaryFillComponent
  recentTransactionIcon: ImageSourcePropType
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  zipAura: WorkerV5ScopedAuraComponent
}) {
  const earnings = runtime.workerEarnings
  const recent = earnings?.daily_earnings?.slice(0, 3) ?? []

  return (
    <View style={styles.sectionStack}>
      <WorkerV5EarningsHero
        earnings={earnings}
        heroAura={heroAura}
        language={language}
        reduceTransparency={reduceTransparency}
        walletIcon={earningsHeroIcon}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Xem tất cả ›', 'View all ›')}
        title={textByLanguage(language, 'Giao dịch gần đây', 'Recent transactions')}
      />
      <WorkerV5EarningsTransactionList
        dataAvailable={Boolean(earnings)}
        documentIcon={icons.document}
        emptyStateIcon={recentTransactionIcon}
        language={language}
        listAura={listAura}
        recent={recent}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5ActionRail
        caseWideAura={caseWideAura}
        primaryButtonFill={primaryFill}
        zipAura={zipAura}
        auraTestID="worker-v5-earnings-action-rail-mint-aura"
        formulaAura
        onSecondary={() => navigateToScreen('4.2-ledger-detail')}
        primary={textByLanguage(language, 'Rút tiền chưa khả dụng', 'Payout unavailable')}
        primaryDisabled
        primaryTestID="worker-v5-earnings-withdraw-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Thu nhập ròng', 'Net earnings')}
        secondaryTestID="worker-v5-earnings-ledger-action"
      />
    </View>
  )
}

export function WorkerV5LedgerDetailBody({
  caseWideAura,
  language,
  ledgerHero: LedgerHero,
  listAura,
  primaryFill,
  reduceTransparency,
  runtime,
  statusTimeline,
  zipAura,
}: {
  caseWideAura: WorkerV5ScopedAuraComponent
  language: AppLanguage
  ledgerHero: WorkerV5LedgerHeroComponent
  listAura: WorkerV5AuraComponent
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  statusTimeline: WorkerV5StatusTimelineComponent
  zipAura: WorkerV5ScopedAuraComponent
}) {
  const earnings = runtime.workerEarnings
  return (
    <View style={styles.sectionStack}>
      <LedgerHero earnings={earnings} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Minh bạch', 'Transparent')}
        title={textByLanguage(language, 'Cấu phần giao dịch', 'Transaction breakdown')}
      />
      <WorkerV5LedgerBreakdownCard
        earnings={earnings}
        language={language}
        listAura={listAura}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Không thể sửa', 'Immutable')}
        title={textByLanguage(language, 'Dấu vết thanh toán', 'Payment trail')}
      />
      <WorkerV5LedgerTraceTimeline
        earnings={earnings}
        language={language}
        reduceTransparency={reduceTransparency}
        statusTimeline={statusTimeline}
      />
      <WorkerV5SingleSourceActionButton
        disabled
        primaryButtonFill={primaryFill}
        label={textByLanguage(language, 'Rút tiền chưa khả dụng', 'Payout unavailable')}
        onPress={() => undefined}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-ledger-payout-action"
      />
    </View>
  )
}

export function WorkerV5PayoutRequestBody({
  caseWideAura,
  heroAura,
  icons,
  language,
  listAura,
  primaryFill,
  reduceTransparency,
  runtime,
  zipAura,
}: {
  caseWideAura: WorkerV5ScopedAuraComponent
  heroAura: WorkerV5AuraComponent
  icons: WorkerV5IconMap
  language: AppLanguage
  listAura: WorkerV5AuraComponent
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  zipAura: WorkerV5ScopedAuraComponent
}) {
  const earnings = runtime.workerEarnings
  const profile = runtime.workerProfile
  const hasAccount = Boolean(profile?.bank_account_masked)
  return (
    <View style={styles.sectionStack}>
      <WorkerV5PayoutRequestHero
        earnings={earnings}
        heroAura={heroAura}
        language={language}
        reduceTransparency={reduceTransparency}
        walletIcon={icons.wallet}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Không phải số dư ví', 'Not a wallet balance')}
        title={textByLanguage(language, 'Thu nhập ròng đã ghi nhận', 'Recorded net earnings')}
      />
      <WorkerV5PayoutAmountCard
        earnings={earnings}
        language={language}
        listAura={listAura}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={hasAccount ? textByLanguage(language, 'Đã lưu', 'Recorded') : undefined}
        title={textByLanguage(language, 'Tài khoản nhận', 'Receiving account')}
      />
      <WorkerV5PayoutAccountCard
        accountIcon={workerV5CapturedIconAssets.payoutVerifiedAccount}
        language={language}
        listAura={listAura}
        profile={profile}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SingleSourceActionButton
        primaryButtonFill={primaryFill}
        disabled
        label={textByLanguage(language, 'Yêu cầu rút tiền chưa khả dụng', 'Payout requests unavailable')}
        onPress={() => undefined}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-payout-request-confirm-action"
      />
    </View>
  )
}
