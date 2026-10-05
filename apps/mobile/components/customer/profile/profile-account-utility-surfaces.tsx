import { Pressable, Text, View, type StyleProp, type TextStyle } from 'react-native'
import Svg, { Path, Polygon, Rect } from 'react-native-svg'

import { KaelButton, KaelTextInput } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { V21Card } from '../ui/shared-surfaces'
import { customerV21ProfileAccountUtilityStyles as styles } from './profile-account-utility-styles'
import { ProfilePreferenceOption, ProfilePreferencePanel } from './profile-preference-surfaces'
import { ProfileSettingsGlyph } from './profile-settings-icons'
import type {
  ProfileUtilitySettingsAccountModel,
  ProfileUtilitySettingsMemoryModel,
  ProfileUtilitySettingsPasswordModel,
} from './profile-utility-models'

function LanguageFlag({ language }: { language: AppLanguage }) {
  return (
    <Svg height={28} viewBox="0 0 42 28" width={42}>
      {language === 'vi' ? (
        <>
          <Rect fill="#DA251D" height={28} rx={3} width={42} />
          <Polygon
            fill="#FFEA2E"
            points="21,4.5 23.4,11 30.3,11.2 24.9,15.4 26.8,22 21,18.2 15.2,22 17.1,15.4 11.7,11.2 18.6,11"
          />
        </>
      ) : (
        <>
          <Rect fill="#012169" height={28} rx={3} width={42} />
          <Path d="M0 0 42 28M42 0 0 28" stroke="#FFFFFF" strokeWidth={7} />
          <Path d="M0 0 42 28M42 0 0 28" stroke="#C8102E" strokeWidth={3} />
          <Rect fill="#FFFFFF" height={28} width={10} x={16} />
          <Rect fill="#FFFFFF" height={10} width={42} y={9} />
          <Rect fill="#C8102E" height={28} width={5} x={18.5} />
          <Rect fill="#C8102E" height={5} width={42} y={11.5} />
        </>
      )}
      <Rect fill="none" height={27} rx={3} stroke="#B8CBC8" strokeWidth={1} width={41} x={0.5} y={0.5} />
    </Svg>
  )
}

export function ProfilePersonalDetailsView({
  account,
  language,
  textInputNoOutlineStyle,
  tokens,
}: {
  account: ProfileUtilitySettingsAccountModel
  language: AppLanguage
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={styles.utilityStack} testID="customer-v21-profile-utility-personal-details-screen">
      <V21Card
        style={[styles.personalDetailsCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-v21-profile-personal-details-card"
      >
        <View style={styles.personalDetailsHeader} testID="customer-v21-profile-personal-details-header">
          <View
            style={[styles.personalDetailsHeaderIcon, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
            testID="customer-v21-profile-personal-details-header-icon"
          >
            <ProfileSettingsGlyph
              color={tokens.primary}
              name="personal"
              testID="customer-v21-profile-personal-details-header-icon-glyph"
            />
          </View>
          <View style={styles.personalDetailsHeaderCopy}>
            <Text style={[styles.personalDetailsIntroTitle, { color: tokens.text }]}>
              {language === 'vi' ? 'Kiểm soát thông tin của bạn' : 'Manage your contact details'}
            </Text>
            <Text style={[styles.personalDetailsIntroBody, { color: tokens.muted }]}>
              {language === 'vi' ? 'Cập nhật cách NestScout liên hệ với bạn.' : 'Update how NestScout contacts you.'}
            </Text>
          </View>
        </View>

        <View style={styles.formStack} testID="customer-v21-profile-settings-account-form">
          <View style={styles.fieldGroup}>
            <Text style={[styles.personalDetailsFieldLabel, { color: tokens.text }]}>
              {language === 'vi' ? 'Họ và tên' : 'Full name'}
            </Text>
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Họ và tên' : 'Full name'}
              onChangeText={account.onFullNameChange}
              placeholder={language === 'vi' ? 'Nhập họ và tên' : 'Enter your full name'}
              placeholderTextColor={tokens.subtleText}
              style={[styles.personalDetailsInput, textInputNoOutlineStyle, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-account-name-input"
              value={account.fullNameDraft}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={[styles.personalDetailsFieldLabel, { color: tokens.text }]}>Gmail</Text>
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Gmail' : 'Email'}
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={account.onEmailChange}
              placeholder={language === 'vi' ? 'Nhập Gmail' : 'Enter your email'}
              placeholderTextColor={tokens.subtleText}
              style={[styles.personalDetailsInput, textInputNoOutlineStyle, styles.personalDetailsReadonlyInput, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-account-email-input"
              value={account.emailDraft}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={[styles.personalDetailsFieldLabel, { color: tokens.text }]}>
              {language === 'vi' ? 'Số điện thoại' : 'Phone number'}
            </Text>
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Số điện thoại' : 'Phone number'}
              keyboardType="phone-pad"
              onChangeText={account.onPhoneChange}
              placeholder={language === 'vi' ? 'Chưa cập nhật' : 'Not added yet'}
              placeholderTextColor={tokens.muted}
              style={[styles.personalDetailsInput, textInputNoOutlineStyle, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-account-phone-input"
              value={account.phoneDraft}
            />
          </View>
          <View style={[styles.personalDetailsDivider, { backgroundColor: tokens.border }]} />
          <View style={styles.personalDetailsPrivacy} testID="customer-v21-profile-personal-details-privacy">
            <ProfileSettingsGlyph color={tokens.primary} name="password" testID="customer-v21-profile-personal-details-privacy-icon" />
            <Text style={[styles.personalDetailsPrivacyText, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Thông tin này chỉ dùng cho tài khoản và liên hệ dịch vụ.'
                : 'This information is used only for your account and service contact.'}
            </Text>
          </View>
          <KaelButton
            disabled={account.saving || !account.canSave}
            label={account.saving
              ? (language === 'vi' ? 'Đang lưu' : 'Saving')
              : (language === 'vi' ? 'Lưu thay đổi' : 'Save changes')}
            onPress={account.onSave}
            style={styles.primaryButton}
            testID="customer-v21-profile-settings-account-save"
          />
          {account.message ? (
            <Text style={[styles.message, { color: account.messageColor }]} testID="customer-v21-profile-settings-account-message">
              {account.message}
            </Text>
          ) : null}
        </View>
      </V21Card>
    </View>
  )
}

export function ProfileLoginSecurityView({
  language,
  password,
  textInputNoOutlineStyle,
  tokens,
}: {
  language: AppLanguage
  password: ProfileUtilitySettingsPasswordModel
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={styles.utilityStack} testID="customer-v21-profile-utility-password-screen">
      <V21Card
        style={[styles.personalDetailsCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-v21-profile-password-card"
      >
        <View style={styles.personalDetailsHeader} testID="customer-v21-profile-password-header">
          <View
            style={[styles.personalDetailsHeaderIcon, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
            testID="customer-v21-profile-password-header-icon"
          >
            <ProfileSettingsGlyph
              color={tokens.primary}
              name="password"
              testID="customer-v21-profile-password-header-icon-glyph"
            />
          </View>
          <View style={styles.personalDetailsHeaderCopy}>
            <Text style={[styles.personalDetailsIntroTitle, { color: tokens.text }]}>
              {language === 'vi' ? 'Bảo vệ tài khoản' : 'Protect your account'}
            </Text>
            <Text style={[styles.personalDetailsIntroBody, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Xác nhận mật khẩu hiện tại, sau đó tạo mật khẩu mới có ít nhất 8 ký tự.'
                : 'Confirm your current password, then create a new password with at least 8 characters.'}
            </Text>
          </View>
        </View>

        <View style={styles.formStack} testID="customer-v21-profile-settings-password-form">
          <View style={styles.fieldGroup}>
            <Text style={[styles.personalDetailsFieldLabel, { color: tokens.text }]}>
              {language === 'vi' ? 'Mật khẩu hiện tại' : 'Current password'}
            </Text>
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Mật khẩu hiện tại' : 'Current password'}
              onChangeText={password.onCurrentChange}
              placeholder={language === 'vi' ? 'Nhập mật khẩu hiện tại' : 'Enter your current password'}
              placeholderTextColor={tokens.subtleText}
              secureTextEntry
              style={[styles.personalDetailsInput, textInputNoOutlineStyle, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-password-current-input"
              value={password.currentDraft}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={[styles.personalDetailsFieldLabel, { color: tokens.text }]}>
              {language === 'vi' ? 'Mật khẩu mới' : 'New password'}
            </Text>
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Mật khẩu mới' : 'New password'}
              onChangeText={password.onNewChange}
              placeholder={language === 'vi' ? 'Nhập mật khẩu mới' : 'Enter a new password'}
              placeholderTextColor={tokens.subtleText}
              secureTextEntry
              style={[styles.personalDetailsInput, textInputNoOutlineStyle, { backgroundColor: tokens.base, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-settings-password-new-input"
              value={password.newDraft}
            />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={[styles.personalDetailsFieldLabel, { color: tokens.text }]}>
              {language === 'vi' ? 'Nhập lại mật khẩu mới' : 'Confirm new password'}
            </Text>
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Nhập lại mật khẩu mới' : 'Confirm new password'}
              onChangeText={password.onConfirmChange}
              placeholder={language === 'vi' ? 'Nhập lại để kiểm tra' : 'Enter it again to confirm'}
              placeholderTextColor={tokens.subtleText}
              secureTextEntry
              style={[
                styles.personalDetailsInput,
                textInputNoOutlineStyle,
                {
                  backgroundColor: tokens.base,
                  borderColor: password.confirmDraft.length > 0 && !password.passwordMatches ? tokens.danger : tokens.border,
                  color: tokens.text,
                },
              ]}
              testID="customer-v21-profile-settings-password-confirm-input"
              value={password.confirmDraft}
            />
          </View>
          {password.confirmDraft.length > 0 && !password.passwordMatches ? (
            <Text style={[styles.message, { color: tokens.danger }]} testID="customer-v21-profile-settings-password-mismatch">
              {language === 'vi' ? 'Mật khẩu chưa khớp.' : 'Passwords do not match.'}
            </Text>
          ) : null}
          <View style={[styles.personalDetailsDivider, { backgroundColor: tokens.border }]} />
          <View style={styles.personalDetailsPrivacy} testID="customer-v21-profile-password-privacy">
            <ProfileSettingsGlyph color={tokens.primary} name="password" testID="customer-v21-profile-password-privacy-icon" />
            <Text style={[styles.personalDetailsPrivacyText, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Không chia sẻ mật khẩu với bất kỳ ai.'
                : 'Do not share your password with anyone.'}
            </Text>
          </View>
          <KaelButton
            disabled={password.saving || !password.canSave}
            label={password.saving
              ? (language === 'vi' ? 'Đang đổi' : 'Changing')
              : (language === 'vi' ? 'Lưu mật khẩu' : 'Save password')}
            onPress={password.onSave}
            style={styles.primaryButton}
            testID="customer-v21-profile-settings-password-save"
          />
          {password.message ? (
            <Text style={[styles.message, { color: password.messageColor }]} testID="customer-v21-profile-settings-password-message">
              {password.message}
            </Text>
          ) : null}
        </View>
      </V21Card>
    </View>
  )
}

export function ProfileLanguageView({
  language,
  onSelectLanguage,
  tokens,
}: {
  language: AppLanguage
  onSelectLanguage: (nextLanguage: AppLanguage) => void
  tokens: CustomerThemeTokens
}) {
  const options: readonly {
    body: string
    label: string
    value: AppLanguage
  }[] = [
    {
      body: language === 'vi' ? 'Nội dung và hướng dẫn bằng tiếng Việt.' : 'Content and guidance in Vietnamese.',
      label: language === 'vi' ? 'Tiếng Việt' : 'Vietnamese',
      value: 'vi',
    },
    {
      body: language === 'vi' ? 'Nội dung và hướng dẫn bằng tiếng Anh.' : 'Content and guidance in English.',
      label: language === 'vi' ? 'Tiếng Anh' : 'English',
      value: 'en',
    },
  ]

  return (
    <View style={styles.utilityStack} testID="customer-v21-profile-utility-language-screen">
      <ProfilePreferencePanel
        body={language === 'vi'
          ? 'Lựa chọn được áp dụng ngay cho toàn bộ ứng dụng.'
          : 'Your choice is applied across the app immediately.'}
        icon="language"
        simple
        scope="Language"
        testID="customer-v21-profile-language-card"
        title={language === 'vi' ? 'Ngôn ngữ hiển thị' : 'Display language'}
        tokens={tokens}
      >
        {options.map((option) => (
          <ProfilePreferenceOption
            body={option.body}
            key={option.value}
            onPress={() => onSelectLanguage(option.value)}
            selected={option.value === language}
            testID={`customer-v21-profile-language-${option.value}`}
            title={option.label}
            tokens={tokens}
            visual={<LanguageFlag language={option.value} />}
          />
        ))}
      </ProfilePreferencePanel>
    </View>
  )
}

export function ProfileKaelMemoryView({
  language,
  memory,
  tokens,
}: {
  language: AppLanguage
  memory: ProfileUtilitySettingsMemoryModel
  tokens: CustomerThemeTokens
}) {
  const status = memory.pending
    ? (language === 'vi' ? 'Đang lưu' : 'Saving')
    : memory.allowed
      ? (language === 'vi' ? 'Cho phép' : 'Allowed')
      : (language === 'vi' ? 'Không cho phép' : 'Not allowed')

  return (
    <View style={styles.utilityStack} testID="customer-v21-profile-utility-memory-screen">
      <ProfilePreferencePanel
        body={language === 'vi'
          ? 'Bạn quyết định Kael có được ghi nhớ cách bạn trao đổi để hỗ trợ phù hợp hơn hay không.'
          : 'You decide whether Kael may remember how you interact to provide more relevant help.'}
        icon="memory"
        simple
        scope="Memory"
        testID="customer-v21-profile-memory-card"
        title={language === 'vi' ? 'Quyền ghi nhớ tương tác' : 'Interaction memory permission'}
        tokens={tokens}
      >
        <Pressable
          accessibilityHint={language === 'vi'
            ? 'Bạn có thể thay đổi lựa chọn này bất cứ lúc nào.'
            : 'You can change this choice at any time.'}
          accessibilityLabel={language === 'vi' ? 'Cho phép Kael ghi nhớ tương tác' : 'Allow Kael to remember interactions'}
          accessibilityRole="switch"
          accessibilityState={{ checked: memory.allowed, disabled: memory.pending }}
          disabled={memory.pending}
          onPress={memory.onToggle}
          style={({ pressed }) => [
            styles.memoryControl,
            {
              backgroundColor: tokens.base,
              borderColor: memory.allowed ? tokens.primary : tokens.border,
              opacity: pressed && !memory.pending ? 0.82 : 1,
            },
          ]}
          testID="customer-v21-profile-settings-memory"
        >
          <View style={styles.memoryCopy}>
            <Text style={[styles.title, { color: tokens.text }]}>
              {language === 'vi' ? 'Ghi nhớ tương tác' : 'Remember interactions'}
            </Text>
            <Text style={[styles.memoryStatus, { color: memory.allowed ? tokens.primary : tokens.muted }]}>
              {status}
            </Text>
          </View>
          <View
            style={[
              styles.switchTrack,
              {
                backgroundColor: memory.allowed ? tokens.primary : tokens.borderStrong,
                justifyContent: memory.allowed ? 'flex-end' : 'flex-start',
              },
            ]}
          >
            <View style={[styles.switchThumb, { backgroundColor: tokens.raised }]} />
          </View>
        </Pressable>
        <Text style={[styles.body, { color: tokens.muted }]}>
          {language === 'vi'
            ? 'Khi tắt, Kael không dùng các tương tác mới để ghi nhớ sở thích của bạn.'
            : 'When off, Kael does not use new interactions to remember your preferences.'}
        </Text>
      </ProfilePreferencePanel>
    </View>
  )
}
