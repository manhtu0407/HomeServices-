import { View, Text, StyleSheet } from 'react-native'
import { Colors } from '@/constants/colors'

export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home Services</Text>
      <Text style={styles.subtitle}>Nhập số điện thoại để tiếp tục</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  title: { fontSize: 28, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  subtitle: { fontSize: 16, color: Colors.textSecondary },
})
