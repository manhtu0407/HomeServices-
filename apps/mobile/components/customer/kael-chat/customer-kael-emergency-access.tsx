import { useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { kaelEmergencyGuidanceCopy, type EmergencyGuidancePayload } from '@nestscout/shared'
import { KaelButton } from '@/components/ui/kael-primitives'
import { spacing, typography } from '@/design/theme'
import type { CustomerThemeTokens } from '../customer-theme'

type Route = EmergencyGuidancePayload['route']
const ROUTES: Route[] = ['uncertain', 'fire', 'medical', 'police', 'electrical_water', 'gas']
const LABELS: Record<Route, { vi: string; en: string }> = {
  uncertain: { vi: 'Khẩn cấp chưa rõ — 112', en: 'Unclear emergency — 112' },
  fire: { vi: 'Khói hoặc lửa — 114', en: 'Smoke or fire — 114' },
  medical: { vi: 'Cấp cứu y tế — 115', en: 'Medical emergency — 115' },
  police: { vi: 'Bị đe dọa — 113', en: 'Threat or break-in — 113' },
  electrical_water: { vi: 'Nguy hiểm điện hoặc nước', en: 'Electrical or water hazard' },
  gas: { vi: 'Rò rỉ gas', en: 'Fuel-gas leak' },
}

export function CustomerKaelEmergencyAccess({ guidance, language, tokens }: {
  guidance?: EmergencyGuidancePayload | null
  language: 'vi' | 'en'
  tokens: CustomerThemeTokens
}) {
  const [open, setOpen] = useState(false)
  const title = language === 'vi' ? 'Hỗ trợ khẩn cấp' : 'Emergency help'
  return (
    <View style={styles.access}>
      {guidance ? (
        <View accessibilityLiveRegion="assertive" style={[styles.guidance, { backgroundColor: tokens.raised, borderColor: tokens.danger }]} testID="kael-emergency-guidance">
          <Text accessibilityRole="header" style={[styles.title, { color: tokens.text }]}>{title}</Text>
          <ScrollView><Text selectable style={[styles.body, { color: tokens.text }]}>{kaelEmergencyGuidanceCopy(guidance.route, language)}</Text></ScrollView>
        </View>
      ) : null}
      <KaelButton label={title} onPress={() => setOpen(true)} size="small" variant="ghost" testID="kael-emergency-access" />
      <Modal animationType="none" visible={open} onRequestClose={() => setOpen(false)} presentationStyle="pageSheet">
        <SafeAreaView style={[styles.sheet, { backgroundColor: tokens.canvas }]}>
          <View accessibilityViewIsModal style={styles.sheet}>
            <Text accessibilityRole="header" style={[styles.title, { color: tokens.text }]}>{title}</Text>
            <KaelButton label={language === 'vi' ? 'Đóng' : 'Close'} onPress={() => setOpen(false)} variant="secondary" testID="kael-emergency-close" />
            <ScrollView contentContainerStyle={styles.sections}>
              {ROUTES.map((route) => (
                <View key={route} style={styles.section}>
                  <Text accessibilityRole="header" style={[styles.title, { color: tokens.text }]}>{LABELS[route][language]}</Text>
                  <Text selectable style={[styles.body, { color: tokens.text }]}>{kaelEmergencyGuidanceCopy(route, language)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  access: { paddingHorizontal: spacing.md },
  guidance: { padding: spacing.md, borderWidth: 1, borderRadius: 16, gap: spacing.sm, maxHeight: 240 },
  sheet: { flex: 1, padding: spacing.md, gap: spacing.md },
  sections: { gap: spacing.lg, paddingBottom: spacing.xl },
  section: { gap: spacing.sm },
  title: { fontSize: typography.body.fontSize, fontWeight: '700' },
  body: { fontSize: typography.body.fontSize, lineHeight: 24 },
})
