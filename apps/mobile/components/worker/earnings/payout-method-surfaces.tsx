import type { ComponentType } from 'react'
import {
  Image,
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'

import { KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerProfileResponse } from '@/lib/api-types'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import {
  WorkerV5IntegratedIcon,
  type WorkerV5IntegratedIconTone,
} from '../ui/integrated-icon-surfaces'
import {
  WorkerV5DetailRail,
  type WorkerV5DetailRailItem,
} from '../ui/worker-v5-detail-rail'
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

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5PayoutMethodHero({
  language,
  listAura: _listAura,
  profile,
  receivingAccountIcon,
  reduceTransparency,
  selectedBank,
}: {
  language: AppLanguage
  listAura: WorkerV5PayoutMethodAura
  profile: WorkerV5PayoutMethodProfile
  receivingAccountIcon: ImageSourcePropType
  reduceTransparency: boolean
  selectedBank: WorkerV5BankLogoName | null
}) {
  const profileBank = resolveWorkerV5BankLogoName(profile?.bank_name)
  const effectiveBank = selectedBank ?? profileBank
  const hasBank = Boolean(profile?.bank_account_masked && (!selectedBank || selectedBank === profileBank))
  const bankName = effectiveBank ? workerV5BankLabel(effectiveBank) : textByLanguage(language, 'Tài khoản nhận tiền', 'Payout account')
  const identity = profile?.legal_name?.trim() || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')
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
          {hasBank ? `${identity} · ${textByLanguage(language, 'mặc định', 'default')}` : textByLanguage(language, 'Nhập thông tin chủ tài khoản rồi kiểm tra trước xác thực.', 'Enter account owner details, then run pre-verification checks.')}
        </Text>
        <WorkerV5DetailRail
          items={hasBank
            ? [
              { glyph: 'identity', label: textByLanguage(language, 'Chủ tài khoản', 'Account owner') },
              { glyph: 'check', label: textByLanguage(language, 'Đã xác minh', 'Verified') },
            ]
            : [
              { glyph: 'identity', label: textByLanguage(language, 'Chủ tài khoản', 'Account owner') },
              { glyph: 'shield', label: textByLanguage(language, 'Cần xác minh', 'Verification required') },
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
  accountIcon,
  accountFormOpen,
  language,
  limitIcon,
  limitPolicyOpen,
  listAura: _listAura,
  onOpenAccountForm,
  onOpenLimitPolicy,
  profile,
  reduceTransparency,
}: {
  accountIcon: ImageSourcePropType
  accountFormOpen: boolean
  language: AppLanguage
  limitIcon: ImageSourcePropType
  limitPolicyOpen: boolean
  listAura: WorkerV5PayoutMethodAura
  onOpenAccountForm: () => void
  onOpenLimitPolicy: () => void
  profile: WorkerV5PayoutMethodProfile
  reduceTransparency: boolean
}) {
  const hasBank = Boolean(profile?.bank_account_masked)
  const rows = [
    {
      detailItems: [
        { glyph: 'identity', label: textByLanguage(language, 'Chủ tài khoản', 'Account owner') },
        { glyph: hasBank ? 'check' : 'shield', label: hasBank ? textByLanguage(language, 'Đã ghi nhận', 'Recorded') : textByLanguage(language, 'Cần xác minh', 'Verification required') },
      ] satisfies readonly WorkerV5DetailRailItem[],
      icon: accountIcon,
      meta: textByLanguage(language, 'Xác minh chủ tài khoản trước khi dùng', 'Verify account ownership before use'),
      onPress: onOpenAccountForm,
      title: textByLanguage(language, 'Thêm tài khoản ngân hàng', 'Add bank account'),
      tone: 'money' as WorkerV5IntegratedIconTone,
      active: accountFormOpen,
    },
    {
      detailItems: [
        { glyph: 'shield', label: textByLanguage(language, 'Theo hệ thống', 'System policy') },
        { glyph: 'money', label: textByLanguage(language, 'Không mức cố định', 'No fixed cap') },
      ] satisfies readonly WorkerV5DetailRailItem[],
      icon: limitIcon,
      meta: textByLanguage(language, 'Không đặt hạn mức cố định', 'No fixed withdrawal cap'),
      onPress: onOpenLimitPolicy,
      title: textByLanguage(language, 'Giới hạn rút tiền', 'Payout limit'),
      tone: 'signal' as WorkerV5IntegratedIconTone,
      active: limitPolicyOpen,
    },
  ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-account-management-list">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="PayoutAccountManagement"
        testID="worker-v5-account-management-formula-mint-aura"
      />
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
          <WorkerV5IntegratedIcon
            bleed={12}
            image={row.icon}
            reduceTransparency={reduceTransparency}
            testID={`worker-v5-account-management-icon-${index}`}
            tone={row.tone}
            variant="panel"
          />
          <View style={styles.approvalDecisionCopy}>
            <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-account-management-title-${index}`}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-account-management-meta-${index}`}>{row.meta}</Text>
            <WorkerV5DetailRail
              items={row.detailItems}
              testID={`worker-v5-account-management-detail-${index}`}
            />
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
