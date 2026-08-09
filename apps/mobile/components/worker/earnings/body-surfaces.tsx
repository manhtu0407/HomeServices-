import type { ComponentType } from 'react'
import { View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import type { WorkerV5ScreenId } from '../dock/types'
import { WorkerV5SingleSourceActionButton } from '../jobs/advisory-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5CapturedIconAssets } from '../ui/worker-v5-icon-assets'
import { WorkerV5CommissionPolicy } from './commission-policy-surfaces'
import {
  WorkerV5EarningsDashboard,
  WorkerV5EarningsUtilities,
} from './overview-surfaces'
import { WorkerV5ReceivingAccount } from './receiving-account-surfaces'
import { WorkerV5PayoutRequest } from './payout-request-surfaces'
import { WorkerV5TransactionHistory } from './transaction-history-surfaces'
import { styles } from './body-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerV5PrimaryFillComponent = ComponentType<{
  disabled: boolean
  variant?: 'default' | 'source'
}>

export function WorkerV5EarningsOverviewBody({
  language,
  navigateToScreen,
  primaryFill,
  reduceMotion,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  primaryFill: WorkerV5PrimaryFillComponent
  reduceMotion: boolean
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  return (
    <View style={styles.sectionStack}>
      <WorkerV5EarningsDashboard
        earnings={runtime.workerEarnings}
        language={language}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5EarningsUtilities
        accountIcon={workerV5CapturedIconAssets.earningsReceivingAccount}
        commissionIcon={workerV5CapturedIconAssets.earningsCommissionPolicy}
        historyIcon={workerV5CapturedIconAssets.earningsTransactionHistory}
        language={language}
        onOpenAccount={() => navigateToScreen('4.4-payout-method')}
        onOpenCommission={() => navigateToScreen('4.5-commission-policy')}
        onOpenHistory={() => navigateToScreen('4.2-ledger-detail')}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SingleSourceActionButton
        disabled={false}
        label={textByLanguage(language, 'Tạo yêu cầu rút tiền', 'Create withdrawal request')}
        onPress={() => navigateToScreen('4.3-payout-request')}
        primaryButtonFill={primaryFill}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-earnings-withdraw-action"
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
