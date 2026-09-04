import { View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import { adminProductionPresentationCopy } from './admin-sections-production-copy'
import { styles } from './admin-sections-production-workspace-styles'
import { AdminText } from './admin-text'
import { useProductionWorkspaceTokens } from './use-production-workspace-tokens'

export function AdminUnavailableCapability({ language }: { language: AppLanguage }) {
  const tokens = useProductionWorkspaceTokens()
  return <View style={[styles.unavailableState, { backgroundColor: tokens.ghost, borderColor: tokens.border }]} testID="admin-production-capability-unavailable">
    <AdminText textRole="body" style={[styles.unavailableText, { color: tokens.muted }]}>
      {adminProductionPresentationCopy[language].unavailable}
    </AdminText>
  </View>
}
