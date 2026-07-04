import type { ComponentType } from 'react'
import {
  Image,
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import { KaelTextField, MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerProfileResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import {
  WORKER_V5_BANK_OPTIONS,
  resolveWorkerV5BankLogoName,
  workerV5BankLabel,
  workerV5BankLogos,
  type WorkerV5BankLogoName,
} from './banks'
import { styles } from './payout-method-styles'

type WorkerV5PayoutMethodProfile = WorkerProfileResponse | null | undefined
type WorkerV5PayoutMethodAura = ComponentType<{ testID: string }>
type WorkerV5PayoutMethodIcons = Record<WorkerV5IconName, ImageSourcePropType>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5PayoutMethodHero({
  language,
  listAura: ListAura,
  profile,
  reduceTransparency,
  selectedBank,
  walletIcon,
}: {
  language: AppLanguage
  listAura: WorkerV5PayoutMethodAura
  profile: WorkerV5PayoutMethodProfile
  reduceTransparency: boolean
  selectedBank: WorkerV5BankLogoName | null
  walletIcon: ImageSourcePropType
}) {
  const profileBank = resolveWorkerV5BankLogoName(profile?.bank_name)
  const effectiveBank = selectedBank ?? profileBank
  const hasBank = Boolean(profile?.bank_account_masked && (!selectedBank || selectedBank === profileBank))
  const bankLogo = effectiveBank ? workerV5BankLogos[effectiveBank] : null
  const bankName = effectiveBank ? workerV5BankLabel(effectiveBank) : textByLanguage(language, 'Tài khoản nhận tiền', 'Payout account')
  const identity = profile?.legal_name?.trim() || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')
  return (
    <View style={[styles.payoutMethodHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-method-hero">
      {!reduceTransparency ? <ListAura testID="worker-v5-payout-method-mint-aura" /> : null}
      <View style={styles.payoutMethodLogoFrame}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image
          resizeMode="contain"
          source={bankLogo ?? walletIcon}
          style={bankLogo ? styles.payoutMethodLogoImage : styles.earningsHeroIcon}
          testID="worker-v5-payout-method-hero-logo"
        />
      </View>
      <View style={styles.payoutMethodHeroCopy}>
        <Text style={styles.opportunityTitle} numberOfLines={2} testID="worker-v5-payout-method-name">
          {hasBank ? `${bankName} · ${profile?.bank_account_masked}` : bankName}
        </Text>
        <Text style={styles.opportunityMeta} numberOfLines={2} testID="worker-v5-payout-method-account">
          {hasBank ? `${identity} · ${textByLanguage(language, 'mặc định', 'default')}` : textByLanguage(language, 'Nhập thông tin chủ tài khoản rồi kiểm tra trước xác thực.', 'Enter account owner details, then run pre-verification checks.')}
        </Text>
      </View>
      <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID="worker-v5-payout-method-status">
        {hasBank ? textByLanguage(language, 'Đã chọn', 'Selected') : textByLanguage(language, 'Chưa có', 'None')}
      </Text>
    </View>
  )
}

export function WorkerV5PayoutMethodBankGrid({
  language,
  listAura: ListAura,
  onSelectBank,
  profile,
  reduceTransparency,
  selectedBank,
}: {
  language: AppLanguage
  listAura: WorkerV5PayoutMethodAura
  onSelectBank: (bank: WorkerV5BankLogoName) => void
  profile: WorkerV5PayoutMethodProfile
  reduceTransparency: boolean
  selectedBank: WorkerV5BankLogoName | null
}) {
  const effectiveSelectedBank = selectedBank ?? resolveWorkerV5BankLogoName(profile?.bank_name)
  return (
    <View style={styles.payoutBankGrid} testID="worker-v5-payout-method-grid">
      {WORKER_V5_BANK_OPTIONS.map((item, index) => {
        const selected = effectiveSelectedBank === item.code
        return (
          <Pressable
            accessibilityLabel={textByLanguage(language, `Chọn ${item.label}`, `Choose ${item.label}`)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={item.code}
            onPress={() => onSelectBank(item.code)}
            style={[styles.payoutBankChip, reduceTransparency && styles.opaqueCard, selected ? styles.payoutBankChipSelected : null]}
            testID={`worker-v5-payout-method-bank-${index}`}
          >
            {!reduceTransparency ? <ListAura testID={`worker-v5-payout-method-bank-aura-${index}`} /> : null}
            <Image resizeMode="contain" source={workerV5BankLogos[item.code]} style={styles.payoutBankLogo} />
            <Text style={styles.srOnlyText} numberOfLines={2} testID={`worker-v5-payout-method-label-${index}`}>
              {textByLanguage(language, `Ngân hàng ${index + 1}`, `Bank ${index + 1}`)}
            </Text>
            <Text style={styles.srOnlyText} numberOfLines={2} testID={`worker-v5-payout-method-value-${index}`}>{selected ? textByLanguage(language, 'Đã chọn', 'Selected') : textByLanguage(language, 'Chưa liên kết', 'Not linked')}</Text>
            {selected ? (
              <View style={styles.payoutBankCheck}>
                <Text style={styles.payoutBankCheckText}>✓</Text>
              </View>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}

export function WorkerV5PayoutAccountManagementRows({
  accountFormOpen,
  icons,
  language,
  limitPolicyOpen,
  listAura: ListAura,
  onOpenAccountForm,
  onOpenLimitPolicy,
  profile,
  reduceTransparency,
}: {
  accountFormOpen: boolean
  icons: WorkerV5PayoutMethodIcons
  language: AppLanguage
  limitPolicyOpen: boolean
  listAura: WorkerV5PayoutMethodAura
  onOpenAccountForm: () => void
  onOpenLimitPolicy: () => void
  profile: WorkerV5PayoutMethodProfile
  reduceTransparency: boolean
}) {
  const rows = [
    {
      icon: 'wallet' as const,
      meta: textByLanguage(language, 'Xác minh chủ tài khoản trước khi dùng', 'Verify account ownership before use'),
      onPress: onOpenAccountForm,
      status: Boolean(profile?.bank_account_masked) ? textByLanguage(language, 'Đã ghi', 'Recorded') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Thêm tài khoản ngân hàng', 'Add bank account'),
      active: accountFormOpen,
    },
    {
      icon: 'shield' as const,
      meta: textByLanguage(language, 'Không đặt hạn mức cố định', 'No fixed withdrawal cap'),
      onPress: onOpenLimitPolicy,
      status: textByLanguage(language, 'Hệ thống', 'System'),
      title: textByLanguage(language, 'Giới hạn rút tiền', 'Payout limit'),
      active: limitPolicyOpen,
    },
  ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-account-management-list">
      {!reduceTransparency ? <ListAura testID="worker-v5-account-management-mint-aura" /> : null}
      {rows.map((row, index) => (
        <Pressable
          accessibilityLabel={row.title}
          accessibilityRole="button"
          accessibilityState={{ selected: row.active }}
          key={row.title}
          onPress={row.onPress}
          style={[styles.approvalDecisionRow, row.active ? styles.payoutAccountManagementRowActive : null]}
          testID={`worker-v5-account-management-row-${index}`}
        >
          <View style={styles.approvalDecisionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={icons[row.icon]} style={styles.approvalDecisionIcon} />
          </View>
          <View style={styles.approvalDecisionCopy}>
            <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-account-management-title-${index}`}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-account-management-meta-${index}`}>{row.meta}</Text>
          </View>
          <Text style={styles.chevronText}>›</Text>
        </Pressable>
      ))}
    </View>
  )
}

export function WorkerV5PayoutBankAccountForm({
  accountNumber,
  accountOwnerName,
  language,
  listAura: ListAura,
  onAccountNumberChange,
  onAccountOwnerNameChange,
  onPrecheck,
  precheckMessage,
  reduceTransparency,
  selectedBank,
}: {
  accountNumber: string
  accountOwnerName: string
  language: AppLanguage
  listAura: WorkerV5PayoutMethodAura
  onAccountNumberChange: (value: string) => void
  onAccountOwnerNameChange: (value: string) => void
  onPrecheck: () => void
  precheckMessage: string | null
  reduceTransparency: boolean
  selectedBank: WorkerV5BankLogoName | null
}) {
  return (
    <View style={[styles.payoutAccountFormCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-bank-account-form">
      {!reduceTransparency ? <ListAura testID="worker-v5-bank-account-form-mint-aura" /> : null}
      <Text style={styles.boundaryTitle} numberOfLines={2}>{textByLanguage(language, 'Thông tin tài khoản nhận tiền', 'Receiving account details')}</Text>
      <Text style={styles.boundaryBody} numberOfLines={2} testID="worker-v5-bank-account-selected-bank">
        {selectedBank ? workerV5BankLabel(selectedBank) : textByLanguage(language, 'Chưa chọn ngân hàng', 'No bank selected')}
      </Text>
      <KaelTextField
        inputShellStyle={styles.payoutAccountInputShell}
        labelStyle={styles.payoutAccountFieldLabel}
        label={textByLanguage(language, 'Tên chủ tài khoản', 'Account owner')}
        onChangeText={onAccountOwnerNameChange}
        placeholder={textByLanguage(language, 'Nhập đúng tên trên tài khoản ngân hàng', 'Enter the bank account holder name')}
        shellStyle={styles.payoutAccountInputStack}
        testID="worker-v5-bank-account-owner-input"
        value={accountOwnerName}
      />
      <KaelTextField
        inputMode="numeric"
        inputShellStyle={styles.payoutAccountInputShell}
        keyboardType="number-pad"
        labelStyle={styles.payoutAccountFieldLabel}
        label={textByLanguage(language, 'Số tài khoản', 'Account number')}
        onChangeText={onAccountNumberChange}
        placeholder={textByLanguage(language, 'Chỉ nhập chữ số', 'Digits only')}
        shellStyle={styles.payoutAccountInputStack}
        testID="worker-v5-bank-account-number-input"
        value={accountNumber}
      />
      {precheckMessage ? (
        <Text style={styles.payoutAccountPrecheckStatus} numberOfLines={3} testID="worker-v5-bank-account-precheck-status">{precheckMessage}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onPrecheck}
        style={({ pressed }) => [styles.payoutAccountPrecheckButton, pressed ? styles.pressed : null]}
        testID="worker-v5-bank-account-precheck-action"
      >
        <Text style={styles.payoutAccountPrecheckText}>{textByLanguage(language, 'Kiểm tra trước xác thực', 'Run pre-verification check')}</Text>
      </Pressable>
    </View>
  )
}
