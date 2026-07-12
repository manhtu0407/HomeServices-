import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { parseAuthIdentifier } from '@/lib/auth-identifier'
import { NativeSafeGlassPanel, PrimaryButton } from './components/materials'
import { EntryTextField } from './components/fields'
import { EntryIcon } from './components/icons'
import { identifierFieldProps } from './entry-identifier-fields'
import { entryTheme } from './theme'

export function PasswordRecoveryScreen(props: {
  busy: boolean
  error: string | null
  identifier: string
  onBack: () => void
  onIdentifierChange: (value: string) => void
  onRecoveryIdentifierChange: (value: string) => void
  onSubmit: () => void
  recoveryIdentifier: string
}) {
  const primary = parseAuthIdentifier(props.identifier)
  const recoveryKind = primary?.kind === 'email' ? 'phone' : primary?.kind === 'phone' ? 'email' : null
  const primaryField = identifierFieldProps(props.identifier, 'customer')
  const recoveryUsesPhone = recoveryKind === 'phone'

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <ScrollView bounces={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topbar}>
            <Pressable accessibilityLabel="Quay lại" accessibilityRole="button" onPress={props.onBack} style={styles.backButton}>
              <EntryIcon color={entryTheme.color.text.strong} name="back" size={18} />
            </Pressable>
            <Text style={styles.topbarTitle}>Khôi phục mật khẩu</Text>
            <View style={styles.topbarSpacer} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>Lấy lại{`\n`}mật khẩu.</Text>
            <Text style={styles.lead}>Dùng kênh liên hệ đối diện để tiếp tục.</Text>
          </View>
          <NativeSafeGlassPanel style={styles.panel} testID="auth-password-recovery-panel">
            <EntryTextField {...primaryField} label="Email/SDT đã đăng ký" onChangeText={props.onIdentifierChange} testID="auth-recovery-identifier-input" value={props.identifier} />
            {recoveryKind ? (
              <EntryTextField
                icon={recoveryUsesPhone ? 'phone' : 'mail'}
                keyboardType={recoveryUsesPhone ? 'phone-pad' : 'email-address'}
                label={recoveryUsesPhone ? 'SDT khôi phục' : 'Email khôi phục'}
                onChangeText={props.onRecoveryIdentifierChange}
                placeholder={recoveryUsesPhone ? '090 123 4567' : 'email@example.com'}
                testID="auth-recovery-secondary-input"
                textContentType={recoveryUsesPhone ? 'telephoneNumber' : 'emailAddress'}
                value={props.recoveryIdentifier}
              />
            ) : null}
            {props.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{props.error}</Text> : null}
            <PrimaryButton disabled={props.busy} label={props.busy ? 'Đang xử lý…' : 'Tiếp tục'} onPress={props.onSubmit} testID="auth-recovery-submit" />
          </NativeSafeGlassPanel>
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
  panel: { borderRadius: entryTheme.radius.sheet, paddingBottom: 15, paddingHorizontal: 15, paddingTop: 17 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 18, paddingHorizontal: entryTheme.spacing.screenX },
  title: { color: entryTheme.color.text.strong, fontSize: 29, fontWeight: '700', lineHeight: 35 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -3, marginBottom: 6, minHeight: 48 },
  topbarSpacer: { height: 42, width: 42 },
  topbarTitle: { color: entryTheme.color.text.strong, fontSize: 17, fontWeight: '700' },
})
