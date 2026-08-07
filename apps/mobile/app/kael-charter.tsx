import { useEffect, useState } from 'react'
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'

import { color, radius, spacing, typography } from '@/design/theme'
import { useAppLanguage } from '@/lib/app-language'
import type { KaelPublicCharterPayload } from '@/lib/api-types'
import { kaelCharterService } from '@/lib/services'

export default function KaelCharterScreen() {
  const router = useRouter()
  const language = useAppLanguage()
  const [charter, setCharter] = useState<KaelPublicCharterPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void kaelCharterService.getPublicCharter().then((result) => {
      if (!active) return
      if (result.success) setCharter(result.data)
      else setError(language === 'vi' ? 'Chưa thể tải nguyên tắc của Kael.' : 'Kael’s charter is unavailable.')
    }).catch(() => {
      if (active) setError(language === 'vi' ? 'Chưa thể tải nguyên tắc của Kael.' : 'Kael’s charter is unavailable.')
    })
    return () => { active = false }
  }, [language])

  const title = language === 'vi' ? 'Nguyên tắc công khai của Kael' : 'Kael public charter'
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} testID="kael-charter-back">
          <Text style={styles.back}>{language === 'vi' ? 'Quay lại' : 'Back'}</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!charter && !error ? <Text style={styles.muted}>{language === 'vi' ? 'Đang tải…' : 'Loading…'}</Text> : null}
        {charter ? (
          <View style={styles.card} testID="kael-public-charter">
            <Text style={styles.version}>Version {charter.charter_version}</Text>
            <Text style={styles.identity}>{charter.identity_summary}</Text>
            <CharterSection title={language === 'vi' ? 'Giá trị' : 'Mission values'} values={charter.mission_values} />
            <CharterSection title={language === 'vi' ? 'Cam kết bị khóa' : 'Locked commitments'} values={charter.locked_files} />
            <CharterSection title={language === 'vi' ? 'Hướng dẫn có thể điều chỉnh' : 'Tunable guidance'} values={charter.tunable_files} />
            <CharterSection title={language === 'vi' ? 'Những điều Kael không được nói' : 'Forbidden categories'} values={charter.forbidden_categories} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function CharterSection({ title, values }: { title: string; values: readonly string[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {values.map((value) => <Text key={value} style={styles.item}>• {value}</Text>)}
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { backgroundColor: color.background, flex: 1 },
  content: { gap: spacing.lg, padding: spacing.xl },
  back: { ...typography.callout, color: color.brand.primaryDark, fontWeight: '600' },
  title: { ...typography.title1, color: color.text.primary, fontWeight: '600' },
  card: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: radius.lg, borderWidth: 1, gap: spacing.lg, padding: spacing.xl },
  version: { ...typography.caption1, color: color.text.muted },
  identity: { ...typography.body, color: color.text.primary },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.headline, color: color.text.strong },
  item: { ...typography.subheadline, color: color.text.secondary },
  muted: { ...typography.body, color: color.text.muted },
  error: { ...typography.body, color: color.accent.destructive },
})
