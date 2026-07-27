import type { ComponentType } from 'react'
import { Image } from 'expo-image'
import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { formatVndDong, textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'
import { styles } from './payout-request-styles'

type WorkerV5PayoutRequestEarnings = EarningsResponse | null | undefined
type WorkerV5PayoutRequestProfile = WorkerProfileResponse | null | undefined
type WorkerV5PayoutRequestAura = ComponentType<{ testID: string }>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5PayoutRequestHero({
  earnings,
  heroAura: HeroAura,
  language,
  reduceTransparency,
  walletIcon,
}: {
  earnings: WorkerV5PayoutRequestEarnings
  heroAura: WorkerV5PayoutRequestAura
  language: AppLanguage
  reduceTransparency: boolean
  walletIcon: ImageSourcePropType
}) {
  const availableBalance = typeof earnings?.available_balance === 'number'
    ? formatVndDong(earnings.available_balance, language)
    : textByLanguage(language, 'Chưa có dữ liệu', 'No data')
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-request-hero">
      {!reduceTransparency ? <HeroAura testID="worker-v5-payout-request-mint-aura" /> : null}
      <View style={styles.earningsHeroMainRow}>
        <View style={styles.earningsHeroIconShell}>
          {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
          <Image contentFit="contain" source={walletIcon} style={styles.earningsHeroIcon} />
        </View>
        <View style={styles.earningsHeroCopy}>
          <Text style={styles.earningsHeroMeta} numberOfLines={1}>{textByLanguage(language, 'Số dư tài khoản thợ trên ứng dụng', 'Worker in-app account balance')}</Text>
          <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-payout-request-amount">
            {availableBalance}
          </Text>
        </View>
      </View>
    </View>
  )
}

export function WorkerV5PayoutAccountCard({
  accountIcon,
  language,
  listAura: _listAura,
  profile,
  reduceTransparency,
}: {
  accountIcon: ImageSourcePropType
  language: AppLanguage
  listAura: WorkerV5PayoutRequestAura
  profile: WorkerV5PayoutRequestProfile
  reduceTransparency: boolean
}) {
  const hasBank = Boolean(profile?.bank_account_masked)
  const bankName = profile?.bank_name || textByLanguage(language, 'Ngân hàng đã lưu', 'Recorded bank')
  return (
    <View style={[styles.bankCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-account-card">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="PayoutVerifiedAccount"
        testID="worker-v5-payout-account-formula-mint-aura"
      />
      <WorkerV5IntegratedIcon
        bleed={12}
        image={accountIcon}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-payout-account-icon"
        tone="identity"
        variant="panel"
      />
      <View style={styles.opportunityTextColumn} testID="worker-v5-payout-account-copy">
        <Text style={styles.opportunityTitle} numberOfLines={2} testID="worker-v5-payout-account-title">{hasBank ? bankName : textByLanguage(language, 'Chưa có tài khoản đã lưu', 'No recorded account')}</Text>
        <Text style={styles.opportunityMeta} numberOfLines={2} testID="worker-v5-payout-account-meta">{hasBank ? profile?.bank_account_masked : textByLanguage(language, 'Có thể lưu tài khoản nhận tiền trong hồ sơ; yêu cầu rút tiền hiện chưa khả dụng.', 'You can record a receiving account in the profile; payout requests are unavailable.')}</Text>
        <WorkerV5DetailRail
          items={hasBank
            ? [
              { glyph: 'document', label: textByLanguage(language, 'Tài khoản hồ sơ', 'Profile account') },
              { glyph: 'money', label: textByLanguage(language, 'Rút tiền chưa khả dụng', 'Payout unavailable') },
            ]
            : [
              { glyph: 'shield', label: textByLanguage(language, 'Chưa lưu', 'Not recorded') },
              { glyph: 'money', label: textByLanguage(language, 'Rút tiền chưa khả dụng', 'Payout unavailable') },
            ]}
          testID="worker-v5-payout-account-detail"
        />
      </View>
      <Text style={styles.chevronText}>›</Text>
    </View>
  )
}
