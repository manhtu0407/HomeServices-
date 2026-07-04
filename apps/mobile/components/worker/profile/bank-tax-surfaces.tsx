import type { ComponentType } from 'react'
import {
  Image,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import { WorkerV5FinalChecklistCard } from '../jobs/completion-surfaces'
import { formatDateRange, formatVnd, textByLanguage } from '../ui/format'
import { workerDocumentSummary } from '../ui/labels'
import { resolveWorkerV5BankLogo } from '../earnings/banks'
import { styles } from './bank-tax-styles'

type WorkerV5BankTaxEarnings = EarningsResponse | null | undefined
type WorkerV5BankTaxProfile = WorkerProfileResponse | null | undefined
type WorkerV5BankTaxIcons = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5BankTaxChecklistAura = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5BankTaxHero({
  earnings,
  language,
  profile,
  reduceTransparency,
  walletIcon,
}: {
  earnings: WorkerV5BankTaxEarnings
  language: AppLanguage
  profile: WorkerV5BankTaxProfile
  reduceTransparency: boolean
  walletIcon: ImageSourcePropType
}) {
  const hasBank = Boolean(profile?.bank_account_masked)
  const bankLogo = resolveWorkerV5BankLogo(profile?.bank_name)
  const available = earnings?.net_earnings && earnings.net_earnings > 0
    ? formatVnd(earnings.net_earnings, language)
    : textByLanguage(language, 'Chưa có số dư thật', 'No real balance')
  const identity = profile?.legal_name?.trim() || textByLanguage(language, 'Chưa có tên pháp lý', 'No legal name')
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-bank-tax-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.earningsHeroAura} testID="worker-v5-bank-tax-mint-aura" /> : null}
      <View style={styles.earningsHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image
          resizeMode="contain"
          source={bankLogo ?? walletIcon}
          style={bankLogo ? styles.bankLogoImage : styles.earningsHeroIcon}
          testID="worker-v5-bank-tax-logo"
        />
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-bank-tax-status">{hasBank ? textByLanguage(language, 'Tài khoản đã ghi', 'Account recorded') : textByLanguage(language, 'Cần xác minh', 'Verification needed')}</Text>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-bank-tax-title">
          {hasBank ? profile?.bank_name || textByLanguage(language, 'Tài khoản nhận tiền', 'Payout account') : textByLanguage(language, 'Ngân hàng và thuế', 'Bank and tax')}
        </Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2} testID="worker-v5-bank-tax-account">
          {hasBank ? `${profile?.bank_account_masked} · ${identity}` : textByLanguage(language, 'Tài khoản nhận tiền sẽ hiện sau khi xác minh.', 'Payout account appears after verification.')}
        </Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2} testID="worker-v5-bank-tax-available">{available}</Text>
      </View>
    </View>
  )
}

export function WorkerV5PayoutRulesList({
  earnings,
  icons,
  language,
  reduceTransparency,
}: {
  earnings: WorkerV5BankTaxEarnings
  icons: WorkerV5BankTaxIcons
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const hasSettledBalance = Boolean(earnings?.net_earnings && earnings.net_earnings > 0)
  const hasPending = Boolean(earnings?.pending_payment_amount && earnings.pending_payment_amount > 0)
  const rows = [
    {
      icon: 'wallet' as const,
      meta: hasSettledBalance ? formatVnd(earnings?.net_earnings ?? 0, language) : textByLanguage(language, 'Chờ việc đóng và đối soát thật', 'Waiting for real work closure and settlement'),
      status: hasSettledBalance ? textByLanguage(language, 'Có thể rút', 'Available') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Số dư có thể rút', 'Withdrawable balance'),
    },
    {
      icon: 'clock' as const,
      meta: hasPending ? formatVnd(earnings?.pending_payment_amount ?? 0, language) : textByLanguage(language, 'Không có khoản đang chờ', 'No pending amount'),
      status: textByLanguage(language, 'Theo hệ thống', 'System-led'),
      title: textByLanguage(language, 'Chu kỳ chuyển tiền', 'Payout cycle'),
    },
    {
      icon: 'document' as const,
      meta: earnings?.total_jobs_paid && earnings.total_jobs_paid > 0
        ? formatDateRange(earnings.from_date, earnings.to_date, language)
        : textByLanguage(language, 'Chưa có chứng từ thu nhập được đồng bộ', 'No synced income document'),
      status: earnings?.total_jobs_paid && earnings.total_jobs_paid > 0 ? textByLanguage(language, 'Đã ghi', 'Recorded') : textByLanguage(language, 'Chưa có', 'None'),
      title: textByLanguage(language, 'Chứng từ thu nhập', 'Income document'),
    },
  ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-rules-list">
      {rows.map((row, index) => (
        <View key={row.title} style={styles.approvalDecisionRow}>
          <View style={styles.approvalDecisionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={icons[row.icon]} style={styles.approvalDecisionIcon} />
          </View>
          <View style={styles.approvalDecisionCopy}>
            <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-payout-rule-title-${index}`}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-payout-rule-meta-${index}`}>{row.meta}</Text>
          </View>
          <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID={`worker-v5-payout-rule-status-${index}`}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5AccountChangeGuard({
  caseWideAura,
  language,
  profile,
  reduceTransparency,
  zipAura,
}: {
  caseWideAura: WorkerV5BankTaxChecklistAura
  language: AppLanguage
  profile: WorkerV5BankTaxProfile
  reduceTransparency: boolean
  zipAura: WorkerV5BankTaxChecklistAura
}) {
  const checks = [
    {
      done: Boolean(profile?.has_cccd && profile?.has_selfie),
      meta: textByLanguage(language, 'Định danh', 'Identity'),
      title: textByLanguage(language, 'Yêu cầu sinh trắc hoặc định danh hồ sơ', 'Biometric or profile identity is required'),
    },
    {
      done: Boolean(profile?.bank_account_masked),
      meta: textByLanguage(language, 'Tài khoản', 'Account'),
      title: textByLanguage(language, 'Có tài khoản nhận tiền đang ghi nhận', 'A payout account is recorded'),
    },
    {
      done: false,
      meta: textByLanguage(language, 'Không tự đổi', 'No auto-change'),
      title: textByLanguage(language, 'Đổi tài khoản cần xác minh lại trước khi rút tiền', 'Changing account requires re-verification before payout'),
    },
  ]
  return (
    <View testID="worker-v5-account-change-guard">
      <WorkerV5FinalChecklistCard
        caseWideAura={caseWideAura}
        checks={checks}
        reduceTransparency={reduceTransparency}
        zipAura={zipAura}
      />
    </View>
  )
}

export function WorkerV5BankChipGrid({
  items,
  reduceTransparency,
}: {
  items: ReadonlyArray<{ label: string; selected: boolean; value: string }>
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.bankChipGrid} testID="worker-v5-bank-chip-grid">
      {items.map((item, index) => (
        <View key={`${item.label}-${item.value}`} style={[styles.bankChip, reduceTransparency && styles.opaqueCard, item.selected ? styles.bankChipSelected : null]} testID={`worker-v5-bank-chip-${index}`}>
          <Text style={styles.bankChipLabel} numberOfLines={1}>{item.label}</Text>
          <Text style={styles.bankChipValue} numberOfLines={1}>{item.value}</Text>
          {item.selected ? (
            <View style={styles.bankChipCheck}>
              <Text style={styles.bankChipCheckText}>✓</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  )
}
