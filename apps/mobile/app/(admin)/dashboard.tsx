// Phase 5.1 (plan §22.10.B, 2026-05-23): minimal admin dashboard. Real admin
// flows (worker approval, learning candidates, jobs audit) live in apps/api
// reference + Supabase Studio for now. This shell keeps admin out of customer
// and worker dock so misclicks cannot create real workflow side effects.
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/lib/auth-provider'

export default function AdminDashboard() {
  const { replace } = useRouter()
  const { signOut } = useAuth()

  return (
    <ScrollView contentContainerStyle={styles.container} testID="admin-dashboard">
      <Text style={styles.banner} testID="admin-shell-banner">
        Khu vực Admin — xem & kiểm toán, không thao tác thay khách/thợ
      </Text>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trang Admin (giai đoạn 0)</Text>
        <Text style={styles.sectionBody}>
          Quy trình admin chính thức (duyệt thợ, kiểm tra Kael, rollback rule) sử dụng Supabase
          Studio và Edge admin route. Mobile admin shell chỉ phục vụ điều hướng và phòng ngừa
          thao tác nhầm trong vai trò khách/thợ.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => replace('/(auth)/login')}
        style={styles.button}
        testID="admin-shell-switch-account"
      >
        <Text style={styles.buttonText}>Đăng xuất / Đổi tài khoản</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut?.()}
        style={[styles.button, styles.secondaryButton]}
        testID="admin-shell-sign-out"
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFE9B0',
    borderRadius: 14,
    color: '#5C3C00',
    fontWeight: '700',
    padding: 12,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#256B47',
    borderRadius: 16,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  container: { gap: 18, padding: 20 },
  section: {
    backgroundColor: '#FAF6EE',
    borderColor: '#D8E2DC',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  sectionBody: { color: '#52615C', fontSize: 14, lineHeight: 20 },
  sectionTitle: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
  secondaryButton: { backgroundColor: '#52615C' },
})
