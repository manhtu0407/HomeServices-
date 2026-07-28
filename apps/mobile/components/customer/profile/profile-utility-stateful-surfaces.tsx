import { Image } from 'expo-image'
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { KaelButton, KaelChip, KaelTextInput } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWideMintAura, SourceCardSkin, ZipMintAura } from '../ui/aura-surfaces'
import { customerV21Assets, type CustomerV21BankKey } from '../ui/assets'
import { customerV21PaymentStyles as paymentStyles } from '../ui/payment-styles'
import { PaymentBankTile } from '../ui/payment-surfaces'
import { customerV21ProfilePaymentStyles as profilePaymentStyles } from './profile-payment-styles'
import { customerV21ProfileSettingsStyles as profileSettingsStyles } from './profile-settings-styles'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { ProfileAuraCard, SettingsActionRow } from './profile-utility-surfaces'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'
import { AssetTile, SectionActionHeader } from '../ui/shared-surfaces'

type PaymentBankOption = {
  key: CustomerV21BankKey
  name: string
  vietQrCode: string
}

type RootProfileUtilityStyles = {
  bodyText: StyleProp<TextStyle>
  flex: StyleProp<ViewStyle>
  profileInsightTitle: StyleProp<TextStyle>
}

type ProfileUtilitySettingsAccountModel = {
  canSave: boolean
  emailDraft: string
  fullNameDraft: string
  message: string | null
  messageColor: string
  onEmailChange: (value: string) => void
  onFullNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onSave: () => void
  onToggle: () => void
  open: boolean
  phoneDraft: string
  saving: boolean
}

type ProfileUtilitySettingsPasswordModel = {
  canSave: boolean
  confirmDraft: string
  currentDraft: string
  message: string | null
  messageColor: string
  newDraft: string
  onConfirmChange: (value: string) => void
  onCurrentChange: (value: string) => void
  onNewChange: (value: string) => void
  onSave: () => void
  onToggle: () => void
  open: boolean
  passwordMatches: boolean
  saving: boolean
}

type ProfileUtilitySettingsMemoryModel = {
  allowed: boolean
  onToggle: () => void
  pending: boolean
}

export function ProfileUtilitySettingsView({
  account,
  language,
  memory,
  onOpenAddress,
  onToggleLanguage,
  password,
  rootStyles,
  textInputNoOutlineStyle,
  title,
  tokens,
}: {
  account: ProfileUtilitySettingsAccountModel
  language: AppLanguage
  memory: ProfileUtilitySettingsMemoryModel
  onOpenAddress: () => void
  onToggleLanguage: () => void
  password: ProfileUtilitySettingsPasswordModel
  rootStyles: RootProfileUtilityStyles
  textInputNoOutlineStyle: StyleProp<TextStyle>
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={profileUtilityStyles.profileUtilityStack} testID="customer-v21-profile-utility-settings-screen">
      <ProfileAuraCard cardStyle={profileSettingsStyles.heroCard} contentStyle={profileSettingsStyles.heroContent} scope="UtilitySettingsHero" testID="customer-v21-profile-settings-hero">
        <View
          style={[
            profileSettingsStyles.heroVisualPanel,
            {
              backgroundColor: tokens.mode === 'dark' ? 'rgba(12,62,57,0.68)' : 'rgba(239,252,249,0.70)',
              borderRightColor: tokens.mode === 'dark' ? tokens.border : 'rgba(176,222,214,0.78)',
            },
          ]}
          testID="customer-v21-profile-settings-hero-visual-panel"
        >
          <View pointerEvents="none" style={profileSettingsStyles.heroIconAura}>
            <ZipMintAura intensity="strong" scope="ProfileSettingsHeroIcon" testID="customer-v21-profile-settings-hero-mint-aura" />
          </View>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel={title}
            contentFit="contain"
            source={customerV21Assets.theme}
            style={profileSettingsStyles.heroIconImage}
            testID="customer-v21-profile-settings-hero-icon"
          />
          <View
            pointerEvents="none"
            style={[
              profileSettingsStyles.heroConnector,
              { backgroundColor: tokens.mode === 'dark' ? 'rgba(80,200,184,0.42)' : 'rgba(47,183,164,0.58)' },
            ]}
            testID="customer-v21-profile-settings-hero-connector"
          />
          <View
            pointerEvents="none"
            style={[
              profileSettingsStyles.heroConnectorDot,
              {
                backgroundColor: tokens.primary,
                borderColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.98)',
              },
            ]}
            testID="customer-v21-profile-settings-hero-connector-dot"
          />
        </View>
        <View style={profileSettingsStyles.heroCopy} testID="customer-v21-profile-settings-hero-copy">
          <View style={profileSettingsStyles.heroTitleCopy}>
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]} testID="customer-v21-profile-settings-hero-title">
              {language === 'vi' ? 'Cài đặt tài khoản' : 'Account settings'}
            </Text>
            <Text numberOfLines={2} style={[rootStyles.bodyText, profileSettingsStyles.heroSummary, { color: tokens.muted }]} testID="customer-v21-profile-settings-hero-body">
              {language === 'vi' ? 'Bảo mật, ngôn ngữ và dữ liệu Kael.' : 'Security, language, and Kael data.'}
            </Text>
          </View>
          <View style={profileSettingsStyles.heroDetailRail} testID="customer-v21-profile-settings-hero-details">
            <View style={profileSettingsStyles.heroDetail} testID="customer-v21-profile-settings-hero-detail-profile">
              <Svg accessibilityElementsHidden height={14} viewBox="0 0 14 14" width={14}>
                <Path d="M7 1.4 11 3v3.1c0 2.7-1.5 4.8-4 6.4-2.5-1.6-4-3.7-4-6.4V3l4-1.6Z" fill="none" stroke={tokens.primary} strokeLinejoin="round" strokeWidth={1.3} />
                <Path d="m5.2 6.9 1.15 1.15L8.9 5.5" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} />
              </Svg>
              <Text numberOfLines={1} style={[profileSettingsStyles.heroDetailText, { color: tokens.muted }]}>
                {language === 'vi' ? 'Hồ sơ & bảo mật' : 'Profile & security'}
              </Text>
            </View>
            <View style={[profileSettingsStyles.heroDetailDivider, { backgroundColor: tokens.border }]} />
            <View style={profileSettingsStyles.heroDetail} testID="customer-v21-profile-settings-hero-detail-language">
              <Svg accessibilityElementsHidden height={14} viewBox="0 0 14 14" width={14}>
                <Path d="M2.2 3.3h9.6M2.2 7h9.6M2.2 10.7h9.6" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeWidth={1.25} />
                <Path d="M5 2v2.6M9 5.7v2.6M6.5 9.4V12" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeWidth={1.25} />
              </Svg>
              <Text numberOfLines={1} style={[profileSettingsStyles.heroDetailText, { color: tokens.muted }]}>
                {language === 'vi' ? 'Ngôn ngữ & dữ liệu' : 'Language & data'}
              </Text>
            </View>
          </View>
        </View>
        <KaelChip
          label={language === 'vi' ? 'Tài khoản' : 'Account'}
          style={profileSettingsStyles.heroStatus}
          testID="customer-v21-profile-settings-hero-status"
          variant="selected"
        />
      </ProfileAuraCard>

      <SectionActionHeader
        action={language === 'vi' ? 'Cơ bản' : 'Basics'}
        title={language === 'vi' ? 'Cài đặt chung' : 'General settings'}
      />
      <ProfileAuraCard cardStyle={profileUtilityStyles.profileListCard} contentStyle={profileUtilityStyles.profileSettingsListContent} scope="UtilitySettingsList" testID="customer-v21-profile-settings-list">
        <SettingsActionRow
          body={language === 'vi' ? 'Cập nhật tên, số điện thoại và email liên hệ.' : 'Update name, phone, and contact email.'}
          details={[
            { glyph: 'identity', label: language === 'vi' ? 'Tên & liên hệ' : 'Name & contact' },
            { glyph: 'shield', label: language === 'vi' ? 'Thông tin riêng' : 'Private details' },
          ]}
          image={customerV21Assets.identity}
          onPress={account.onToggle}
          status={account.open ? (language === 'vi' ? 'Ẩn' : 'Hide') : (language === 'vi' ? 'Sửa' : 'Edit')}
          testID="customer-v21-profile-settings-account"
          title={language === 'vi' ? 'Thông tin cá nhân' : 'Personal details'}
          tokens={tokens}
        />
        {account.open ? (
          <View style={profileUtilityStyles.profileSettingsPasswordForm} testID="customer-v21-profile-settings-account-form">
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Họ và tên' : 'Full name'}
              onChangeText={account.onFullNameChange}
              placeholder={language === 'vi' ? 'Họ và tên' : 'Full name'}
              placeholderTextColor={tokens.subtleText}
              style={[profileUtilityStyles.profileAddressInput, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-account-name-input"
              value={account.fullNameDraft}
            />
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Số điện thoại' : 'Phone number'}
              keyboardType="phone-pad"
              onChangeText={account.onPhoneChange}
              placeholder={language === 'vi' ? 'Số điện thoại' : 'Phone number'}
              placeholderTextColor={tokens.subtleText}
              style={[profileUtilityStyles.profileAddressInput, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-account-phone-input"
              value={account.phoneDraft}
            />
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Email liên hệ' : 'Contact email'}
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={account.onEmailChange}
              placeholder={language === 'vi' ? 'Email liên hệ' : 'Contact email'}
              placeholderTextColor={tokens.subtleText}
              style={[profileUtilityStyles.profileAddressInput, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-account-email-input"
              value={account.emailDraft}
            />
            <KaelButton
              disabled={account.saving || !account.canSave}
              label={account.saving ? (language === 'vi' ? 'Đang lưu' : 'Saving') : (language === 'vi' ? 'Lưu thông tin' : 'Save details')}
              onPress={account.onSave}
              showPrimaryGradient={false}
              style={[profileUtilityStyles.profileAddressSaveDefaultButton, account.canSave && !account.saving ? profileUtilityStyles.profileAddressSaveDefaultButtonActive : null]}
              testID="customer-v21-profile-settings-account-save"
            />
            {account.message ? (
              <Text
                style={[profileUtilityStyles.profileAddressMessage, { color: account.messageColor }]}
                testID="customer-v21-profile-settings-account-message"
              >
                {account.message}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={[profileUtilityStyles.profileListDivider, { backgroundColor: tokens.border }]} />
        <SettingsActionRow
          body={language === 'vi' ? 'Chuyển ngôn ngữ giao diện.' : 'Switch app language.'}
          details={[
            { glyph: 'language', label: language === 'vi' ? 'Ngôn ngữ' : 'Language' },
            { glyph: 'settings', label: language === 'vi' ? 'Giao diện' : 'Interface' },
          ]}
          image={customerV21Assets.language}
          onPress={onToggleLanguage}
          status={language === 'vi' ? 'Tiếng Việt' : 'English'}
          testID="customer-v21-profile-settings-language"
          title={language === 'vi' ? 'Ngôn ngữ' : 'Language'}
          tokens={tokens}
        />
        <View style={[profileUtilityStyles.profileListDivider, { backgroundColor: tokens.border }]} />
        <SettingsActionRow
          body={language === 'vi' ? 'Xác nhận mật khẩu hiện tại trước khi đổi.' : 'Confirm the current password first.'}
          details={[
            { glyph: 'shield', label: language === 'vi' ? 'Mật khẩu' : 'Password' },
            { glyph: 'check', label: language === 'vi' ? 'Xác nhận hiện tại' : 'Current check' },
          ]}
          image={customerV21Assets.password}
          onPress={password.onToggle}
          status={password.open ? (language === 'vi' ? 'Ẩn' : 'Hide') : (language === 'vi' ? 'Đổi' : 'Change')}
          testID="customer-v21-profile-settings-password"
          title={language === 'vi' ? 'Bảo mật đăng nhập' : 'Login security'}
          tokens={tokens}
        />
        {password.open ? (
          <View style={profileUtilityStyles.profileSettingsPasswordForm} testID="customer-v21-profile-settings-password-form">
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Mật khẩu hiện tại' : 'Current password'}
              onChangeText={password.onCurrentChange}
              placeholder={language === 'vi' ? 'Mật khẩu hiện tại' : 'Current password'}
              placeholderTextColor={tokens.subtleText}
              secureTextEntry
              style={[profileUtilityStyles.profileAddressInput, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-password-current-input"
              value={password.currentDraft}
            />
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Mật khẩu mới' : 'New password'}
              onChangeText={password.onNewChange}
              placeholder={language === 'vi' ? 'Mật khẩu mới' : 'New password'}
              placeholderTextColor={tokens.subtleText}
              secureTextEntry
              style={[profileUtilityStyles.profileAddressInput, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-password-new-input"
              value={password.newDraft}
            />
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Nhập lại mật khẩu mới' : 'Confirm new password'}
              onChangeText={password.onConfirmChange}
              placeholder={language === 'vi' ? 'Nhập lại mật khẩu mới' : 'Confirm new password'}
              placeholderTextColor={tokens.subtleText}
              secureTextEntry
              style={[profileUtilityStyles.profileAddressInput, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: password.confirmDraft.length > 0 && !password.passwordMatches ? tokens.danger : tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-password-confirm-input"
              value={password.confirmDraft}
            />
            {password.confirmDraft.length > 0 && !password.passwordMatches ? (
              <Text style={[profileUtilityStyles.profileAddressMessage, { color: tokens.danger }]} testID="customer-v21-profile-settings-password-mismatch">
                {language === 'vi' ? 'Mật khẩu chưa khớp.' : 'Passwords do not match.'}
              </Text>
            ) : null}
            <KaelButton
              disabled={password.saving || !password.canSave}
              label={password.saving ? (language === 'vi' ? 'Đang đổi' : 'Changing') : (language === 'vi' ? 'Lưu mật khẩu' : 'Save password')}
              onPress={password.onSave}
              showPrimaryGradient={false}
              style={[profileUtilityStyles.profileAddressSaveDefaultButton, password.canSave && !password.saving ? profileUtilityStyles.profileAddressSaveDefaultButtonActive : null]}
              testID="customer-v21-profile-settings-password-save"
            />
            {password.message ? (
              <Text
                style={[profileUtilityStyles.profileAddressMessage, { color: password.messageColor }]}
                testID="customer-v21-profile-settings-password-message"
              >
                {password.message}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={[profileUtilityStyles.profileListDivider, { backgroundColor: tokens.border }]} />
        <SettingsActionRow
          body={language === 'vi' ? 'Địa chỉ mặc định và địa chỉ phụ.' : 'Default and secondary addresses.'}
          details={[
            { glyph: 'location', label: language === 'vi' ? 'Địa chỉ chính' : 'Primary address' },
            { glyph: 'document', label: language === 'vi' ? 'Địa chỉ phụ' : 'Secondary address' },
          ]}
          image={customerV21Assets.address}
          onPress={onOpenAddress}
          status={language === 'vi' ? 'Mở' : 'Open'}
          testID="customer-v21-profile-settings-address"
          title={language === 'vi' ? 'Địa chỉ' : 'Addresses'}
          tokens={tokens}
        />
        <View style={[profileUtilityStyles.profileListDivider, { backgroundColor: tokens.border }]} />
        <SettingsActionRow
          body={language === 'vi' ? 'Ghi nhớ tương tác theo quyền bạn cho.' : 'Remember interactions only with your permission.'}
          details={[
            { glyph: 'memory', label: language === 'vi' ? 'Quyền ghi nhớ' : 'Memory permission' },
            { glyph: 'shield', label: language === 'vi' ? 'Bạn kiểm soát' : 'You control' },
          ]}
          image={customerV21Assets.memory}
          onPress={memory.onToggle}
          status={memory.pending
            ? (language === 'vi' ? 'Đang lưu' : 'Saving')
            : language === 'vi'
              ? (memory.allowed ? 'Cho phép' : 'Không cho phép')
              : (memory.allowed ? 'Allowed' : 'Not allowed')}
          testID="customer-v21-profile-settings-memory"
          title={language === 'vi' ? 'Bộ nhớ Kael' : 'Kael memory'}
          tokens={tokens}
        />
      </ProfileAuraCard>
    </View>
  )
}

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
      <ProfileAuraCard cardStyle={profileUtilityStyles.profileListCard} contentStyle={profileUtilityStyles.profileAddressHub} scope="UtilityAddressHub" testID="customer-v21-profile-address-hub">
        <View style={profileUtilityStyles.profileAddressHubHeader}>
          <AssetTile image={customerV21Assets.address} label={title} size={54} sourceAura style={profileUtilityStyles.profileAddressHubIcon} />
          <View style={rootStyles.flex}>
            <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Cài đặt địa chỉ' : 'Address settings'}</Text>
            <Text style={[rootStyles.bodyText, { color: tokens.muted }]}>
              {language === 'vi' ? 'Địa chỉ mặc định chỉ mở cho thợ sau khi nhận đơn.' : 'The default address opens only after a worker accepts the job.'}
            </Text>
          </View>
          <KaelChip label={defaultStatusLabel} variant={defaultStatusSaved ? 'selected' : 'unselected'} />
        </View>

        <View style={profileUtilityStyles.profileAddressBlock}>
          <View style={profileUtilityStyles.profileAddressBlockHeader}>
            <Text style={[rootStyles.profileInsightTitle, { color: tokens.text }]}>{language === 'vi' ? 'Địa chỉ mặc định' : 'Default address'}</Text>
            <Text style={[profileUtilityStyles.profileAddressHint, { color: defaultDraftChanged && currentDefaultAddress ? tokens.primary : tokens.muted }]}>
              {defaultDraftChanged && currentDefaultAddress
                ? (language === 'vi' ? 'Bấm lưu để đặt mặc định' : 'Save to set default')
                : hasSavedDefaultAddress
                  ? (language === 'vi' ? 'Thợ nhận khi đơn được chấp nhận' : 'Shared after acceptance')
                  : dataPendingLabel}
            </Text>
          </View>
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Địa chỉ mặc định' : 'Default address'}
            onChangeText={onDefaultAddressChange}
            placeholder={language === 'vi' ? 'Ví dụ: Tòa A, Quận 7' : 'Example: Tower A, District 7'}
            placeholderTextColor={tokens.subtleText}
            style={[profileUtilityStyles.profileAddressInput, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
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
              style={[profileUtilityStyles.profileAddressInput, rootStyles.flex, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
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
                    <AssetTile image={customerV21Assets.map} label={language === 'vi' ? 'Địa chỉ đã lưu' : 'Saved address'} size={42} sourceAura style={profileUtilityStyles.profileAddressSavedIcon} />
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
      </ProfileAuraCard>

      {addressMessage ? <Text style={[profileUtilityStyles.profileAddressMessage, { color: addressMessageColor }]} testID="customer-v21-profile-address-message">{addressMessage}</Text> : null}
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
  paymentMessage,
  paymentMessageColor,
  paymentSaving,
  rootStyles,
  selectedBankKey,
  textInputNoOutlineStyle,
  title,
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
  paymentMessage: string | null
  paymentMessageColor: string
  paymentSaving: boolean
  rootStyles: RootProfileUtilityStyles
  selectedBankKey: CustomerV21BankKey | null
  textInputNoOutlineStyle: StyleProp<TextStyle>
  title: string
  tokens: CustomerThemeTokens
}) {
  const selectedBank = selectedBankKey
    ? paymentBankOptions.find((bank) => bank.key === selectedBankKey) ?? null
    : null
  const selectedBankHasRecordedAccount = Boolean(
    confirmedPaymentReady
    && confirmedPaymentBankKey
    && selectedBankKey === confirmedPaymentBankKey,
  )
  const heroTitle = selectedBank?.name
    || (selectedBankHasRecordedAccount ? confirmedPaymentBankName : '')
    || (language === 'vi' ? 'Tài khoản nhận tiền' : 'Receiving account')
  const heroStatus = selectedBankHasRecordedAccount ? confirmedPaymentStatus : dataPendingLabel

  return (
    <View style={profileUtilityStyles.profileUtilityStack} testID="customer-v21-profile-utility-payment-screen">
      <ProfileAuraCard cardStyle={profilePaymentStyles.heroCard} contentStyle={profilePaymentStyles.heroContent} scope="UtilityPaymentHero" testID="customer-v21-profile-payment-settings">
        <View
          style={[
            profilePaymentStyles.heroVisualPanel,
            {
              backgroundColor: tokens.mode === 'dark' ? 'rgba(12,62,57,0.68)' : 'rgba(239,252,249,0.70)',
              borderRightColor: tokens.mode === 'dark' ? tokens.border : 'rgba(176,222,214,0.78)',
            },
          ]}
          testID="customer-v21-profile-payment-hero-visual-panel"
        >
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel={title}
            contentFit="contain"
            source={customerV21Assets.receivingAccount}
            style={profilePaymentStyles.heroIconImage}
            testID="customer-v21-profile-payment-hero-icon"
          />
          <View
            pointerEvents="none"
            style={[
              profilePaymentStyles.heroConnector,
              { backgroundColor: tokens.mode === 'dark' ? 'rgba(80,200,184,0.42)' : 'rgba(47,183,164,0.58)' },
            ]}
            testID="customer-v21-profile-payment-hero-connector"
          />
          <View
            pointerEvents="none"
            style={[
              profilePaymentStyles.heroConnectorDot,
              {
                backgroundColor: tokens.primary,
                borderColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.98)',
              },
            ]}
            testID="customer-v21-profile-payment-hero-connector-dot"
          />
        </View>
        <View style={profilePaymentStyles.heroCopy}>
          <View
            style={profilePaymentStyles.heroTitleCopy}
            testID="customer-v21-profile-payment-hero-title-copy"
          >
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]} testID="customer-v21-profile-payment-hero-title">{heroTitle}</Text>
            <Text numberOfLines={2} style={[profilePaymentStyles.heroSummary, { color: tokens.muted }]}>
              {selectedBankHasRecordedAccount
                ? `${confirmedPaymentBankName || dataPendingLabel} · ${confirmedPaymentAccountMasked}`
                : (language === 'vi' ? 'Nhập thông tin rồi kiểm tra trước xác thực.' : 'Enter the details, then review before verification.')}
            </Text>
          </View>
          <View style={profilePaymentStyles.heroSignalRail} testID="customer-v21-profile-payment-hero-signals">
            <View style={profilePaymentStyles.heroSignal}>
              <Svg accessibilityElementsHidden height={14} viewBox="0 0 14 14" width={14}>
                <Path d="M7 6.4a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Zm-4 5.7c.35-2.1 1.8-3.35 4-3.35s3.65 1.25 4 3.35" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.35} />
              </Svg>
              <Text numberOfLines={1} style={[profilePaymentStyles.heroSignalText, { color: tokens.muted }]}>{language === 'vi' ? 'Chủ tài khoản' : 'Account holder'}</Text>
            </View>
            <View style={profilePaymentStyles.heroSignal}>
              <Svg accessibilityElementsHidden height={14} viewBox="0 0 14 14" width={14}>
                <Path d="M7 1.4 11 3v3.1c0 2.7-1.5 4.8-4 6.4-2.5-1.6-4-3.7-4-6.4V3l4-1.6Z" fill="none" stroke={tokens.primary} strokeLinejoin="round" strokeWidth={1.3} />
                <Path d="m5.2 6.9 1.15 1.15L8.9 5.5" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} />
              </Svg>
              <Text numberOfLines={1} style={[profilePaymentStyles.heroSignalText, { color: tokens.muted }]}>{language === 'vi' ? 'Cần xác minh' : 'Verification required'}</Text>
            </View>
          </View>
        </View>
        <KaelChip
          label={heroStatus}
          style={profilePaymentStyles.heroStatus}
          testID="customer-v21-profile-payment-hero-status"
          variant={selectedBankHasRecordedAccount ? 'selected' : 'unselected'}
        />
      </ProfileAuraCard>

      <SectionActionHeader
        action={bankCountLabel}
        title={language === 'vi' ? 'Chọn ngân hàng' : 'Choose bank'}
      />
      <View style={paymentStyles.paymentBankGrid} testID="customer-v21-profile-payment-bank-grid">
        <CaseWideMintAura scope="ProfilePaymentBankGrid" testID="customer-v21-profile-payment-bank-grid-wide-mint-aura" />
        {paymentBankOptions.map((bank) => (
          <PaymentBankTile
            bank={bank}
            disabled={false}
            key={bank.key}
            onPress={() => onBankSelect(bank)}
            selected={bank.key === selectedBankKey}
            showMintAura
            sourceCardSkin={SourceCardSkin}
            zipMintAura={ZipMintAura}
          />
        ))}
      </View>

      <ProfileAuraCard cardStyle={profileUtilityStyles.profileListCard} contentStyle={profileUtilityStyles.profilePaymentForm} scope="UtilityPaymentAccount" testID="customer-v21-profile-payment-account-form">
        <View style={profileUtilityStyles.profileAddressBlockHeader}>
          <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Xác nhận tài khoản' : 'Confirm account'}</Text>
          <Text style={[rootStyles.bodyText, { color: tokens.muted }]}>
            {language === 'vi' ? 'Nhập đúng tên chủ tài khoản và số tài khoản hai lần trước khi lưu.' : 'Enter the holder name and the account number twice before saving.'}
          </Text>
        </View>
        <KaelTextInput
          accessibilityLabel={language === 'vi' ? 'Tên chủ tài khoản' : 'Account holder'}
          autoCapitalize="characters"
          onChangeText={onAccountNameChange}
          placeholder={language === 'vi' ? 'Tên chủ tài khoản' : 'Account holder'}
          placeholderTextColor={tokens.subtleText}
          style={[profileUtilityStyles.profileAddressInput, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
          testID="customer-v21-profile-payment-account-name-input"
          value={accountNameDraft}
        />
        <KaelTextInput
          accessibilityLabel={language === 'vi' ? 'Số tài khoản' : 'Account number'}
          keyboardType="number-pad"
          onChangeText={onAccountNumberChange}
          placeholder={language === 'vi' ? 'Số tài khoản' : 'Account number'}
          placeholderTextColor={tokens.subtleText}
          style={[profileUtilityStyles.profileAddressInput, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
          testID="customer-v21-profile-payment-account-number-input"
          value={accountNumberDraft}
        />
        <KaelTextInput
          accessibilityLabel={language === 'vi' ? 'Nhập lại số tài khoản' : 'Confirm account number'}
          keyboardType="number-pad"
          onChangeText={onAccountConfirmChange}
          placeholder={language === 'vi' ? 'Nhập lại số tài khoản' : 'Confirm account number'}
          placeholderTextColor={tokens.subtleText}
          style={[profileUtilityStyles.profileAddressInput, textInputNoOutlineStyle, { backgroundColor: tokens.raised, borderColor: accountConfirmBorderColor, color: tokens.text }]}
          testID="customer-v21-profile-payment-account-confirm-input"
          value={accountNumberConfirmDraft}
        />
        {paymentAccountConfirm.length > 0 && !paymentAccountMatches ? (
          <Text style={[profileUtilityStyles.profileAddressMessage, { color: tokens.danger }]} testID="customer-v21-profile-payment-account-mismatch">
            {language === 'vi' ? 'Số tài khoản chưa khớp.' : 'Account numbers do not match.'}
          </Text>
        ) : null}
        <KaelButton
          disabled={paymentSaving || !paymentCanSave}
          label={paymentSaving ? (language === 'vi' ? 'Đang lưu' : 'Saving') : (language === 'vi' ? 'Lưu tài khoản' : 'Save account')}
          onPress={onSave}
          showPrimaryGradient={false}
          style={[profileUtilityStyles.profileAddressSaveDefaultButton, paymentCanSave && !paymentSaving ? profileUtilityStyles.profileAddressSaveDefaultButtonActive : null]}
          testID="customer-v21-profile-payment-account-save"
        />
      </ProfileAuraCard>

      {paymentMessage ? <Text style={[profileUtilityStyles.profileAddressMessage, { color: paymentMessageColor }]} testID="customer-v21-profile-payment-message">{paymentMessage}</Text> : null}
    </View>
  )
}
