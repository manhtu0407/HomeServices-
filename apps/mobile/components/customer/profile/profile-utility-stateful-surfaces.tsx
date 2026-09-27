import { Image } from 'expo-image'
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { KaelButton, KaelTextInput } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21BankAssets, type CustomerV21BankKey } from '../ui/assets'
import { customerV21ProfilePaymentStyles as profilePaymentStyles } from './profile-payment-styles'
import type {
  PaymentBankOption,
  RootProfileUtilityStyles,
} from './profile-utility-models'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { RefundAccountFeedback, RefundAccountUsageNotice } from './profile-refund-account-feedback'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'
import { V21Card } from '../ui/shared-surfaces'
import { ProfileSettingsGlyph } from './profile-settings-icons'

export function ProfileUtilityAddressView({
  addressMessage,
  addressMessageColor,
  addressOptions,
  addressSaving,
  currentDefaultAddress,
  dataPendingLabel,
  defaultAddressDraft,
  defaultDraftChanged,
  defaultStatusLabel,
  defaultStatusSaved,
  hasSavedDefaultAddress,
  language,
  onDefaultAddressChange,
  onMakeDefaultAddress,
  onSaveDefaultAddress,
  onSaveSecondaryAddress,
  onSecondaryAddressChange,
  rootStyles,
  savedAddressesCountLabel,
  secondaryAddressDraft,
  textInputNoOutlineStyle,
  title,
  tokens,
}: {
  addressMessage: string | null
  addressMessageColor: string
  addressOptions: string[]
  addressSaving: boolean
  currentDefaultAddress: string
  dataPendingLabel: string
  defaultAddressDraft: string
  defaultDraftChanged: boolean
  defaultStatusLabel: string
  defaultStatusSaved: boolean
  hasSavedDefaultAddress: boolean
  language: AppLanguage
  onDefaultAddressChange: (value: string) => void
  onMakeDefaultAddress: (address: string) => void
  onSaveDefaultAddress: () => void
  onSaveSecondaryAddress: () => void
  onSecondaryAddressChange: (value: string) => void
  rootStyles: RootProfileUtilityStyles
  savedAddressesCountLabel: string
  secondaryAddressDraft: string
  textInputNoOutlineStyle: StyleProp<TextStyle>
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={profileUtilityStyles.profileUtilityStack} testID="customer-v21-profile-utility-address-screen">
      <V21Card
        style={[profileUtilityStyles.profileAddressSimpleCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-v21-profile-address-hub"
      >
        <View accessibilityLabel={title} style={profileUtilityStyles.profileAddressSimpleHeader} testID="customer-v21-profile-address-header">
          <View
            style={[profileUtilityStyles.profileAddressSimpleHeaderIcon, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
            testID="customer-v21-profile-address-header-icon"
          >
            <ProfileSettingsGlyph color={tokens.primary} name="address" testID="customer-v21-profile-address-header-icon-glyph" />
          </View>
          <View style={profileUtilityStyles.profileAddressSimpleHeaderCopy}>
            <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>
              {language === 'vi' ? 'Quản lý địa chỉ dịch vụ' : 'Manage service addresses'}
            </Text>
            <Text style={[rootStyles.bodyText, { color: tokens.muted }]}>
              {language === 'vi' ? 'Cập nhật nơi NestScout sẽ phục vụ bạn.' : 'Update where NestScout will provide service.'}
            </Text>
          </View>
        </View>

        <View style={profileUtilityStyles.profileAddressBlock}>
          <View style={profileUtilityStyles.profileAddressBlockHeader}>
            <Text style={[rootStyles.profileInsightTitle, { color: tokens.text }]}>{language === 'vi' ? 'Địa chỉ mặc định' : 'Default address'}</Text>
            <Text style={[profileUtilityStyles.profileAddressHint, { color: defaultStatusSaved || defaultDraftChanged ? tokens.primary : tokens.muted }]}>
              {defaultStatusLabel || dataPendingLabel}
            </Text>
            {defaultDraftChanged && currentDefaultAddress ? (
              <Text style={[profileUtilityStyles.profileAddressHint, { color: tokens.primary }]}>
                {language === 'vi' ? 'Bấm lưu để đặt mặc định' : 'Save to set default'}
              </Text>
            ) : hasSavedDefaultAddress ? (
              <Text style={[profileUtilityStyles.profileAddressHint, { color: tokens.muted }]}>
                {language === 'vi' ? 'Thợ nhận khi đơn được chấp nhận' : 'Shared after acceptance'}
              </Text>
            ) : null}
          </View>
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Địa chỉ mặc định' : 'Default address'}
            onChangeText={onDefaultAddressChange}
            placeholder={language === 'vi' ? 'Ví dụ: Tòa A, Quận 7' : 'Example: Tower A, District 7'}
            placeholderTextColor={tokens.subtleText}
            style={[profileUtilityStyles.profileAddressSimpleInput, textInputNoOutlineStyle, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
            testID="customer-v21-profile-default-address-input"
            value={defaultAddressDraft}
          />
          <KaelButton
            disabled={addressSaving || currentDefaultAddress.length === 0}
            label={addressSaving ? (language === 'vi' ? 'Đang lưu' : 'Saving') : (language === 'vi' ? 'Lưu mặc định' : 'Save default')}
            onPress={onSaveDefaultAddress}
            showPrimaryGradient={false}
            style={[
              profileUtilityStyles.profileAddressSaveDefaultButton,
              currentDefaultAddress.length > 0 && !addressSaving ? profileUtilityStyles.profileAddressSaveDefaultButtonActive : null,
            ]}
            testID="customer-v21-profile-default-address-save"
          />
        </View>

        <View style={[profileUtilityStyles.profileAddressDivider, { backgroundColor: tokens.border }]} />

        <View style={profileUtilityStyles.profileAddressBlock}>
          <View style={profileUtilityStyles.profileAddressBlockHeader}>
            <Text style={[rootStyles.profileInsightTitle, { color: tokens.text }]}>{language === 'vi' ? 'Địa chỉ phụ' : 'Secondary addresses'}</Text>
            <Text style={[profileUtilityStyles.profileAddressHint, { color: tokens.primary }]}>{savedAddressesCountLabel}</Text>
          </View>
          <View style={profileUtilityStyles.profileAddressAddRow}>
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Địa chỉ phụ' : 'Secondary address'}
              onChangeText={onSecondaryAddressChange}
              placeholder={language === 'vi' ? 'Thêm địa chỉ phụ' : 'Add secondary address'}
              placeholderTextColor={tokens.subtleText}
              style={[profileUtilityStyles.profileAddressSimpleInput, rootStyles.flex, { minWidth: 0 }, textInputNoOutlineStyle, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-secondary-address-input"
              value={secondaryAddressDraft}
            />
            <KaelButton
              disabled={addressSaving || secondaryAddressDraft.trim().length === 0}
              label={language === 'vi' ? 'Lưu' : 'Save'}
              onPress={onSaveSecondaryAddress}
              size="small"
              style={profileUtilityStyles.profileAddressAddButton}
              testID="customer-v21-profile-secondary-address-save"
            />
          </View>
          {addressOptions.length > 0 ? (
            <View style={profileUtilityStyles.profileAddressSavedList} testID="customer-v21-profile-address-list">
              {addressOptions.map((address, index) => {
                const isDefault = address === currentDefaultAddress
                return (
                  <View
                    key={`${address}-${index}`}
                    style={[profileUtilityStyles.profileAddressSavedRow, { borderColor: tokens.border }]}
                    testID={`customer-v21-profile-secondary-address-${index}`}
                  >
                    <View
                      style={[profileUtilityStyles.profileAddressSimpleSavedIcon, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
                      testID={`customer-v21-profile-secondary-address-icon-${index}`}
                    >
                      <ProfileSettingsGlyph color={tokens.primary} name="address" />
                    </View>
                    <View style={rootStyles.flex}>
                      <Text numberOfLines={1} style={[rootStyles.profileInsightTitle, { color: tokens.text }]}>
                        {isDefault ? (language === 'vi' ? 'Mặc định' : 'Default') : (language === 'vi' ? `Địa chỉ ${index + 1}` : `Address ${index + 1}`)}
                      </Text>
                      <Text numberOfLines={2} style={[rootStyles.bodyText, { color: tokens.muted }]}>{address}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isDefault}
                      onPress={() => onMakeDefaultAddress(address)}
                      style={[
                        profileUtilityStyles.profileAddressDefaultButton,
                        {
                          backgroundColor: isDefault ? 'rgba(22, 199, 180, 0.13)' : tokens.raised,
                          borderColor: isDefault ? tokens.primary : tokens.border,
                          opacity: isDefault ? 0.86 : 1,
                        },
                      ]}
                      testID={`customer-v21-profile-secondary-address-default-${index}`}
                    >
                      <Text style={[profileUtilityStyles.profileAddressDefaultText, { color: isDefault ? tokens.primary : tokens.muted }]}>
                        {isDefault ? (language === 'vi' ? 'Mặc định' : 'Default') : (language === 'vi' ? 'Đặt mặc định' : 'Make default')}
                      </Text>
                    </Pressable>
                  </View>
                )
              })}
            </View>
          ) : null}
        </View>
        {addressMessage ? <Text style={[profileUtilityStyles.profileAddressMessage, { color: addressMessageColor }]} testID="customer-v21-profile-address-message">{addressMessage}</Text> : null}
      </V21Card>
    </View>
  )
}

export function ProfileUtilityPaymentView({
  accountConfirmBorderColor,
  accountNameDraft,
  accountNumberConfirmDraft,
  accountNumberDraft,
  bankCountLabel,
  confirmedPaymentAccountMasked,
  confirmedPaymentBankKey,
  confirmedPaymentBankName,
  confirmedPaymentReady,
  confirmedPaymentStatus,
  dataPendingLabel,
  language,
  onAccountConfirmChange,
  onAccountNameChange,
  onAccountNumberChange,
  onBankSelect,
  onSave,
  paymentAccountConfirm,
  paymentAccountMatches,
  paymentBankOptions,
  paymentCanSave,
  paymentConfirmationReady,
  paymentMessage,
  paymentMessageTone,
  paymentSaving,
  reduceMotion,
  rootStyles,
  selectedBankKey,
  textInputNoOutlineStyle,
  tokens,
}: {
  accountConfirmBorderColor: string
  accountNameDraft: string
  accountNumberConfirmDraft: string
  accountNumberDraft: string
  bankCountLabel: string
  confirmedPaymentAccountMasked: string
  confirmedPaymentBankKey: CustomerV21BankKey | null
  confirmedPaymentBankName: string
  confirmedPaymentReady: boolean
  confirmedPaymentStatus: string
  dataPendingLabel: string
  language: AppLanguage
  onAccountConfirmChange: (value: string) => void
  onAccountNameChange: (value: string) => void
  onAccountNumberChange: (value: string) => void
  onBankSelect: (bank: PaymentBankOption) => void
  onSave: () => void
  paymentAccountConfirm: string
  paymentAccountMatches: boolean
  paymentBankOptions: PaymentBankOption[]
  paymentCanSave: boolean
  paymentConfirmationReady: boolean
  paymentMessage: string | null
  paymentMessageTone: 'error' | 'success' | null
  paymentSaving: boolean
  reduceMotion: boolean
  rootStyles: RootProfileUtilityStyles
  selectedBankKey: CustomerV21BankKey | null
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const selectedBankHasRecordedAccount = Boolean(
    confirmedPaymentReady
    && confirmedPaymentBankKey
    && selectedBankKey === confirmedPaymentBankKey,
  )
  const statusLabel = paymentSaving
    ? (language === 'vi' ? 'Đang lưu' : 'Saving')
    : selectedBankHasRecordedAccount ? confirmedPaymentStatus : dataPendingLabel
  const stepTwoActive = accountNameDraft.trim().length >= 2 && accountNumberDraft.replace(/\D/g, '').length >= 6
  const refundAccountTransitionKey = paymentSaving
    ? 'saving'
    : paymentMessageTone === 'error'
      ? 'error'
      : paymentMessageTone === 'success'
        ? `saved:${confirmedPaymentStatus}`
        : selectedBankHasRecordedAccount
          ? `persisted:${confirmedPaymentStatus}`
          : paymentConfirmationReady ? 'ready' : 'idle'

  return (
    <View style={[profileUtilityStyles.profileUtilityStack, profilePaymentStyles.paymentStack]} testID="customer-v21-profile-utility-payment-screen">
      <V21Card
        style={[profilePaymentStyles.statusCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-v21-profile-payment-settings"
      >
        <View style={profilePaymentStyles.statusHeader}>
          <View
            style={[profilePaymentStyles.statusIcon, { backgroundColor: tokens.raised, borderColor: tokens.text }]}
            testID="customer-v21-profile-payment-status-icon"
          >
            <BankAccountIcon color={tokens.primary} testID="customer-v21-profile-payment-status-icon-glyph" />
          </View>
          <View style={profilePaymentStyles.statusCopy}>
            <Text style={[profilePaymentStyles.statusTitle, { color: tokens.text }]} testID="customer-v21-profile-payment-status-title">
              {language === 'vi' ? 'Tài khoản nhận hoàn tiền' : 'Refund account'}
            </Text>
            <Text numberOfLines={2} style={[profilePaymentStyles.statusBody, { color: tokens.muted }]}>
              {selectedBankHasRecordedAccount
                ? `${confirmedPaymentBankName || dataPendingLabel} · ${confirmedPaymentAccountMasked}`
                : (language === 'vi'
                    ? 'Chỉ dùng khi NestScout xác nhận một khoản hoàn tiền.'
                    : 'Only used after NestScout confirms a refund.')}
            </Text>
          </View>
          <View
            style={[profilePaymentStyles.statusPill, {
              backgroundColor: paymentSaving || selectedBankHasRecordedAccount ? tokens.service : tokens.raised,
              borderColor: paymentSaving || selectedBankHasRecordedAccount ? tokens.primary : tokens.border,
            }]}
            testID="customer-v21-profile-payment-status"
          >
            <Text style={[profilePaymentStyles.statusPillText, { color: paymentSaving || selectedBankHasRecordedAccount ? tokens.primary : tokens.muted }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <View style={profilePaymentStyles.stepRow} testID="customer-v21-profile-payment-steps">
          <PaymentStep active={Boolean(selectedBankKey)} label={language === 'vi' ? 'Chọn ngân hàng' : 'Choose bank'} number="1" tokens={tokens} />
          <View style={[profilePaymentStyles.stepLine, { backgroundColor: tokens.border }]} />
          <PaymentStep active={stepTwoActive} label={language === 'vi' ? 'Nhập thông tin' : 'Enter details'} number="2" tokens={tokens} />
          <View style={[profilePaymentStyles.stepLine, { backgroundColor: tokens.border }]} />
          <PaymentStep active={selectedBankHasRecordedAccount} label={language === 'vi' ? 'Hoàn tất' : 'Complete'} number="3" tokens={tokens} />
        </View>
      </V21Card>

      <View style={profilePaymentStyles.sectionHeader}>
        <View style={profilePaymentStyles.sectionCopy}>
          <Text style={[profilePaymentStyles.sectionTitle, { color: tokens.text }]}>{language === 'vi' ? 'Ngân hàng nhận hoàn tiền' : 'Refund bank'}</Text>
          <Text style={[profilePaymentStyles.sectionBody, { color: tokens.muted }]}>{language === 'vi' ? 'Chọn ngân hàng bạn muốn nhận tiền.' : 'Choose where you want to receive the refund.'}</Text>
        </View>
        <Text style={[profilePaymentStyles.sectionMeta, { color: tokens.primary }]}>{bankCountLabel}</Text>
      </View>

      <View style={profilePaymentStyles.bankGrid} testID="customer-v21-profile-payment-bank-grid">
        {paymentBankOptions.map((bank) => {
          const selected = bank.key === selectedBankKey
          return (
            <Pressable
              accessibilityLabel={`${bank.name}${selected ? (language === 'vi' ? '. Đã chọn' : '. Selected') : ''}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: false, selected }}
              key={bank.key}
              onPress={() => onBankSelect(bank)}
              style={({ pressed }) => [
                profilePaymentStyles.bankTile,
                {
                  backgroundColor: selected ? tokens.service : tokens.raised,
                  borderColor: selected ? tokens.primary : tokens.border,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
              testID={`customer-v21-payment-bank-tile-${bank.key}`}
            >
              <View style={[profilePaymentStyles.bankLogoFrame, { backgroundColor: tokens.raised, borderColor: selected ? tokens.primary : tokens.border }]}>
                <Image
                  accessibilityIgnoresInvertColors
                  contentFit="contain"
                  source={customerV21BankAssets[bank.key]}
                  style={profilePaymentStyles.bankLogo}
                  testID={`customer-v21-payment-bank-logo-${bank.key}`}
                />
              </View>
              <Text numberOfLines={1} style={[profilePaymentStyles.bankName, { color: tokens.text }]}>{bank.name}</Text>
              {selected ? <Text style={[profilePaymentStyles.bankSelected, { color: tokens.primary }]}>{language === 'vi' ? 'Đã chọn' : 'Selected'}</Text> : null}
            </Pressable>
          )
        })}
      </View>

      <V21Card
        style={[profilePaymentStyles.formCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-v21-profile-payment-account-form"
      >
        <View style={profilePaymentStyles.formHeader}>
          <View style={profilePaymentStyles.formHeaderCopy}>
            <Text style={[profilePaymentStyles.formTitle, { color: tokens.text }]}>{language === 'vi' ? 'Xác nhận tài khoản' : 'Confirm account'}</Text>
            <Text style={[profilePaymentStyles.formBody, { color: tokens.muted }]}>{language === 'vi' ? 'Nhập đúng thông tin để việc hoàn tiền không bị gián đoạn.' : 'Enter the correct details so your refund is not interrupted.'}</Text>
          </View>
          <View style={[profilePaymentStyles.formHeaderIcon, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
            <ProfileSettingsGlyph color={tokens.primary} name="password" />
          </View>
        </View>

        <View style={profilePaymentStyles.fieldStack}>
          <Text style={[profilePaymentStyles.fieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Tên chủ tài khoản' : 'Account holder'}</Text>
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Tên chủ tài khoản' : 'Account holder'}
            autoCapitalize="characters"
            onChangeText={onAccountNameChange}
            placeholder={language === 'vi' ? 'Tên chủ tài khoản' : 'Account holder'}
            placeholderTextColor={tokens.subtleText}
            style={[profilePaymentStyles.input, textInputNoOutlineStyle, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
            testID="customer-v21-profile-payment-account-name-input"
            value={accountNameDraft}
          />
        </View>
        <View style={profilePaymentStyles.fieldStack}>
          <Text style={[profilePaymentStyles.fieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Số tài khoản' : 'Account number'}</Text>
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Số tài khoản' : 'Account number'}
            keyboardType="number-pad"
            onChangeText={onAccountNumberChange}
            placeholder={language === 'vi' ? 'Số tài khoản' : 'Account number'}
            placeholderTextColor={tokens.subtleText}
            style={[profilePaymentStyles.input, textInputNoOutlineStyle, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
            testID="customer-v21-profile-payment-account-number-input"
            value={accountNumberDraft}
          />
        </View>
        <View style={profilePaymentStyles.fieldStack}>
          <View style={profilePaymentStyles.fieldLabelRow}>
            <Text style={[profilePaymentStyles.fieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Nhập lại số tài khoản' : 'Confirm account number'}</Text>
            {paymentAccountConfirm.length > 0 ? (
              <Text style={[profilePaymentStyles.fieldMeta, { color: paymentAccountMatches ? tokens.primary : tokens.danger }]}>{paymentAccountMatches ? (language === 'vi' ? 'Khớp' : 'Match') : (language === 'vi' ? 'Chưa khớp' : 'Mismatch')}</Text>
            ) : null}
          </View>
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Nhập lại số tài khoản' : 'Confirm account number'}
            keyboardType="number-pad"
            onChangeText={onAccountConfirmChange}
            placeholder={language === 'vi' ? 'Nhập lại số tài khoản' : 'Confirm account number'}
            placeholderTextColor={tokens.subtleText}
            style={[profilePaymentStyles.input, textInputNoOutlineStyle, { backgroundColor: tokens.base, borderColor: accountConfirmBorderColor, color: tokens.text }]}
            testID="customer-v21-profile-payment-account-confirm-input"
            value={accountNumberConfirmDraft}
          />
        </View>
        {paymentAccountConfirm.length > 0 && !paymentAccountMatches ? (
          <Text style={[profileUtilityStyles.profileAddressMessage, { color: tokens.danger }]} testID="customer-v21-profile-payment-account-mismatch">
            {language === 'vi' ? 'Số tài khoản chưa khớp.' : 'Account numbers do not match.'}
          </Text>
        ) : null}

        <View style={[profilePaymentStyles.formDivider, { backgroundColor: tokens.border }]} />
        <View style={profilePaymentStyles.privacyRow}>
          <ProfileSettingsGlyph color={tokens.primary} name="password" />
          <RefundAccountUsageNotice language={language} tokens={tokens} />
        </View>
        <KaelButton
          disabled={paymentSaving || !paymentCanSave}
          label={paymentSaving ? (language === 'vi' ? 'Đang lưu tài khoản' : 'Saving account') : (language === 'vi' ? 'Lưu tài khoản hoàn tiền' : 'Save refund account')}
          onPress={onSave}
          showPrimaryGradient={false}
          style={[profilePaymentStyles.saveButton, paymentCanSave && !paymentSaving ? { backgroundColor: tokens.primary } : null]}
          testID="customer-v21-profile-payment-account-save"
          variant="primary"
        />
        <RefundAccountFeedback
          confirmed={paymentConfirmationReady}
          language={language}
          message={paymentMessage}
          messageTone={paymentMessageTone}
          reduceMotion={reduceMotion}
          saving={paymentSaving}
          tokens={tokens}
          transitionKey={refundAccountTransitionKey}
        />
      </V21Card>
    </View>
  )
}

function PaymentStep({ active, label, number, tokens }: {
  active: boolean
  label: string
  number: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={profilePaymentStyles.step}>
      <View style={[profilePaymentStyles.stepMark, { backgroundColor: active ? tokens.primary : tokens.raised, borderColor: active ? tokens.primary : tokens.border }]}>
        <Text style={[profilePaymentStyles.stepNumber, { color: active ? tokens.raised : tokens.muted }]}>{number}</Text>
      </View>
      <Text numberOfLines={2} style={[profilePaymentStyles.stepLabel, { color: active ? tokens.text : tokens.muted }]}>{label}</Text>
    </View>
  )
}

function BankAccountIcon({ color, testID }: { color: string; testID?: string }) {
  return (
    <Svg fill="none" height={21} testID={testID} viewBox="0 0 24 24" width={21}>
      <Path d="m3 9 9-5 9 5" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.65} />
      <Path d="M5.5 10.5v6.8M9.8 10.5v6.8M14.2 10.5v6.8M18.5 10.5v6.8" stroke={color} strokeLinecap="round" strokeWidth={1.45} />
      <Path d="M3.5 18.5h17M2.5 21h19" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.65} />
    </Svg>
  )
}
