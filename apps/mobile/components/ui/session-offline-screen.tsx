import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { KaelButton } from '@/components/ui/kael-primitives'
import { color, customerTheme, typography } from '@/design/theme'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { setRecoveryProbe, useConnectivity } from '@/lib/connectivity'

const textByLanguage = (language: AppLanguage, vi: string, en: string) => (language === 'vi' ? vi : en)

// A valid session whose role cannot be read because the server is unreachable. Before this screen the shell
// stayed blank for 8-21 s and then fell to the Login Gate, which read as being signed out.
export function SessionOfflineGate() {
  const { profileStatus, refreshProfile, role, session, signOut } = useAuth()
  const connectivity = useConnectivity()
  const roleUnknown = Boolean(session && !role)
  const unreachable = roleUnknown && (profileStatus === 'network_unavailable' || (profileStatus === 'loading' && connectivity === 'offline'))
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (unreachable) setShown(true)
    else if (!roleUnknown || profileStatus !== 'loading') setShown(false)
  }, [profileStatus, roleUnknown, unreachable])

  // A retry flips the status to loading; staying up through it avoids flashing the blank shell between attempts.
  const visible = unreachable || (shown && roleUnknown && profileStatus === 'loading')

  useEffect(() => {
    if (!visible) return
    return setRecoveryProbe(() => refreshProfile())
  }, [refreshProfile, visible])

  if (!visible) return null
  return <SessionOfflineScreen onRetry={refreshProfile} onSignOut={signOut} />
}

export function SessionOfflineScreen({ onRetry, onSignOut }: { onRetry: () => Promise<unknown>; onSignOut: () => Promise<void> }) {
  const language = useAppLanguage()
  const dark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const [retrying, setRetrying] = useState(false)
  const retry = useCallback(async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }, [onRetry])

  const ink = dark ? customerTheme.darkLayer.text : color.text.primary
  const muted = dark ? customerTheme.darkLayer.muted : color.text.secondary

  return (
    <View
      style={[styles.screen, { backgroundColor: dark ? customerTheme.darkLayer.canvas : color.surface.soft, paddingBottom: insets.bottom + 24, paddingTop: insets.top + 24 }]}
      testID="session-offline-screen"
    >
      <View style={styles.body}>
        <Text accessibilityRole="header" style={[styles.title, { color: ink }]}>
          {textByLanguage(language, 'Chưa kết nối được máy chủ', 'Can’t reach NestScout')}
        </Text>
        <Text style={[styles.message, { color: muted }]}>
          {textByLanguage(
            language,
            'Bạn vẫn đang đăng nhập. Hãy kiểm tra wifi hoặc dữ liệu di động — NestScout sẽ tự thử lại khi có mạng.',
            'You are still signed in. Check Wi-Fi or mobile data — NestScout retries on its own once you are back online.',
          )}
        </Text>
      </View>
      <View style={styles.actions}>
        <KaelButton
          label={textByLanguage(language, 'Thử lại', 'Try again')}
          loading={retrying}
          disabled={retrying}
          onPress={() => void retry()}
          testID="session-offline-retry"
        />
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => void onSignOut()}
          style={styles.signOut}
          testID="session-offline-sign-out"
        >
          <Text style={[styles.signOutLabel, { color: muted }]}>{textByLanguage(language, 'Đăng xuất', 'Sign out')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
  },
  body: {
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  message: {
    ...typography.body,
  },
  screen: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 24,
    zIndex: 100,
  },
  signOut: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  signOutLabel: {
    ...typography.callout,
    fontWeight: '600',
  },
  title: {
    ...typography.title2,
    fontWeight: '600',
  },
})
