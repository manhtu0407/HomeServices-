import type { ComponentType } from 'react'
import {
  Image,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'

import { formatVndDong, textByLanguage } from '../ui/format'
import { resolveWorkerV5BankLogo } from './banks'
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
  const balanceValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-request-hero">
      {!reduceTransparency ? <HeroAura testID="worker-v5-payout-request-mint-aura" /> : null}
      <View style={styles.earningsHeroMainRow}>
        <View style={styles.earningsHeroIconShell}>
          {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
          <Image resizeMode="contain" source={walletIcon} style={styles.earningsHeroIcon} />
        </View>
        <View style={styles.earningsHeroCopy}>
          <Text style={styles.earningsHeroMeta} numberOfLines={1}>{textByLanguage(language, 'Số dư khả dụng', 'Available balance')}</Text>
          <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-payout-request-amount">
            {formatVndDong(balanceValue, language)}
          </Text>
        </View>
      </View>
    </View>
  )
}

export function WorkerV5PayoutAccountCard({
  language,
  listAura: ListAura,
  profile,
  reduceTransparency,
  shieldIcon,
}: {
  language: AppLanguage
  listAura: WorkerV5PayoutRequestAura
  profile: WorkerV5PayoutRequestProfile
  reduceTransparency: boolean
  shieldIcon: ImageSourcePropType
}) {
  const hasBank = Boolean(profile?.bank_account_masked)
  const bankLogo = resolveWorkerV5BankLogo(profile?.bank_name)
  const bankName = profile?.bank_name || textByLanguage(language, 'Ngân hàng đã ghi', 'Recorded bank')
  return (
    <View style={[styles.bankCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-account-card">
      {!reduceTransparency ? <ListAura testID="worker-v5-payout-account-mint-aura" /> : null}
      <View style={styles.bankIconTile}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image source={bankLogo ?? shieldIcon} style={bankLogo ? styles.bankCardLogoImage : styles.utilityIcon} />
      </View>
      <View style={styles.opportunityTextColumn}>
        <Text style={styles.opportunityTitle} numberOfLines={2} testID="worker-v5-payout-account-title">{hasBank ? bankName : textByLanguage(language, 'Chưa có tài khoản xác minh', 'No verified account')}</Text>
        <Text style={styles.opportunityMeta} numberOfLines={2} testID="worker-v5-payout-account-meta">{hasBank ? profile?.bank_account_masked : textByLanguage(language, 'Dùng luồng xác minh hiện hữu trước khi rút tiền.', 'Use the existing verification flow before payout.')}</Text>
      </View>
      <Text style={styles.chevronText}>›</Text>
    </View>
  )
}
