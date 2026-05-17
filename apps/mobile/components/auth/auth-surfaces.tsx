import { type ReactNode } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path, Rect } from 'react-native-svg'

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

  return (
    <AuthFrame testID="auth-login-surface">
      <ScrollView contentContainerStyle={styles.authContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.roleGateShell, glassSurface('glass')]} testID="auth-role-gate-glass">
          <MapLineField />
          <View style={styles.loginHeader}>
            <Text style={styles.kicker}>Đăng nhập</Text>
            <Text style={styles.title}>Bạn vào app với vai trò nào?</Text>
            <Text style={styles.body}>Chọn đúng vai trò để vào section tương ứng.</Text>
          </View>

          <RoleCard
            description="Đặt lịch sửa điện/nước, kiểm giá với Kael và theo dõi tiến trình."
            icon="home"
            label="Khách"
            onPress={() => router.replace('/(customer)/home')}
            testID="auth-login-role-customer"
          />
          <RoleCard
            description="Bật nhận việc, xem brief, xử lý yêu cầu và theo dõi thu nhập."
            icon="tools"
            label="Thợ"
            onPress={() => router.replace('/(worker)/home')}
            testID="auth-login-role-worker"
            worker
          />
        </View>
      </ScrollView>
      <View style={styles.hiddenMarker} testID={AUTH_LOGIN_ROLE_GATE + AUTH_LOGIN_ROLE_GATE_GLASS + '/(customer)/home /(worker)/home'} />
    </AuthFrame>
  )
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
    <>
      <View style={styles.backdropMint} />
      <View style={styles.backdropCream} />
      <View style={styles.backdropCyan} />
    </>
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
  icon,
  label,
  onPress,
  testID,
  worker = false,
}: {
  description: string
  icon: 'home' | 'tools'
  label: string
  onPress: () => void
  testID: string
  worker?: boolean
}) {
  return (
    <Pressable
      accessibilityLabel={`Đăng nhập vai trò ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.roleCard, glassSurface(worker ? 'mint' : 'raised'), pressed ? styles.pressed : null]}
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
  backdropMint: { backgroundColor: '#DDF4EC', borderRadius: 999, height: 270, opacity: 0.84, position: 'absolute', right: -104, top: 60, width: 270 },
  backdropCream: { backgroundColor: '#FFF0DE', borderRadius: 999, bottom: 50, height: 210, left: -88, opacity: 0.72, position: 'absolute', width: 210 },
  backdropCyan: { backgroundColor: '#E4F8F7', borderRadius: 999, height: 160, left: -72, opacity: 0.64, position: 'absolute', top: 160, width: 160 },
  authContent: { gap: 16, minHeight: '100%', paddingVertical: 18 },
  loginHeader: { gap: 7 },
  kicker: { color: authTokens.primary, fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  title: { color: authTokens.ink, fontSize: 29, fontWeight: '700', letterSpacing: 0, lineHeight: 35 },
  body: { color: authTokens.muted, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  roleGateShell: { borderRadius: 36, gap: 14, overflow: 'hidden', padding: 16, paddingTop: 24 },
  roleCard: { alignItems: 'center', borderRadius: 30, flexDirection: 'row', gap: 14, minHeight: 126, padding: 16 },
  roleIcon: { alignItems: 'center', borderRadius: 22, height: 58, justifyContent: 'center', width: 58 },
  titleStack: { flex: 1, gap: 5 },
  roleTitle: { color: authTokens.ink, fontSize: 22, fontWeight: '700' },
  roleArrow: { color: authTokens.primary, fontSize: 32, fontWeight: '700' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  hiddenMarker: { height: 0, opacity: 0, width: 0 },
})
