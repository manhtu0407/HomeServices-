import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '@/constants/colors'

export default function WorkerProfile() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hồ sơ Thợ</Text>
      <Text style={styles.subtitle}>Thông tin cá nhân và xác minh</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  title: { fontSize: 24, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  subtitle: { fontSize: 16, color: Colors.textSecondary },
})
