import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { typography } from '@/design/theme'

import { useCustomerV21SurfaceTheme, V21Card, V21Screen, V21TopBar } from '../ui/shared-surfaces'

export function CustomerProfileAvatarPrototype() {
  const router = useRouter()
  const { reduceMotion } = useGlassAccessibility()
  const { tokens } = useCustomerV21SurfaceTheme()

  return (
    <V21Screen
      frameStyle={styles.frame}
      screenId="6.1-profile-overview"
      testID="customer-profile-avatar-prototype"
    >
      <V21TopBar
        onBack={() => router.back()}
        showAvatar={false}
        subtitle=""
        testID="customer-profile-avatar-prototype-top-bar"
        title="Hồ sơ khách hàng"
        titleStyle={styles.topTitle}
      />

      <V21Card
        style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-profile-avatar-prototype-card"
      >
        <View style={styles.identityRow}>
          <Pressable
            accessibilityHint="Mở lựa chọn chụp ảnh hoặc chọn từ thư viện."
            accessibilityLabel="Thêm ảnh đại diện"
            accessibilityRole="button"
            onPress={() => undefined}
            style={({ pressed }) => [
              styles.avatarFrame,
              { backgroundColor: tokens.raised, borderColor: tokens.border },
              pressed && !reduceMotion ? styles.pressed : null,
            ]}
            testID="customer-profile-avatar-prototype-classic-avatar"
          >
            <View style={[styles.cameraBadge, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="customer-profile-avatar-prototype-classic-camera">
              <Svg height={14} viewBox="0 0 16 16" width={14}>
                <Path
                  d="M5.2 4.2 6.1 2.8h3.8l.9 1.4h1.6c.9 0 1.6.7 1.6 1.6v5.1c0 .9-.7 1.6-1.6 1.6H3.6c-.9 0-1.6-.7-1.6-1.6V5.8c0-.9.7-1.6 1.6-1.6h1.6ZM8 10.8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                  fill="none"
                  stroke={tokens.text}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.3}
                />
              </Svg>
            </View>
          </Pressable>

          <View style={styles.copy}>
            <Text numberOfLines={2} style={[styles.name, { color: tokens.text }]}>NestScout Customer</Text>
            <Text numberOfLines={1} style={[styles.memberSince, { color: tokens.muted }]}>Thành viên từ 18/08/2026</Text>
            <View style={styles.summary}>
              <Text numberOfLines={1} style={[styles.day, { color: tokens.text }]}>Ngày thứ 1</Text>
              <View style={[styles.dot, { backgroundColor: tokens.primary }]} />
              <Text numberOfLines={1} style={[styles.service, { color: tokens.muted }]}>Dùng dịch vụ: Chưa có</Text>
            </View>
          </View>
        </View>
      </V21Card>
    </V21Screen>
  )
}

const styles = StyleSheet.create({
  avatarFrame: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
    height: 84,
    justifyContent: 'center',
    position: 'relative',
    width: 84,
  },
  cameraBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    bottom: -2,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 26,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  copy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  day: {
    ...typography.caption1,
    fontWeight: '600',
  },
  dot: {
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  frame: {
    gap: 0,
  },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minHeight: 84,
  },
  memberSince: {
    ...typography.caption1,
    fontWeight: '600',
  },
  name: {
    ...typography.title3,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  service: {
    ...typography.caption1,
    flexShrink: 1,
    fontWeight: '600',
  },
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  topTitle: {
    fontWeight: '600',
  },
})
