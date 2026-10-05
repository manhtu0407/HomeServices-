import { useRef, useState } from 'react'
import { Text as RNText, View, type TextProps } from 'react-native'
import { useRouter } from 'expo-router'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { localizeAccountMutationError } from '@/lib/account-mutation-error'
import { setAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import { textByLanguage } from '../ui/format'
import { workerV5StringFromUnknown } from '../ui/route'
import { setWorkerThemeMode, useWorkerThemePreference } from '../worker-theme'
import { styles } from '../worker-v5-flow-styles'
import {
  WorkerV5ProfileGroup,
  WorkerV5ProfileGroupDivider,
  WorkerV5ProfileGroupRow,
} from './grouped-list-surfaces'
import { WorkerV5SettingsChoiceRow } from './settings-surfaces'
import { WorkerV5UtilityGlyph } from './utility-glyphs'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5SettingsBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const router = useRouter()
  const themePreference = useWorkerThemePreference()
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
    appearancePanelOpen: false,
    confirmPasswordDraft: '',
    currentPasswordDraft: '',
    languagePanelOpen: false,
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
    appearancePanelOpen,
    confirmPasswordDraft,
    currentPasswordDraft,
    languagePanelOpen,
    newPasswordDraft,
    passwordMessage,
    passwordPanelOpen,
    passwordSaving,
  } = settingsState
  const accountCanSave = accountFullNameDraft.trim().length >= 2 || accountPhoneDraft.trim().length >= 6 || accountEmailDraft.trim().length >= 4
  const passwordMatches = newPasswordDraft.length > 0 && newPasswordDraft === confirmPasswordDraft
  const passwordCanSave = currentPasswordDraft.trim().length > 0 && newPasswordDraft.length >= 8 && passwordMatches
  const currentLanguage = language === 'vi' ? 'Tiếng Việt' : 'English'
  const currentAppearance = themePreference === 'system'
    ? textByLanguage(language, 'Theo hệ thống', 'System')
    : themePreference === 'light'
      ? textByLanguage(language, 'Sáng', 'Light')
      : textByLanguage(language, 'Tối', 'Dark')
  const notificationStatus = runtime.notificationUnreadCount > 0
    ? textByLanguage(language, `${runtime.notificationUnreadCount} chưa đọc`, `${runtime.notificationUnreadCount} unread`)
    : textByLanguage(language, 'Không có mới', 'No new items')

  const routeTo = (screenId: string, nextLanguage = language) => {
    router.replace(`/(worker)/profile?ns_worker_screen=${screenId}&ns_worker_lang=${nextLanguage}` as never)
  }

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

  const chooseLanguage = (nextLanguage: AppLanguage) => {
    if (nextLanguage === language) return
    setAppLanguage(nextLanguage)
    routeTo('5.10-support-settings', nextLanguage)
  }

  return (
    <View style={[styles.sectionStack, styles.workerSettingsScreenStack]} testID="worker-v5-settings-screen">
      <WorkerV5ProfileGroup testID="worker-v5-settings-group-account-security" title={textByLanguage(language, 'Tài khoản & bảo mật', 'Account & security')}>
        <WorkerV5ProfileGroupRow
          accessibilityHint={textByLanguage(language, 'Tên, số điện thoại và email liên hệ.', 'Name, phone number, and contact email.')}
          density="compact"
          iconElement={<WorkerV5UtilityGlyph name="person" />}
          iconFrame="outlined"
          iconFrameTone="white"
          onPress={() => setSettingsState((current) => ({ ...current, accountMessage: null, accountPanelOpen: !current.accountPanelOpen }))}
          reduceTransparency={reduceTransparency}
          status={accountPanelOpen ? textByLanguage(language, 'Đóng', 'Close') : textByLanguage(language, 'Sửa', 'Edit')}
          statusTone="active"
          testID="worker-v5-settings-account"
          title={textByLanguage(language, 'Thông tin cá nhân', 'Personal details')}
        />
        {accountPanelOpen ? (
          <View style={styles.workerSettingsForm} testID="worker-v5-settings-account-form">
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Họ và tên', 'Full name')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => setSettingsState((current) => ({ ...current, accountFullNameDraft: value, accountMessage: null }))}
              placeholder={textByLanguage(language, 'Họ và tên', 'Full name')}
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-account-name-input"
              value={accountFullNameDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Số điện thoại', 'Phone number')}
              inputShellStyle={styles.workerSettingsInputShell}
              keyboardType="phone-pad"
              onChangeText={(value) => setSettingsState((current) => ({ ...current, accountMessage: null, accountPhoneDraft: value }))}
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
              onChangeText={(value) => setSettingsState((current) => ({ ...current, accountEmailDraft: value, accountMessage: null }))}
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
              <Text style={accountMessage.includes('Đã') || accountMessage === 'Saved' ? styles.workerSettingsMessage : styles.workerSettingsMessageError} testID="worker-v5-settings-account-message">
                {accountMessage}
              </Text>
            ) : null}
          </View>
        ) : null}
        <WorkerV5ProfileGroupDivider />
        <WorkerV5ProfileGroupRow
          accessibilityHint={textByLanguage(language, 'Xác nhận mật khẩu hiện tại trước khi đổi.', 'Confirm the current password before changing it.')}
          density="compact"
          iconElement={<WorkerV5UtilityGlyph name="lock" />}
          iconFrame="outlined"
          iconFrameTone="white"
          onPress={() => setSettingsState((current) => ({ ...current, passwordMessage: null, passwordPanelOpen: !current.passwordPanelOpen }))}
          reduceTransparency={reduceTransparency}
          status={passwordPanelOpen ? textByLanguage(language, 'Đóng', 'Close') : textByLanguage(language, 'Đổi', 'Change')}
          statusTone="active"
          testID="worker-v5-settings-password"
          title={textByLanguage(language, 'Bảo mật đăng nhập', 'Login security')}
        />
        {passwordPanelOpen ? (
          <View style={styles.workerSettingsForm} testID="worker-v5-settings-password-form">
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Mật khẩu hiện tại', 'Current password')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => setSettingsState((current) => ({ ...current, currentPasswordDraft: value, passwordMessage: null }))}
              placeholder={textByLanguage(language, 'Mật khẩu hiện tại', 'Current password')}
              secureTextEntry
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-password-current-input"
              value={currentPasswordDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Mật khẩu mới', 'New password')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => setSettingsState((current) => ({ ...current, newPasswordDraft: value, passwordMessage: null }))}
              placeholder={textByLanguage(language, 'Mật khẩu mới', 'New password')}
              secureTextEntry
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-password-new-input"
              value={newPasswordDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Nhập lại mật khẩu mới', 'Confirm new password')}
              inputShellStyle={[styles.workerSettingsInputShell, confirmPasswordDraft.length > 0 && !passwordMatches ? styles.workerSettingsInputShellError : null]}
              onChangeText={(value) => setSettingsState((current) => ({ ...current, confirmPasswordDraft: value, passwordMessage: null }))}
              placeholder={textByLanguage(language, 'Nhập lại mật khẩu mới', 'Confirm new password')}
              secureTextEntry
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-password-confirm-input"
              value={confirmPasswordDraft}
            />
            {confirmPasswordDraft.length > 0 && !passwordMatches ? <Text style={styles.workerSettingsMessageError} testID="worker-v5-settings-password-mismatch">{textByLanguage(language, 'Mật khẩu chưa khớp.', 'Passwords do not match.')}</Text> : null}
            <KaelButton
              disabled={passwordSaving || !passwordCanSave}
              label={passwordSaving ? textByLanguage(language, 'Đang đổi', 'Changing') : textByLanguage(language, 'Lưu mật khẩu', 'Save password')}
              onPress={() => void savePasswordSettings()}
              showPrimaryGradient={false}
              style={[styles.workerSettingsSaveButton, passwordCanSave && !passwordSaving ? styles.workerSettingsSaveButtonActive : null]}
              testID="worker-v5-settings-password-save"
            />
            {passwordMessage ? <Text style={passwordMessage.includes('Đã') || passwordMessage === 'Password changed' ? styles.workerSettingsMessage : styles.workerSettingsMessageError} testID="worker-v5-settings-password-message">{passwordMessage}</Text> : null}
          </View>
        ) : null}
      </WorkerV5ProfileGroup>

      <WorkerV5ProfileGroup testID="worker-v5-settings-group-app" title={textByLanguage(language, 'Ứng dụng', 'App')}>
        <WorkerV5ProfileGroupRow
          accessibilityHint={textByLanguage(language, 'Chọn ngôn ngữ hiển thị cho ứng dụng.', 'Choose the display language for the app.')}
          density="compact"
          iconElement={<WorkerV5UtilityGlyph name="globe" />}
          iconFrame="outlined"
          iconFrameTone="white"
          onPress={() => setSettingsState((current) => ({ ...current, languagePanelOpen: !current.languagePanelOpen }))}
          reduceTransparency={reduceTransparency}
          status={currentLanguage}
          statusTone="active"
          testID="worker-v5-settings-language"
          title={textByLanguage(language, 'Ngôn ngữ', 'Language')}
        />
        {languagePanelOpen ? (
          <View accessibilityRole="radiogroup" testID="worker-v5-settings-language-options">
            <WorkerV5SettingsChoiceRow body="Tiếng Việt" onPress={() => chooseLanguage('vi')} selected={language === 'vi'} testID="worker-v5-settings-language-vi" title="Tiếng Việt" />
            <WorkerV5SettingsChoiceRow body="English" onPress={() => chooseLanguage('en')} selected={language === 'en'} testID="worker-v5-settings-language-en" title="English" />
          </View>
        ) : null}
        <WorkerV5ProfileGroupDivider />
        <WorkerV5ProfileGroupRow
          accessibilityHint={textByLanguage(language, 'Chọn Theo hệ thống, Sáng hoặc Tối cho thiết bị này.', 'Choose System, Light or Dark for this device.')}
          density="compact"
          iconElement={<WorkerV5UtilityGlyph name="palette" />}
          iconFrame="outlined"
          iconFrameTone="white"
          onPress={() => setSettingsState((current) => ({ ...current, appearancePanelOpen: !current.appearancePanelOpen }))}
          reduceTransparency={reduceTransparency}
          status={currentAppearance}
          statusTone="active"
          testID="worker-v5-settings-appearance"
          title={textByLanguage(language, 'Giao diện', 'Appearance')}
        />
        {appearancePanelOpen ? (
          <View accessibilityRole="radiogroup" testID="worker-v5-settings-appearance-options">
            <WorkerV5SettingsChoiceRow body={textByLanguage(language, 'Tự đổi Sáng hoặc Tối theo cài đặt của điện thoại.', 'Switches between Light and Dark with your phone setting.')} onPress={() => void setWorkerThemeMode('system')} selected={themePreference === 'system'} testID="worker-v5-settings-appearance-system" title={textByLanguage(language, 'Theo hệ thống', 'System')} />
            <WorkerV5SettingsChoiceRow body={textByLanguage(language, 'Nền sáng, rõ và thoáng.', 'Bright, clear, and airy.')} onPress={() => void setWorkerThemeMode('light')} selected={themePreference === 'light'} testID="worker-v5-settings-appearance-light" title={textByLanguage(language, 'Sáng', 'Light')} />
            <WorkerV5SettingsChoiceRow body={textByLanguage(language, 'Nền tối dịu hơn khi dùng ban đêm.', 'A darker canvas for night use.')} onPress={() => void setWorkerThemeMode('dark')} selected={themePreference === 'dark'} testID="worker-v5-settings-appearance-dark" title={textByLanguage(language, 'Tối', 'Dark')} />
          </View>
        ) : null}
        <WorkerV5ProfileGroupDivider />
        <WorkerV5ProfileGroupRow
          accessibilityHint={textByLanguage(language, 'Xem các cập nhật về công việc và tài khoản.', 'Review work and account updates.')}
          density="compact"
          iconElement={<WorkerV5UtilityGlyph name="bell" />}
          iconFrame="outlined"
          iconFrameTone="white"
          onPress={() => routeTo('5.12-worker-notifications')}
          reduceTransparency={reduceTransparency}
          status={notificationStatus}
          statusTone={runtime.notificationUnreadCount > 0 ? 'active' : 'muted'}
          testID="worker-v5-settings-notifications"
          title={textByLanguage(language, 'Thông báo', 'Notifications')}
        />
      </WorkerV5ProfileGroup>

      <WorkerV5ProfileGroup testID="worker-v5-settings-group-privacy" title={textByLanguage(language, 'Quyền riêng tư', 'Privacy')}>
        <WorkerV5ProfileGroupRow
          accessibilityHint={textByLanguage(language, 'Bạn kiểm soát việc Kael ghi nhớ tương tác.', 'You control whether Kael remembers interactions.')}
          density="compact"
          iconElement={<WorkerV5UtilityGlyph name="memory" />}
          iconFrame="outlined"
          iconFrameTone="white"
          onPress={() => routeTo('5.6-agent-memory-preferences')}
          reduceTransparency={reduceTransparency}
          status={textByLanguage(language, 'Mở', 'Open')}
          statusTone="active"
          testID="worker-v5-settings-memory"
          title={textByLanguage(language, 'Bộ nhớ Kael', 'Kael memory')}
        />
      </WorkerV5ProfileGroup>

      <WorkerV5ProfileGroup testID="worker-v5-settings-group-help" title={textByLanguage(language, 'Hỗ trợ & chính sách', 'Help & policies')}>
        <WorkerV5ProfileGroupRow
          accessibilityHint={textByLanguage(language, 'Tìm trợ giúp theo công việc hoặc hỏi Kael.', 'Get help with work or ask Kael.')}
          density="compact"
          iconElement={<WorkerV5UtilityGlyph name="chat" />}
          iconFrame="outlined"
          iconFrameTone="white"
          onPress={() => routeTo('5.13-worker-support')}
          reduceTransparency={reduceTransparency}
          status={textByLanguage(language, 'Mở', 'Open')}
          statusTone="active"
          testID="worker-v5-settings-support"
          title={textByLanguage(language, 'Trợ giúp & hỗ trợ', 'Help & support')}
        />
        <WorkerV5ProfileGroupDivider />
        <WorkerV5ProfileGroupRow
          accessibilityHint={textByLanguage(language, 'Quy định rõ ràng khi nhận và thực hiện công việc.', 'Clear rules for accepting and completing work.')}
          density="compact"
          iconElement={<WorkerV5UtilityGlyph name="document" />}
          iconFrame="outlined"
          iconFrameTone="white"
          onPress={() => routeTo('5.14-worker-policies')}
          reduceTransparency={reduceTransparency}
          status={textByLanguage(language, 'Xem', 'View')}
          statusTone="active"
          testID="worker-v5-settings-policy"
          title={textByLanguage(language, 'Chính sách dành cho thợ', 'Worker policies')}
        />
      </WorkerV5ProfileGroup>
    </View>
  )
}
