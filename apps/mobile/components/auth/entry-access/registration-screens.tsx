import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CheckRow, EntryTextField } from './components/fields'
import { IconButton, NativeSafeGlassPanel, PrimaryButton } from './components/materials'
import { registrationIdentifierFieldProps } from './entry-identifier-fields'
import type { AppLanguage } from '@/lib/app-language'
import { entryTheme } from './theme'
import type { EntryRole } from './types'

export function AuthTopBar({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.topbar}>
      <IconButton label="Quay lại" onPress={onBack} />
      <Text style={styles.topbarTitle}>{title}</Text>
      <View style={styles.topbarSpacer} />
    </View>
  )
}

export function FormHeader({ lead, title }: { lead: string; title: string }) {
  return (
    <View style={styles.formHead}>
      <View style={styles.formHeadRow}>
        <View style={styles.formHeadCopy}>
          <Text style={styles.formTitle}>{title.replace(/\\n/g, '\n')}</Text>
          <Text style={styles.formLead}>{lead}</Text>
        </View>
      </View>
    </View>
  )
}

export function RegisterScreen(props: {
  acceptedTerms: boolean
  busy: boolean
  identifier: string
  language: AppLanguage
  error: string | null
  fullName: string
  onBack: () => void
  onIdentifierChange: (value: string) => void
  onFullNameChange: (value: string) => void
  onLogin: () => void
  onPasswordChange: (value: string) => void
  onSubmit: () => void
  onToggleTerms: () => void
  password: string
  role: EntryRole
}) {
  const identifierProps = registrationIdentifierFieldProps(props.language)
  return (
    <EntryScreen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView bounces={false} contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthTopBar onBack={props.onBack} title="Đăng ký" />
          <FormHeader lead={props.role === 'customer' ? 'Chỉ mất chưa đến một phút.' : 'Tạo tài khoản trước khi gửi hồ sơ xác thực.'} title={props.role === 'customer' ? 'Tạo tài khoản\ncủa bạn.' : 'Tạo hồ sơ\nđối tác.'} />
          <NativeSafeGlassPanel style={styles.formPanel} testID="auth-register-1-5">
            <EntryTextField autoCapitalize="words" icon="user" label="Họ và tên" onChangeText={props.onFullNameChange} placeholder="Nguyễn Hoàng Minh" testID="auth-register-name-input" textContentType="name" value={props.fullName} />
            <EntryTextField {...identifierProps} onChangeText={props.onIdentifierChange} testID="auth-register-email-input" value={props.identifier} />
            <EntryTextField icon="lock" label="Mật khẩu" onChangeText={props.onPasswordChange} placeholder="Tối thiểu 8 ký tự" secureTextEntry testID="auth-register-password-input" textContentType="newPassword" value={props.password} />
            <View style={styles.termsRow}>
              <CheckRow checked={props.acceptedTerms} label="Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật của NestScout." onPress={props.onToggleTerms} testID="auth-register-terms" />
            </View>
            {props.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{props.error}</Text> : null}
            <PrimaryButton disabled={props.busy} label={props.busy ? 'Đang xử lý…' : props.role === 'customer' ? 'Đăng ký' : 'Tạo tài khoản thợ'} onPress={props.onSubmit} testID="auth-register-submit" />
            <Text style={styles.formSwitch}>Đã có tài khoản? <Text onPress={props.onLogin} style={styles.formSwitchLink}>Đăng nhập</Text></Text>
          </NativeSafeGlassPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </EntryScreen>
  )
}

function EntryScreen({ children }: { children: React.ReactNode }) {
  return <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>{children}</SafeAreaView>
}

const styles = StyleSheet.create({
  error: { color: entryTheme.color.accent.destructive, fontSize: 11, lineHeight: 16, marginBottom: 10, marginTop: -2 },
  formHead: { paddingBottom: 12, paddingHorizontal: 3, paddingTop: 6 },
  formHeadCopy: { flex: 1 },
  formHeadRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  formLead: { ...entryTheme.typography.body, color: entryTheme.color.text.secondary, marginTop: 6 },
  formPanel: { borderRadius: entryTheme.radius.sheet, paddingBottom: 15, paddingHorizontal: 15, paddingTop: 17 },
  formScroll: { flexGrow: 1, paddingBottom: 18, paddingHorizontal: entryTheme.spacing.screenX },
  formSwitch: { color: entryTheme.color.text.secondary, fontSize: 11.5, marginTop: 14, textAlign: 'center' },
  formSwitchLink: { color: entryTheme.color.mint.mint700, fontWeight: '700' },
  formTitle: { color: entryTheme.color.text.strong, fontSize: 29, fontWeight: '700', letterSpacing: 0, lineHeight: 35 },
  keyboard: { flex: 1 },
  safe: { flex: 1 },
  termsRow: { marginBottom: 12, marginHorizontal: 2, marginTop: 2 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -3, marginBottom: 6, minHeight: 48 },
  topbarSpacer: { width: 42 },
  topbarTitle: { color: entryTheme.color.text.primary, fontSize: 15, fontWeight: '700', letterSpacing: 0 },
})
