import { useRef, useState } from 'react'
import { Text as RNText, View, type TextProps } from 'react-native'
import { useRouter } from 'expo-router'
import { localizeAccountMutationError } from '@/lib/account-mutation-error'
import { setAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { WorkerV5EarningsHomeListAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5StringFromUnknown } from '../ui/route'
import { workerV5SettingsIconAssets } from '../ui/worker-v5-icon-assets'
import { styles } from '../worker-v5-flow-styles'
import { WorkerV5SettingsActionRow } from './settings-surfaces'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { WorkerV5SettingsHero } from './settings-surfaces'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SettingsBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const router = useRouter()
  const { session, updateCustomerProfile, updatePassword } = useAuth()
  const metadata = session?.user.user_metadata
  const metadataFullName = workerV5StringFromUnknown(metadata?.full_name ?? metadata?.name)
  const metadataPhone = workerV5StringFromUnknown(metadata?.phone_number ?? metadata?.phone)
  const metadataEmail = workerV5StringFromUnknown(metadata?.contact_email) ?? session?.user.email ?? ''
  const [settingsState, setSettingsState] = useState(() => ({
    accountEmailDraft: metadataEmail,
    accountFullNameDraft: metadataFullName ?? '',
    accountMessage: null as string | null,
    accountPanelOpen: false,
    accountPhoneDraft: metadataPhone ?? '',
    accountSaving: false,
    confirmPasswordDraft: '',
    currentPasswordDraft: '',
    newPasswordDraft: '',
    passwordMessage: null as string | null,
    passwordPanelOpen: false,
    passwordSaving: false,
  }))
  const accountSaveInFlightRef = useRef(false)
  const passwordSaveInFlightRef = useRef(false)
  const {
    accountEmailDraft,
    accountFullNameDraft,
    accountMessage,
    accountPanelOpen,
    accountPhoneDraft,
    accountSaving,
    confirmPasswordDraft,
    currentPasswordDraft,
    newPasswordDraft,
    passwordMessage,
    passwordPanelOpen,
    passwordSaving,
  } = settingsState
  const currentLanguage = language === 'vi' ? 'Tiếng Việt' : 'English'
  const hasServiceArea = Boolean(runtime.workerProfile?.districts?.length || runtime.workerProfile?.service_radius_km)
  const accountCanSave = accountFullNameDraft.trim().length >= 2 || accountPhoneDraft.trim().length >= 6 || accountEmailDraft.trim().length >= 4
  const passwordMatches = newPasswordDraft.length > 0 && newPasswordDraft === confirmPasswordDraft
  const passwordCanSave = currentPasswordDraft.trim().length > 0 && newPasswordDraft.length >= 8 && passwordMatches

  const saveAccountSettings = async () => {
    if (accountSaveInFlightRef.current || accountSaving || !accountCanSave) return
    accountSaveInFlightRef.current = true
    setSettingsState((current) => ({ ...current, accountMessage: null, accountSaving: true }))
    try {
      const result = await updateCustomerProfile({
        email: accountEmailDraft.trim(),
        fullName: accountFullNameDraft.trim(),
        phone: accountPhoneDraft.trim(),
      })
      setSettingsState((current) => ({
        ...current,
        accountMessage: result.success
          ? textByLanguage(language, 'Đã lưu thông tin.', 'Saved')
          : localizeAccountMutationError(result.error, language, 'profile'),
      }))
    } catch {
      setSettingsState((current) => ({
        ...current,
        accountMessage: localizeAccountMutationError(null, language, 'profile'),
      }))
    } finally {
      accountSaveInFlightRef.current = false
      setSettingsState((current) => ({ ...current, accountSaving: false }))
    }
  }

  const savePasswordSettings = async () => {
    if (passwordSaveInFlightRef.current || passwordSaving || !passwordCanSave) return
    passwordSaveInFlightRef.current = true
    setSettingsState((current) => ({ ...current, passwordMessage: null, passwordSaving: true }))
    try {
      const result = await updatePassword({
        currentPassword: currentPasswordDraft.trim(),
        newPassword: newPasswordDraft,
      })
      setSettingsState((current) => ({
        ...current,
        confirmPasswordDraft: result.success ? '' : current.confirmPasswordDraft,
        currentPasswordDraft: result.success ? '' : current.currentPasswordDraft,
        newPasswordDraft: result.success ? '' : current.newPasswordDraft,
        passwordMessage: result.success
          ? textByLanguage(language, 'Đã đổi mật khẩu.', 'Password changed')
          : localizeAccountMutationError(result.error, language, 'password'),
      }))
    } catch {
      setSettingsState((current) => ({
        ...current,
        passwordMessage: localizeAccountMutationError(null, language, 'password'),
      }))
    } finally {
      passwordSaveInFlightRef.current = false
      setSettingsState((current) => ({ ...current, passwordSaving: false }))
    }
  }

  const switchSettingsLanguage = () => {
    const nextLanguage = language === 'vi' ? 'en' : 'vi'
    setAppLanguage(nextLanguage)
    router.replace(`/(worker)/profile?ns_worker_screen=5.10-support-settings&ns_worker_lang=${nextLanguage}` as never)
  }

  return (
    <View style={styles.sectionStack} testID="worker-v5-settings-screen">
      <WorkerV5SettingsHero
        language={language}
        listAura={WorkerV5EarningsHomeListAura}
        reduceTransparency={reduceTransparency}
        settingsIcon={workerV5SettingsIconAssets.hero}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Cơ bản', 'Basics')}
        title={textByLanguage(language, 'Cài đặt chung', 'General settings')}
      />
      <View style={[styles.workerSettingsListCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-settings-list">
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Cập nhật tên, số điện thoại và email liên hệ.', 'Update name, phone, and contact email.')}
          details={[
            { glyph: 'identity', label: textByLanguage(language, 'Tên & liên hệ', 'Name and contact') },
            { glyph: 'shield', label: textByLanguage(language, 'Thông tin riêng', 'Private details') },
          ]}
          icon={workerV5SettingsIconAssets.personal}
          listAura={WorkerV5EarningsHomeListAura}
          onPress={() => {
            setSettingsState((current) => ({
              ...current,
              accountMessage: null,
              accountPanelOpen: !current.accountPanelOpen,
            }))
          }}
          reduceTransparency={reduceTransparency}
          status={accountPanelOpen ? textByLanguage(language, 'Ẩn', 'Hide') : textByLanguage(language, 'Sửa', 'Edit')}
          testID="worker-v5-settings-account"
          tone="identity"
          title={textByLanguage(language, 'Thông tin cá nhân', 'Personal details')}
        />
        {accountPanelOpen ? (
          <View style={styles.workerSettingsForm} testID="worker-v5-settings-account-form">
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Họ và tên', 'Full name')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => {
                setSettingsState((current) => ({ ...current, accountFullNameDraft: value, accountMessage: null }))
              }}
              placeholder={textByLanguage(language, 'Họ và tên', 'Full name')}
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-account-name-input"
              value={accountFullNameDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Số điện thoại', 'Phone number')}
              inputShellStyle={styles.workerSettingsInputShell}
              keyboardType="phone-pad"
              onChangeText={(value) => {
                setSettingsState((current) => ({ ...current, accountMessage: null, accountPhoneDraft: value }))
              }}
              placeholder={textByLanguage(language, 'Số điện thoại', 'Phone number')}
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-account-phone-input"
              value={accountPhoneDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Email liên hệ', 'Contact email')}
              autoCapitalize="none"
              inputShellStyle={styles.workerSettingsInputShell}
              keyboardType="email-address"
              onChangeText={(value) => {
                setSettingsState((current) => ({ ...current, accountEmailDraft: value, accountMessage: null }))
              }}
              placeholder={textByLanguage(language, 'Email liên hệ', 'Contact email')}
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-account-email-input"
              value={accountEmailDraft}
            />
            <KaelButton
              disabled={accountSaving || !accountCanSave}
              label={accountSaving ? textByLanguage(language, 'Đang lưu', 'Saving') : textByLanguage(language, 'Lưu thông tin', 'Save details')}
              onPress={() => void saveAccountSettings()}
              showPrimaryGradient={false}
              style={[styles.workerSettingsSaveButton, accountCanSave && !accountSaving ? styles.workerSettingsSaveButtonActive : null]}
              testID="worker-v5-settings-account-save"
            />
            {accountMessage ? (
              <Text
                style={accountMessage.includes('Đã') || accountMessage === 'Saved' ? styles.workerSettingsMessage : styles.workerSettingsMessageError}
                testID="worker-v5-settings-account-message"
              >
                {accountMessage}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.workerSettingsDivider} />
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Chuyển ngôn ngữ giao diện.', 'Switch app language.')}
          details={[
            { glyph: 'language', label: textByLanguage(language, 'Ngôn ngữ', 'Language') },
            { glyph: 'settings', label: textByLanguage(language, 'Giao diện', 'Interface') },
          ]}
          icon={workerV5SettingsIconAssets.language}
          listAura={WorkerV5EarningsHomeListAura}
          onPress={switchSettingsLanguage}
          reduceTransparency={reduceTransparency}
          status={currentLanguage}
          testID="worker-v5-settings-language"
          tone="signal"
          title={textByLanguage(language, 'Ngôn ngữ', 'Language')}
        />
        <View style={styles.workerSettingsDivider} />
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Xác nhận mật khẩu hiện tại trước khi đổi.', 'Confirm the current password first.')}
          details={[
            { glyph: 'shield', label: textByLanguage(language, 'Mật khẩu', 'Password') },
            { glyph: 'check', label: textByLanguage(language, 'Xác nhận hiện tại', 'Verify current') },
          ]}
          icon={workerV5SettingsIconAssets.security}
          listAura={WorkerV5EarningsHomeListAura}
          onPress={() => {
            setSettingsState((current) => ({
              ...current,
              passwordMessage: null,
              passwordPanelOpen: !current.passwordPanelOpen,
            }))
          }}
          reduceTransparency={reduceTransparency}
          status={passwordPanelOpen ? textByLanguage(language, 'Ẩn', 'Hide') : textByLanguage(language, 'Đổi', 'Change')}
          testID="worker-v5-settings-password"
          tone="identity"
          title={textByLanguage(language, 'Bảo mật đăng nhập', 'Login security')}
        />
        {passwordPanelOpen ? (
          <View style={styles.workerSettingsForm} testID="worker-v5-settings-password-form">
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Mật khẩu hiện tại', 'Current password')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => {
                setSettingsState((current) => ({ ...current, currentPasswordDraft: value, passwordMessage: null }))
              }}
              placeholder={textByLanguage(language, 'Mật khẩu hiện tại', 'Current password')}
              secureTextEntry
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-password-current-input"
              value={currentPasswordDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Mật khẩu mới', 'New password')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => {
                setSettingsState((current) => ({ ...current, newPasswordDraft: value, passwordMessage: null }))
              }}
              placeholder={textByLanguage(language, 'Mật khẩu mới', 'New password')}
              secureTextEntry
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-password-new-input"
              value={newPasswordDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Nhập lại mật khẩu mới', 'Confirm new password')}
              inputShellStyle={[styles.workerSettingsInputShell, confirmPasswordDraft.length > 0 && !passwordMatches ? styles.workerSettingsInputShellError : null]}
              onChangeText={(value) => {
                setSettingsState((current) => ({ ...current, confirmPasswordDraft: value, passwordMessage: null }))
              }}
              placeholder={textByLanguage(language, 'Nhập lại mật khẩu mới', 'Confirm new password')}
              secureTextEntry
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-password-confirm-input"
              value={confirmPasswordDraft}
            />
            {confirmPasswordDraft.length > 0 && !passwordMatches ? (
              <Text style={styles.workerSettingsMessageError} testID="worker-v5-settings-password-mismatch">
                {textByLanguage(language, 'Mật khẩu chưa khớp.', 'Passwords do not match.')}
              </Text>
            ) : null}
            <KaelButton
              disabled={passwordSaving || !passwordCanSave}
              label={passwordSaving ? textByLanguage(language, 'Đang đổi', 'Changing') : textByLanguage(language, 'Lưu mật khẩu', 'Save password')}
              onPress={() => void savePasswordSettings()}
              showPrimaryGradient={false}
              style={[styles.workerSettingsSaveButton, passwordCanSave && !passwordSaving ? styles.workerSettingsSaveButtonActive : null]}
              testID="worker-v5-settings-password-save"
            />
            {passwordMessage ? (
              <Text
                style={passwordMessage.includes('Đã') || passwordMessage === 'Password changed' ? styles.workerSettingsMessage : styles.workerSettingsMessageError}
                testID="worker-v5-settings-password-message"
              >
                {passwordMessage}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.workerSettingsDivider} />
        <WorkerV5SettingsActionRow
          body={hasServiceArea ? textByLanguage(language, 'Khu vực phục vụ lấy từ hồ sơ thợ.', 'Service areas come from the worker profile.') : textByLanguage(language, 'Thiết lập khu vực phục vụ ưu tiên.', 'Set preferred service areas.')}
          details={[
            {
              glyph: 'location',
              label: runtime.workerProfile?.districts?.length
                ? textByLanguage(language, `${runtime.workerProfile.districts.length} khu vực`, `${runtime.workerProfile.districts.length} areas`)
                : textByLanguage(language, 'Chưa có khu vực', 'No area yet'),
            },
            {
              glyph: 'signal',
              label: typeof runtime.workerProfile?.service_radius_km === 'number'
                ? textByLanguage(language, `${runtime.workerProfile.service_radius_km} km`, `${runtime.workerProfile.service_radius_km} km`)
                : textByLanguage(language, 'Chưa có bán kính', 'No radius yet'),
            },
          ]}
          icon={workerV5SettingsIconAssets.serviceArea}
          listAura={WorkerV5EarningsHomeListAura}
          onPress={() => router.replace('/(worker)/profile?ns_worker_screen=5.3-skills-service-area' as never)}
          reduceTransparency={reduceTransparency}
          status={hasServiceArea ? textByLanguage(language, 'Mở', 'Open') : textByLanguage(language, 'Thiết lập', 'Set up')}
          testID="worker-v5-settings-service-area"
          tone="location"
          title={textByLanguage(language, 'Khu vực phục vụ', 'Service areas')}
        />
        <View style={styles.workerSettingsDivider} />
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Ghi nhớ tương tác được phép; thợ có thể bật hoặc tắt.', 'Remember allowed interactions; the worker can turn it on or off.')}
          details={[
            { glyph: 'memory', label: textByLanguage(language, 'Quyền ghi nhớ', 'Memory permission') },
            { glyph: 'shield', label: textByLanguage(language, 'Bạn kiểm soát', 'You control it') },
          ]}
          icon={workerV5SettingsIconAssets.kaelMemory}
          listAura={WorkerV5EarningsHomeListAura}
          onPress={() => router.replace('/(worker)/profile?ns_worker_screen=5.6-agent-memory-preferences' as never)}
          reduceTransparency={reduceTransparency}
          status={textByLanguage(language, 'Mở', 'Open')}
          testID="worker-v5-settings-memory"
          tone="signal"
          title={textByLanguage(language, 'Bộ nhớ Kael', 'Kael memory')}
        />
      </View>
    </View>
  )
}

