import { useState } from 'react'
import { Redirect, useRouter } from 'expo-router'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { useAdminActivation } from '@/lib/admin-activation-provider'
import { useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { styles } from '@/components/admin/admin-sections-styles'

export function AdminActivationSurface() {
  const router = useRouter()
  const language = useAppLanguage()
  const copy = activationCopy[language]
  const { activate, error, loading, status } = useAdminActivation()
  const { session } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  if (!session) return <Redirect href="/(auth)/login" />
  if (!loading && !status) return <Redirect href="/" />
  if (!loading && status && !status.required) return <Redirect href="/" />

  const submit = async () => {
    if (newPassword.length < 8 || newPassword.length > 128 || newPassword !== confirmPassword) {
      setValidation(copy.invalidPassword)
      return
    }
    if (currentPassword === newPassword) {
      setValidation(copy.samePassword)
      return
    }
    setValidation(null)
    if (await activate({ current_password: currentPassword, new_password: newPassword })) {
      router.replace('/(auth)/login?stage=login&admin_activation=complete')
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.activationScrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, styles.activationCard]} testID="admin-first-password-change">
          <Text style={styles.heroTitle}>{copy.title}</Text>
          <Text style={styles.heroBody}>
            {status?.full_name ? `${copy.hello} ${status.full_name}. ` : ''}{copy.body(status?.email_masked ?? '')}
          </Text>
          <View style={styles.activationForm}>
            <KaelTextField accessibilityLabel={copy.currentPassword} onChangeText={setCurrentPassword} placeholder={copy.currentPassword} secureTextEntry value={currentPassword} />
            <KaelTextField accessibilityLabel={copy.newPassword} onChangeText={setNewPassword} placeholder={copy.newPassword} secureTextEntry value={newPassword} />
            <KaelTextField accessibilityLabel={copy.confirmPassword} onChangeText={setConfirmPassword} placeholder={copy.confirmPassword} secureTextEntry value={confirmPassword} />
          </View>
          {validation || error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{validation ?? error}</Text> : null}
          {loading ? <ActivityIndicator /> : <KaelButton label={copy.submit} onPress={() => void submit()} testID="admin-first-password-submit" />}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const activationCopy = {
  vi: {
    body: (email: string) => `Tài khoản ${email} chỉ được mở quyền quản trị sau khi bạn tự đặt mật khẩu mới.`,
    confirmPassword: 'Nhập lại mật khẩu mới',
    currentPassword: 'Mật khẩu ban đầu',
    hello: 'Xin chào',
    invalidPassword: 'Mật khẩu mới phải có 8–128 ký tự và hai ô phải khớp nhau.',
    newPassword: 'Mật khẩu mới',
    samePassword: 'Mật khẩu mới phải khác mật khẩu ban đầu.',
    submit: 'Đổi mật khẩu và kích hoạt',
    title: 'Đổi mật khẩu lần đầu',
  },
  en: {
    body: (email: string) => `Admin access for ${email} opens only after you set your own password.`,
    confirmPassword: 'Confirm new password',
    currentPassword: 'Initial password',
    hello: 'Welcome',
    invalidPassword: 'The new password must contain 8–128 characters and both fields must match.',
    newPassword: 'New password',
    samePassword: 'The new password must differ from the initial password.',
    submit: 'Change password and activate',
    title: 'Change your password',
  },
} as const
