import type { ReactNode } from 'react'
import { Modal, ScrollView, useWindowDimensions, View } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import { adminProductionPresentationCopy, type AdminProductionCapability } from './admin-sections-production-copy'
import { styles } from './admin-sections-production-workspace-styles'
import { adminProductionDetailStatusColors } from './admin-sections-production-workspace-utils'
import { AdminText } from './admin-text'
import { useProductionWorkspaceTokens } from './use-production-workspace-tokens'

export function AdminProductionCapabilitySheet({
  capability,
  children,
  language,
  onClose,
  ownsScroll = false,
}: {
  capability: AdminProductionCapability | null
  children: ReactNode
  language: AppLanguage
  onClose: () => void
  ownsScroll?: boolean
}) {
  const { width } = useWindowDimensions()
  const tokens = useProductionWorkspaceTokens()
  const { reduceMotion } = useGlassAccessibility()
  const copy = adminProductionPresentationCopy[language]
  if (!capability) return null
  const tone = adminProductionDetailStatusColors(capability.status, tokens)
  const compact = width < 600

  return <Modal animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} transparent visible>
    <View accessibilityViewIsModal style={[styles.modalOverlay, compact && styles.modalOverlayCompact]}>
      <View style={[styles.detailSheet, { backgroundColor: tokens.base, borderColor: tokens.border }]} testID="admin-production-capability-detail">
        <View style={[styles.sheetHandle, { backgroundColor: tokens.border }]} />
        <View style={[styles.detailHeader, compact && styles.detailHeaderCompact, { borderBottomColor: tokens.border }]}>
          <View style={styles.detailContextRow}>
            <AdminText textRole="caption1" style={[styles.detailEyebrow, { color: tokens.primary }]}>{copy.detailTitle}</AdminText>
            <View style={styles.detailStatus}>
              <View style={[styles.statusDot, { backgroundColor: tone.dot }]} />
              <AdminText textRole="footnote" style={[styles.detailStatusText, { color: tone.text }]}>{copy.status[capability.status]}</AdminText>
            </View>
          </View>
          <AdminText accessibilityRole="header" textRole="title2" style={[styles.detailTitle, { color: tokens.text }]}>{capability.title}</AdminText>
        </View>
        {ownsScroll ? <View style={styles.detailOwnedScroll} testID={`admin-production-capability-workspace-${capability.id}`}>
          {children}
        </View> : <ScrollView
          contentContainerStyle={[styles.detailContent, compact && styles.detailContentCompact]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.detailScroll}
          testID={`admin-production-capability-workspace-${capability.id}`}
        >
          {children}
        </ScrollView>}
        <View style={[styles.detailFooter, compact && styles.detailFooterCompact, { borderTopColor: tokens.border }]}>
          <KaelButton label={copy.close} onPress={onClose} style={styles.closeButton} testID="admin-production-capability-close" variant="primary" />
        </View>
      </View>
    </View>
  </Modal>
}
