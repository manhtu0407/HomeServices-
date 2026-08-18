import { View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import type { WorkerV5ScreenId } from '../dock/types'
import { WorkerV5CommissionPolicy } from './commission-policy-surfaces'
import {
  WorkerV5EarningsDashboard,
  WorkerV5EarningsWithdrawalArea,
  WorkerV5EarningsUtilities,
} from './salary-overview-surfaces'
import { WorkerV5ReceivingAccount } from './receiving-account-surfaces'
import { WorkerV5PayoutRequest } from './payout-request-surfaces'
import { WorkerV5TransactionHistory } from './transaction-history-surfaces'
import { styles } from './body-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

export function WorkerV5EarningsOverviewBody({
  language,
  navigateToScreen,
  reduceMotion,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceMotion: boolean
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  return (
    <View style={styles.sectionStack}>
      <WorkerV5EarningsDashboard
        earnings={runtime.workerEarnings}
        earningsError={runtime.workerEarningsError}
        language={language}
        onRetry={runtime.actions.workerRefresh}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5EarningsWithdrawalArea
        language={language}
        onOpen={() => navigateToScreen('4.3-payout-request')}
        reduceMotion={reduceMotion}
      />
      <WorkerV5EarningsUtilities
        accountIcon="earnings"
        commissionIcon="document"
        commissionRateBps={runtime.workerEarnings?.current_commission_rate_bps}
        historyIcon="activity"
        language={language}
        onOpenAccount={() => navigateToScreen('4.4-payout-method')}
        onOpenCommission={() => navigateToScreen('4.5-commission-policy')}
        onOpenHistory={() => navigateToScreen('4.2-ledger-detail')}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
      />
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
