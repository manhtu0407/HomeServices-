import { Redirect } from 'expo-router'
import { Stack } from 'expo-router/stack'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AppLoadingShell } from '@/components/ui/app-loading-shell'
import { useAuth } from '@/lib/auth-provider'
import { isAuthShellBlocking } from '@/lib/auth-loading-gate'
import { useAdminActivation } from '@/lib/admin-activation-provider'
import { useClaimPendingInvite } from '@/lib/referral/use-claim-pending-invite'
import { typography } from '@/design/theme'
import { mobileRuntimeConfig } from '@/lib/runtime-config'

function runtimeBuildMarkerText() {
  const info = mobileRuntimeConfig.runtimeBuildInfo
  const sha = info.gitShortSha || (info.gitSha ? info.gitSha.slice(0, 12) : '') || 'unknown'
  const parts = [`SHA ${sha}`]

  if (info.releaseId) parts.push(`Release ${info.releaseId}`)
  if (info.gitBranch) parts.push(`Branch ${info.gitBranch}`)
  if (info.easBuildProfile) parts.push(`Profile ${info.easBuildProfile}`)
  if (info.easBuildPlatform) parts.push(`Platform ${info.easBuildPlatform}`)
  if (info.easBuildId) parts.push(`Build ${info.easBuildId}`)
  if (info.builtAt) parts.push(`Built ${info.builtAt}`)

  return parts.join(' | ')
}

function CustomerRuntimeBuildMarker() {
  const [visible, setVisible] = useState(false)
  const marker = useMemo(() => runtimeBuildMarkerText(), [])

  return (
    <>
      <Pressable
        accessibilityLabel={`NestScout customer runtime marker: ${marker}`}
        accessibilityRole="button"
        hitSlop={6}
        onLongPress={() => setVisible(true)}
        onPress={() => visible && setVisible(false)}
        style={styles.runtimeMarkerHotspot}
        testID="customer-runtime-marker-hotspot"
      />
      {visible ? (
        <View
          pointerEvents="none"
          style={styles.runtimeMarkerPill}
          testID="customer-runtime-marker"
        >
          <Text selectable style={styles.runtimeMarkerText}>
            {marker}
          </Text>
        </View>
      ) : null}
    </>
  )
}

export default function CustomerLayout() {
  const { guestMode, loading, profileStatus, role, session } = useAuth()
  const activation = useAdminActivation()
  useClaimPendingInvite(session?.access_token, role === 'customer')
  const authShellBlocking = isAuthShellBlocking({ guestMode, loading, profileStatus, role, session })
  const activationShellBlocking = Boolean(session && activation.loading && !activation.status)

  if (authShellBlocking || activationShellBlocking) {
    return <AppLoadingShell />
  }

  if (!session && !guestMode) {
    return <Redirect href="/(auth)/login" />
  }
  if (session && activation.status?.required) return <Redirect href="/(auth)/admin-activation" />

  if (session && role === 'worker') {
    return <Redirect href="/(worker)/(tabs)/home" />
  }

  if (session && role === 'admin') {
    return <Redirect href="/(admin)/sections" />
  }

  if (session && role === 'admin_operator') {
    return <Redirect href="/(admin)/sections" />
  }

  if (session && role !== 'customer') {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="kael" options={{ headerShown: false }} />
        <Stack.Screen name="kael-chat" options={{ headerShown: false }} />
        <Stack.Screen name="current-job-prototype" options={{ headerShown: false }} />
      </Stack>
      <CustomerRuntimeBuildMarker />
    </View>
  )
}

const styles = StyleSheet.create({
  runtimeMarkerHotspot: {
    height: 1,
    opacity: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: 1,
    zIndex: 200,
  },
  runtimeMarkerPill: {
    backgroundColor: 'rgba(7,26,36,0.86)',
    borderRadius: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 201,
  },
  runtimeMarkerText: {
    color: '#FFFFFF',
    ...typography.caption1,
    fontWeight: '600',
  },
})
