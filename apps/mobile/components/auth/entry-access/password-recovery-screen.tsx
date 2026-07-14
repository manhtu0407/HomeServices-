import { useReducer } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { NativeSafeGlassPanel, PrimaryButton } from './components/materials'
import { EntryTextField } from './components/fields'
import { EntryIcon } from './components/icons'
import { entryTheme } from './theme'
import type { EntryActionResult } from './types'

export function PasswordRecoveryScreen(props: {
  busy: boolean
  error: string | null
  identifier: string
  notice: string | null
  onBack: () => void
  onIdentifierChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <RecoveryPage onBack={props.onBack} title="Khôi phục mật khẩu">
      <View style={styles.header}>
        <Text style={styles.title}>Lấy lại{`\n`}mật khẩu.</Text>
        <Text style={styles.lead}>Nhập email đã đăng ký. NestScout sẽ gửi một liên kết đặt lại mật khẩu.</Text>
      </View>
      <NativeSafeGlassPanel style={styles.panel} testID="auth-password-recovery-panel">
        <EntryTextField
          icon="mail"
          keyboardType="email-address"
          label="Email đã đăng ký"
          onChangeText={props.onIdentifierChange}
          placeholder="email@example.com"
          testID="auth-recovery-identifier-input"
          textContentType="emailAddress"
          value={props.identifier}
        />
        {props.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{props.error}</Text> : null}
        {props.notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{props.notice}</Text> : null}
        <PrimaryButton disabled={props.busy} label={props.busy ? 'Đang gửi…' : 'Gửi liên kết'} onPress={props.onSubmit} testID="auth-recovery-submit" />
      </NativeSafeGlassPanel>
    </RecoveryPage>
  )
}

export function PasswordResetScreen(props: {
  onComplete: (password: string) => Promise<EntryActionResult>
  onExit: () => Promise<void> | void
}) {
  const [{ password, confirmation, busy, complete, error }, patchReset] = useReducer(
    (current: PasswordResetState, patch: Partial<PasswordResetState>) => ({ ...current, ...patch }),
    INITIAL_PASSWORD_RESET_STATE,
  )

  const submit = async () => {
    patchReset({ error: null })
    if (password.length < 8) {
      patchReset({ error: 'Mật khẩu mới cần ít nhất 8 ký tự.' })
      return
    }
    if (password !== confirmation) {
      patchReset({ error: 'Mật khẩu xác nhận chưa trùng khớp.' })
      return
    }

    patchReset({ busy: true })
    try {
      const result = await props.onComplete(password)
      if (!result.success) {
        patchReset({ error: result.error ?? 'Chưa thể cập nhật mật khẩu. Vui lòng yêu cầu liên kết mới.' })
        return
      }
      patchReset({ complete: true })
    } catch {
      patchReset({ error: 'Không thể kết nối. Vui lòng thử lại.' })
    } finally {
      patchReset({ busy: false })
    }
  }

  return (
    <RecoveryPage onBack={() => void props.onExit()} title="Đặt lại mật khẩu">
      <View style={styles.header}>
        <Text style={styles.title}>Tạo mật khẩu{`\n`}mới.</Text>
        <Text style={styles.lead}>Chọn mật khẩu mới cho tài khoản NestScout của bạn.</Text>
      </View>
      <NativeSafeGlassPanel style={styles.panel} testID="auth-password-reset-panel">
        {complete ? (
          <View style={styles.successBlock}>
            <Text accessibilityLiveRegion="polite" style={styles.successTitle}>Mật khẩu đã được cập nhật.</Text>
            <Text style={styles.successLead}>Bạn có thể đăng nhập lại bằng mật khẩu mới.</Text>
            <PrimaryButton label="Đăng nhập" onPress={() => void props.onExit()} testID="auth-reset-password-login" />
          </View>
        ) : (
          <>
            <EntryTextField icon="lock" label="Mật khẩu mới" onChangeText={(value) => patchReset({ password: value })} placeholder="Ít nhất 8 ký tự" secureTextEntry testID="auth-reset-password-input" textContentType="newPassword" value={password} />
            <EntryTextField icon="lock" label="Xác nhận mật khẩu" onChangeText={(value) => patchReset({ confirmation: value })} placeholder="Nhập lại mật khẩu mới" secureTextEntry testID="auth-reset-password-confirmation-input" textContentType="newPassword" value={confirmation} />
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
            <PrimaryButton disabled={busy} label={busy ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'} onPress={() => void submit()} testID="auth-reset-password-submit" />
          </>
        )}
      </NativeSafeGlassPanel>
    </RecoveryPage>
  )
}

type PasswordResetState = {
  password: string
  confirmation: string
  busy: boolean
  complete: boolean
  error: string | null
}

const INITIAL_PASSWORD_RESET_STATE: PasswordResetState = {
  password: '',
  confirmation: '',
  busy: false,
  complete: false,
  error: null,
}

function RecoveryPage(props: { children: React.ReactNode; onBack: () => void; title: string }) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView bounces={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topbar}>
            <Pressable accessibilityLabel="Quay lại" accessibilityRole="button" onPress={props.onBack} style={styles.backButton}>
              <EntryIcon color={entryTheme.color.text.strong} name="back" size={18} />
            </Pressable>
            <Text style={styles.topbarTitle}>{props.title}</Text>
            <View style={styles.topbarSpacer} />
          </View>
          {props.children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  backButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.70)', borderColor: 'rgba(255,255,255,0.92)', borderRadius: 21, borderWidth: 1, height: 42, justifyContent: 'center', width: 42, ...entryTheme.shadow.soft },
  error: { color: entryTheme.color.accent.destructive, fontSize: 11, lineHeight: 16, marginBottom: 10, marginTop: -2 },
  header: { paddingBottom: 12, paddingHorizontal: 3, paddingTop: 6 },
  keyboard: { flex: 1 },
  lead: { color: entryTheme.color.text.secondary, fontSize: 15, lineHeight: 22, marginTop: 7 },
  notice: { color: entryTheme.color.mint.mint800, fontSize: 12, lineHeight: 18, marginBottom: 12, marginTop: -2 },
  panel: { borderRadius: entryTheme.radius.sheet, paddingBottom: 15, paddingHorizontal: 15, paddingTop: 17 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 18, paddingHorizontal: entryTheme.spacing.screenX },
  successBlock: { gap: 8 },
  successLead: { color: entryTheme.color.text.secondary, fontSize: 13, lineHeight: 19, marginBottom: 8 },
  successTitle: { color: entryTheme.color.mint.mint800, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  title: { color: entryTheme.color.text.strong, fontSize: 29, fontWeight: '700', lineHeight: 35 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -3, marginBottom: 6, minHeight: 48 },
  topbarSpacer: { height: 42, width: 42 },
  topbarTitle: { color: entryTheme.color.text.strong, fontSize: 17, fontWeight: '700' },
})
