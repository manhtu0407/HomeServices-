import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { WorkerProfileResponse } from '@/lib/api-types'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import { WorkerV5SingleSourceActionButton } from '../jobs/advisory-surfaces'
import { WorkerV5EarningsHomeListAura, WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import { WorkerV5PrimaryButtonFill, WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'
import { workerV5CapturedIconAssets } from '../ui/worker-v5-icon-assets'
import { resolveWorkerV5BankLogoName, workerV5BankLabel } from './banks'
import { styles } from './payout-method-styles'
import { WorkerV5PayoutLimitPolicyCard } from './payout-surfaces'

type WorkerV5PayoutMethodProfile = WorkerProfileResponse | null | undefined
type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5PayoutMethodHero({
  language,
  profile,
  receivingAccountIcon,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5PayoutMethodProfile
  receivingAccountIcon: ImageSourcePropType
  reduceTransparency: boolean
}) {
  const profileBank = resolveWorkerV5BankLogoName(profile?.bank_name)
  const hasBank = Boolean(profile?.bank_account_masked)
  const bankName = profileBank ? workerV5BankLabel(profileBank) : textByLanguage(language, 'Tài khoản ngân hàng', 'Bank account')
  return (
    <View style={[styles.payoutMethodHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-method-hero">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="PayoutMethodHero"
        testID="worker-v5-payout-method-hero-formula-mint-aura"
      />
      <WorkerV5IntegratedIcon
        bleed={12}
        image={receivingAccountIcon}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-payout-method-hero-icon"
        tone="money"
        variant="panel"
      />
      <View style={styles.payoutMethodHeroCopy}>
        <Text style={styles.opportunityTitle} numberOfLines={2} testID="worker-v5-payout-method-name">
          {hasBank ? `${bankName} · ${profile?.bank_account_masked}` : bankName}
        </Text>
        <Text style={styles.opportunityMeta} numberOfLines={2} testID="worker-v5-payout-method-account">
          {hasBank ? textByLanguage(language, 'Dữ liệu tài khoản đang được ghi nhận trong hồ sơ.', 'Account data is recorded in the profile.') : textByLanguage(language, 'Chưa có tài khoản ngân hàng được ghi nhận trong hồ sơ.', 'No bank account is recorded in the profile.')}
        </Text>
        <WorkerV5DetailRail
          items={hasBank
            ? [
              { glyph: 'document', label: textByLanguage(language, 'Dữ liệu hồ sơ', 'Profile data') },
              { glyph: 'check', label: textByLanguage(language, 'Đã ghi nhận', 'Recorded') },
            ]
            : [
              { glyph: 'document', label: textByLanguage(language, 'Chưa ghi nhận', 'Not recorded') },
              { glyph: 'money', label: textByLanguage(language, 'Chuyển tiền chưa khả dụng', 'Payout unavailable') },
            ]}
          testID="worker-v5-payout-method-hero-detail"
        />
      </View>
      <Text style={styles.payoutMethodStatus} numberOfLines={1} testID="worker-v5-payout-method-status">
        {hasBank ? textByLanguage(language, 'Đã chọn', 'Selected') : textByLanguage(language, 'Chưa có', 'None')}
      </Text>
    </View>
  )
}

export function WorkerV5PayoutMethodBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  return (
    <View style={styles.sectionStack}>
      <WorkerV5PayoutMethodHero
        language={language}
        profile={profile}
        receivingAccountIcon={workerV5CapturedIconAssets.payoutReceivingAccount}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Chưa khả dụng', 'Unavailable')}
        title={textByLanguage(language, 'Trạng thái tài khoản', 'Account status')}
      />
      <WorkerV5PayoutLimitPolicyCard
        language={language}
        listAura={WorkerV5EarningsHomeListAura}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SingleSourceActionButton
        primaryButtonFill={WorkerV5PrimaryButtonFill}
        disabled
        label={textByLanguage(language, 'Quản lý tài khoản chưa khả dụng', 'Account management unavailable')}
        onPress={() => undefined}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-payout-method-use-action"
      />
    </View>
  )
}
