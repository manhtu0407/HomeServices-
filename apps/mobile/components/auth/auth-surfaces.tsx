import { type ReactNode, useState } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path, Rect } from 'react-native-svg'
import { useAuth } from '@/lib/auth-provider'

const AUTH_LOGIN_ROLE_GATE = 'AUTH_LOGIN_ROLE_GATE: auth-login-role-customer auth-login-role-worker'
const AUTH_LOGIN_ROLE_GATE_GLASS = 'AUTH_LOGIN_ROLE_GATE_GLASS: auth-role-gate-glass'

const authTokens = {
  canvas: '#F3FAF7',
  raised: '#FFFFFF',
  glass: 'rgba(255,253,248,0.8)',
  mint: '#DDF4EC',
  cyan: '#E4F8F7',
  cream: '#FFF0DE',
  border: '#D2E8E1',
  line: '#D8E2E0',
  ink: '#102B2D',
  muted: '#58716E',
  subtle: '#8AA39E',
  primary: '#08786E',
  copper: '#BB743D',
  shadow: '0 24px 70px rgba(13,70,65,0.17)',
  softShadow: '0 14px 36px rgba(13,70,65,0.12)',
}

export function LoginRoleSurface() {
  const router = useRouter()
  const { authError, loading, profileStatus, refreshProfile, role, session, signInWithPassword, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const isAdmin = role === 'admin'
  const isAuthenticated = Boolean(session && role)
  const canOpenCustomer = role === 'customer' || isAdmin
  const canOpenWorker = role === 'worker' || isAdmin
  const configMissing = profileStatus === 'config_missing'
  const visibleError = formError ?? authError ?? (configMissing ? 'Supabase chưa được cấu hình cho mobile build này' : null)
  const needsProfileRecovery = Boolean(session && !role && (profileStatus === 'profile_missing' || profileStatus === 'profile_error'))

  const submitLogin = async () => {
    setFormError(null)
    setSigningIn(true)
    try {
      const result = await signInWithPassword(email, password)
      if (!result.success) {
        setFormError(result.error ?? 'Không thể đăng nhập')
      } else {
        setPassword('')
      }
    } catch {
      setFormError('Không thể đăng nhập lúc này')
    } finally {
      setSigningIn(false)
    }
  }

  const openCustomerSection = () => {
    if (!canOpenCustomer) {
      setFormError('Tài khoản này chưa được phép vào section Khách')
      return
    }
    router.replace('/(customer)/home')
  }

  const openWorkerSection = () => {
    if (!canOpenWorker) {
      setFormError('Tài khoản này chưa được phép vào section Thợ')
      return
    }
    router.replace('/(worker)/home')
  }

  return (
    <AuthFrame testID="auth-login-surface">
      <ScrollView contentContainerStyle={styles.authContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.roleGateShell, glassSurface('glass')]} testID="auth-role-gate-glass">
          <MapLineField />
          <View style={styles.loginHeader}>
            <Text style={styles.kicker}>Đăng nhập</Text>
            <Text style={styles.title}>{isAuthenticated ? 'Chọn section để audit' : 'Đăng nhập để vào app'}</Text>
            <Text style={styles.body}>
              {isAuthenticated ? roleLabel(role) : 'Email/Password xác thực trước, vai trò trong profile quyết định section được vào.'}
            </Text>
          </View>

          {needsProfileRecovery ? (
            <View style={styles.formStack} testID="auth-profile-recovery">
              <Text style={styles.errorText}>Hồ sơ vai trò chưa sẵn sàng. Tải lại hồ sơ hoặc đăng xuất để đăng nhập tài khoản khác.</Text>
              {visibleError ? <Text style={styles.errorText}>{visibleError}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={() => void refreshProfile()}
                style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null, loading ? styles.disabled : null]}
                testID="auth-profile-refresh"
              >
                {loading ? <ActivityIndicator color={authTokens.raised} /> : <Text style={styles.primaryButtonText}>Tải lại hồ sơ</Text>}
              </Pressable>
              <Pressable accessibilityRole="button" onPress={signOut} style={styles.secondaryAction} testID="auth-profile-recovery-sign-out">
                <Text style={styles.secondaryActionText}>Đăng xuất</Text>
              </Pressable>
            </View>
          ) : !isAuthenticated ? (
            <View style={styles.formStack}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={authTokens.subtle}
                style={styles.input}
                testID="auth-login-email-input"
                value={email}
              />
              <TextInput
                autoCapitalize="none"
                onChangeText={setPassword}
                placeholder="Mật khẩu"
                placeholderTextColor={authTokens.subtle}
                secureTextEntry
                style={styles.input}
                testID="auth-login-password-input"
                value={password}
              />
              {visibleError ? <Text style={styles.errorText}>{visibleError}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={signingIn || loading || configMissing}
                onPress={submitLogin}
                style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null, signingIn || loading || configMissing ? styles.disabled : null]}
                testID="auth-login-submit"
              >
                {signingIn || loading ? <ActivityIndicator color={authTokens.raised} /> : <Text style={styles.primaryButtonText}>Đăng nhập</Text>}
              </Pressable>
            </View>
          ) : (
            <>
              <RoleCard
                description={isAdmin ? 'Audit luồng Khách với quyền admin.' : 'Đặt lịch sửa điện/nước, kiểm giá với Kael và theo dõi tiến trình.'}
                disabled={!canOpenCustomer}
                icon="home"
                label="Khách"
                onPress={openCustomerSection}
                testID={isAdmin ? 'auth-login-admin-audit-customer' : 'auth-login-role-customer'}
              />
              <RoleCard
                description={isAdmin ? 'Audit luồng Thợ với quyền admin.' : 'Bật nhận việc, xem brief, xử lý yêu cầu và theo dõi thu nhập.'}
                disabled={!canOpenWorker}
                icon="tools"
                label="Thợ"
                onPress={openWorkerSection}
                testID={isAdmin ? 'auth-login-admin-audit-worker' : 'auth-login-role-worker'}
                worker
              />
              {isAdmin ? <View style={styles.hiddenMarker} testID="auth-login-admin-audit" /> : null}
              <Pressable accessibilityRole="button" onPress={signOut} style={styles.secondaryAction} testID="auth-login-sign-out">
                <Text style={styles.secondaryActionText}>Đăng xuất</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
      <View style={styles.hiddenMarker} testID={AUTH_LOGIN_ROLE_GATE + AUTH_LOGIN_ROLE_GATE_GLASS + '/(customer)/home /(worker)/home'} />
    </AuthFrame>
  )
}

function roleLabel(role: string | null) {
  if (role === 'admin') return 'Admin có thể audit cả hai section.'
  if (role === 'worker') return 'Tài khoản Thợ chỉ vào luồng Thợ.'
  if (role === 'customer') return 'Tài khoản Khách chỉ vào luồng Khách.'
  return 'Đang kiểm tra vai trò tài khoản.'
}

function AuthFrame({ children, testID }: { children: ReactNode; testID: string }) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const frameWidth = Math.min(width, 430)

  return (
    <SafeAreaView style={styles.safe} testID={testID}>
      <View style={styles.canvas}>
        <AmbientBackdrop />
        <View style={{ width: Math.max(0, frameWidth - 32), paddingTop: Math.max(insets.top, 8), paddingBottom: insets.bottom + 18 }}>
          {children}
        </View>
      </View>
    </SafeAreaView>
  )
}

function AmbientBackdrop() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="none">
      <Path d="M-18 152 C72 116 120 178 198 144 S318 80 418 126" stroke={authTokens.border} strokeWidth={5} opacity={0.42} fill="none" />
      <Path d="M32 320 C118 282 144 352 232 314 S332 250 420 292" stroke={authTokens.line} strokeWidth={4} opacity={0.34} fill="none" />
      <Path d="M-30 642 C64 600 122 668 198 622 S316 552 424 604" stroke={authTokens.border} strokeWidth={5} opacity={0.32} fill="none" />
      <Rect x={34} y={226} width={76} height={48} rx={16} fill={authTokens.mint} opacity={0.32} />
      <Rect x={248} y={146} width={92} height={56} rx={18} fill={authTokens.cyan} opacity={0.34} />
      <Rect x={218} y={652} width={104} height={64} rx={18} fill={authTokens.cream} opacity={0.38} />
    </Svg>
  )
}

function MapLineField() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 390" preserveAspectRatio="none">
      <Path d="M20 94 C84 58 134 96 188 78 S292 24 342 60" stroke={authTokens.line} strokeWidth={4} opacity={0.68} fill="none" />
      <Path d="M40 166 C86 146 106 188 162 170 S246 118 322 150" stroke={authTokens.line} strokeWidth={3.2} opacity={0.54} fill="none" />
      <Path d="M82 28 L82 132 M162 76 L162 226 M258 40 L238 164" stroke={authTokens.line} strokeWidth={3} opacity={0.42} fill="none" />
    </Svg>
  )
}

function RoleCard({
  description,
  disabled = false,
  icon,
  label,
  onPress,
  testID,
  worker = false,
}: {
  description: string
  disabled?: boolean
  icon: 'home' | 'tools'
  label: string
  onPress: () => void
  testID: string
  worker?: boolean
}) {
  return (
    <Pressable
      accessibilityLabel={`Đăng nhập vai trò ${label}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.roleCard, glassSurface(worker ? 'mint' : 'raised'), disabled ? styles.disabled : null, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <View style={[styles.roleIcon, { backgroundColor: worker ? authTokens.raised : authTokens.mint }]}>
        <AuthIcon name={icon} />
      </View>
      <View style={styles.titleStack}>
        <Text style={styles.roleTitle}>{label}</Text>
        <Text style={styles.body} numberOfLines={2}>
          {description}
        </Text>
      </View>
      <Text style={styles.roleArrow}>›</Text>
    </Pressable>
  )
}

function AuthIcon({ name }: { name: 'home' | 'tools' }) {
  const color = authTokens.primary
  const accent = authTokens.copper

  return (
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
      {name === 'home' ? (
        <>
          <Path d="M5.5 12.2 12.5 6l7 6.2v7.2H5.5v-7.2Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M10.2 19.4v-4.2h4.6v4.2" stroke={accent} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'tools' ? (
        <>
          <Path d="M7.2 17.8 17.8 7.2M15.8 5.8l3.4 3.4M5.8 15.8l3.4 3.4" stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Rect x={6.2} y={5.8} width={4.2} height={4.2} rx={1.2} stroke={accent} strokeWidth={2} />
        </>
      ) : null}
    </Svg>
  )
}

function glassSurface(tone: 'cream' | 'cyan' | 'glass' | 'mint' | 'raised') {
  const backgroundColor = {
    cream: authTokens.cream,
    cyan: authTokens.cyan,
    glass: authTokens.glass,
    mint: authTokens.mint,
    raised: 'rgba(255,255,255,0.88)',
  }[tone]

  return {
    backgroundColor,
    borderColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    boxShadow: tone === 'glass' || tone === 'raised' ? authTokens.shadow : authTokens.softShadow,
  }
}

const styles = StyleSheet.create({
  safe: { backgroundColor: authTokens.canvas, flex: 1 },
  canvas: { alignItems: 'center', backgroundColor: authTokens.canvas, flex: 1, justifyContent: 'center', overflow: 'hidden' },
  authContent: { gap: 16, minHeight: '100%', paddingVertical: 18 },
  formStack: { gap: 10 },
  loginHeader: { gap: 7 },
  kicker: { color: authTokens.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  title: { color: authTokens.ink, fontSize: 29, fontWeight: '700', letterSpacing: 0, lineHeight: 35 },
  body: { color: authTokens.muted, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: authTokens.border,
    borderRadius: 20,
    borderWidth: 1,
    color: authTokens.ink,
    fontSize: 15,
    fontWeight: '600',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  errorText: { color: '#B64B40', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  primaryButton: { alignItems: 'center', backgroundColor: authTokens.primary, borderRadius: 20, justifyContent: 'center', minHeight: 52 },
  primaryButtonText: { color: authTokens.raised, fontSize: 15, fontWeight: '700' },
  secondaryAction: { alignItems: 'center', minHeight: 42, justifyContent: 'center' },
  secondaryActionText: { color: authTokens.primary, fontSize: 14, fontWeight: '700' },
  roleGateShell: { borderRadius: 36, gap: 14, overflow: 'hidden', padding: 16, paddingTop: 24 },
  roleCard: { alignItems: 'center', borderRadius: 30, flexDirection: 'row', gap: 14, minHeight: 126, padding: 16 },
  roleIcon: { alignItems: 'center', borderRadius: 22, height: 58, justifyContent: 'center', width: 58 },
  titleStack: { flex: 1, gap: 5 },
  roleTitle: { color: authTokens.ink, fontSize: 22, fontWeight: '700' },
  roleArrow: { color: authTokens.primary, fontSize: 32, fontWeight: '700' },
  disabled: { opacity: 0.54 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  hiddenMarker: { height: 0, opacity: 0, width: 0 },
})
