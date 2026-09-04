import { View } from 'react-native'

import type { CustomerThemeTokens } from '@/components/customer/customer-theme'

import { AdminProductionCapabilityRow } from './admin-production-capability-row'
import {
  adminProductionPresentationCopy,
  type AdminProductionCapability,
  type AdminProductionCapabilityId,
  type AdminProductionWorkstream,
} from './admin-sections-production-copy'
import { styles } from './admin-sections-production-workspace-styles'
import { AdminText } from './admin-text'

type PresentationCopy = (typeof adminProductionPresentationCopy)['vi']

export function AdminProductionWorkstreamTable({
  capabilities,
  compact,
  copy,
  expanded,
  focusedCapabilityId,
  onFocusCapability,
  onOpen,
  sectionId,
  tokens,
  workstream,
}: {
  capabilities: readonly AdminProductionCapability[]
  compact: boolean
  copy: PresentationCopy
  expanded: boolean
  focusedCapabilityId: AdminProductionCapabilityId | null
  onFocusCapability: (capabilityId: AdminProductionCapabilityId | null) => void
  onOpen: (capability: AdminProductionCapability) => void
  sectionId: string
  tokens: CustomerThemeTokens
  workstream: AdminProductionWorkstream
}) {
  const identityWidth = expanded ? 224 : 188
  return <View style={styles.workstream} testID={`admin-production-workstream-${sectionId}-${workstream.id}`}>
    <View style={[styles.workstreamHeader, { borderBottomColor: tokens.border }]}>
      <AdminText textRole="headline" style={[styles.workstreamTitle, { color: tokens.text }]}>{workstream.title}</AdminText>
    </View>
    {!compact ? <View style={[styles.columnHeader, { borderBottomColor: tokens.border }]}>
      <AdminText textRole="caption1" style={[styles.columnLabel, { color: tokens.subtleText, width: identityWidth }]}>{copy.columns.capability}</AdminText>
      <AdminText textRole="caption1" style={[styles.columnLabel, styles.descriptionColumn, { color: tokens.subtleText }]}>{copy.columns.description}</AdminText>
      <AdminText textRole="caption1" style={[styles.columnLabel, styles.statusColumn, { color: tokens.subtleText }]}>{copy.columns.status}</AdminText>
    </View> : null}
    {capabilities.map((capability) => <AdminProductionCapabilityRow
      capability={capability}
      compact={compact}
      copy={copy}
      focused={focusedCapabilityId === capability.id}
      identityWidth={identityWidth}
      key={capability.id}
      onFocusCapability={onFocusCapability}
      onOpen={onOpen}
      tokens={tokens}
    />)}
  </View>
}
