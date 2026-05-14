import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '@/constants/colors'

export default function BookingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đặt lịch</Text>
      <Text style={styles.subtitle}>Chọn dịch vụ: Sửa Điện hoặc Sửa Nước</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  subtitle: { fontSize: 16, color: Colors.textSecondary },
})
