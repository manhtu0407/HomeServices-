import { Image } from 'expo-image'
import { View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { useWorkerAmbassador } from '@/lib/frontend-workflow/use-worker-ambassador'
import { useWorkerViolations } from '@/lib/frontend-workflow/use-worker-violations'

import { WorkerV5Violations } from '../discipline/violation-surfaces'
import type { WorkerV5ScreenId } from '../dock/types'
import { WorkerV5Ambassador } from './ambassador-surfaces'
import { WorkerV5CommissionPolicy } from './commission-policy-surfaces'
import {
  WorkerV5EarningsDashboard,
  WorkerV5EarningsUtilities,
} from './salary-overview-surfaces'
import { WorkerV5ReceivingAccount } from './receiving-account-surfaces'
import { WorkerV5PayoutRequest } from './payout-request-surfaces'
import { WorkerV5TransactionHistory } from './transaction-history-surfaces'
import { styles } from './body-styles'
import { workerIncomeDashboardAssets } from './income-dashboard-tokens'
import type { WorkerEarningsPeriod } from './overview-model'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

export function WorkerV5EarningsOverviewBody({
  initialPeriod,
  language,
  navigateToScreen,
  reduceMotion,
  reduceTransparency,
  runtime,
}: {
  initialPeriod?: WorkerEarningsPeriod
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceMotion: boolean
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  return (
    <View style={styles.sectionStack} testID="worker-v5-earnings-overview-layout">
      <WorkerV5EarningsDashboard
        earnings={runtime.workerEarnings}
        earningsError={runtime.workerEarningsError}
        initialPeriod={initialPeriod}
        key={initialPeriod}
        language={language}
        onRetry={runtime.actions.workerRefresh}
        onWithdraw={() => navigateToScreen('4.3-payout-request')}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
      />
      <View style={styles.productionContent} testID="worker-v5-earnings-production-content">
        <Image
          accessible={false}
          contentFit="cover"
          pointerEvents="none"
          source={workerIncomeDashboardAssets.background}
          style={styles.productionBackground}
          testID="worker-v5-earnings-production-background"
        />
        <WorkerV5EarningsUtilities
          accountIcon="earnings"
          ambassadorIcon="balance"
          commissionIcon="document"
          commissionRateBps={runtime.workerEarnings?.current_commission_rate_bps}
          historyIcon="activity"
          language={language}
          onOpenAccount={() => navigateToScreen('4.4-payout-method')}
          onOpenAmbassador={() => navigateToScreen('4.6-ambassador')}
          onOpenCommission={() => navigateToScreen('4.5-commission-policy')}
          onOpenHistory={() => navigateToScreen('4.2-ledger-detail')}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
        />
      </View>
    </View>
  )
}

export function WorkerV5TransactionHistoryBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  return (
    <WorkerV5TransactionHistory
      earnings={runtime.workerEarnings}
      language={language}
      reduceTransparency={reduceTransparency}
    />
  )
}

export function WorkerV5CommissionPolicyBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  return (
    <WorkerV5CommissionPolicy
      earnings={runtime.workerEarnings}
      language={language}
      reduceTransparency={reduceTransparency}
    />
  )
}

export function WorkerV5PayoutRequestBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  return (
    <WorkerV5PayoutRequest
      language={language}
      reduceTransparency={reduceTransparency}
      runtime={runtime}
    />
  )
}

export function WorkerV5ReceivingAccountBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  return (
    <WorkerV5ReceivingAccount
      language={language}
      reduceTransparency={reduceTransparency}
      runtime={runtime}
    />
  )
}

export function WorkerV5AmbassadorBody({
  language,
  navigateToScreen,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
}) {
  const controller = useWorkerAmbassador()
  return (
    <WorkerV5Ambassador
      controller={controller}
      language={language}
      onOpenInviteCode={() => navigateToScreen('5.16-worker-invite-code')}
      onOpenViolations={() => navigateToScreen('4.7-violations')}
    />
  )
}

export function WorkerV5ViolationsBody({ language }: { language: AppLanguage }) {
  const controller = useWorkerViolations()
  return <WorkerV5Violations controller={controller} language={language} />
}
