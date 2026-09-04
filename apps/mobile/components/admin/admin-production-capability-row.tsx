import { Pressable, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import type { CustomerThemeTokens } from '@/components/customer/customer-theme'

import {
  adminProductionPresentationCopy,
  type AdminProductionCapability,
  type AdminProductionCapabilityId,
} from './admin-sections-production-copy'
import { styles } from './admin-sections-production-workspace-styles'
import { adminProductionStatusColors } from './admin-sections-production-workspace-utils'
import { AdminText } from './admin-text'

type PresentationCopy = (typeof adminProductionPresentationCopy)['vi']

export function AdminProductionCapabilityRow({
  capability,
  compact,
  copy,
  focused,
  identityWidth,
  onFocusCapability,
  onOpen,
  tokens,
}: {
  capability: AdminProductionCapability
  compact: boolean
  copy: PresentationCopy
  focused: boolean
  identityWidth: number
  onFocusCapability: (capabilityId: AdminProductionCapabilityId | null) => void
  onOpen: (capability: AdminProductionCapability) => void
  tokens: CustomerThemeTokens
}) {
  const tone = adminProductionStatusColors(capability.status, tokens)
  const audience = capability.ownerOnly ? copy.ownerOnly : copy.audience
  return <Pressable
    accessibilityLabel={`${capability.title}. ${audience}. ${capability.useWhen}. ${copy.status[capability.status]}`}
    accessibilityRole="button"
    onBlur={() => onFocusCapability(null)}
    onFocus={() => onFocusCapability(capability.id)}
    onPress={() => onOpen(capability)}
    style={({ pressed }) => [
      styles.capabilityRow,
      compact && styles.capabilityRowCompact,
      {
        backgroundColor: focused ? tokens.ghost : 'transparent',
        borderBottomColor: tokens.border,
        borderLeftColor: focused ? tokens.primary : 'transparent',
        opacity: pressed ? 0.7 : 1,
        outlineColor: 'transparent',
      },
    ]}
    testID={`admin-production-capability-${capability.id}`}
  >
    <View style={[styles.capabilityIdentity, !compact && { width: identityWidth }]}>
      <AdminText textRole="headline" style={[styles.capabilityTitle, { color: tokens.text }]}>{capability.title}</AdminText>
      {!compact ? <AdminText textRole="footnote" style={[styles.ownerLabel, { color: tokens.subtleText }]}>{audience}</AdminText> : null}
    </View>
    <AdminText textRole="subheadline" style={[styles.capabilityPurpose, { color: tokens.muted }]}>{capability.useWhen}</AdminText>
    <View style={[styles.statusCell, compact && styles.statusCellCompact]} testID={`admin-production-capability-${capability.id}-status`}>
      {compact ? <AdminText textRole="footnote" style={[styles.ownerLabel, styles.ownerLabelCompact, { color: tokens.subtleText }]}>{audience}</AdminText> : null}
      <View style={styles.statusMeta}>
        <View style={[styles.statusDot, { backgroundColor: tone.dot }]} />
        <AdminText textRole="footnote" style={[styles.statusText, { color: tone.text }]}>{copy.status[capability.status]}</AdminText>
        <View style={styles.disclosureSlot}>
          <Svg height={18} pointerEvents="none" viewBox="0 0 24 24" width={18}>
            <Path d="M9 18L15 12L9 6" fill="none" stroke={tokens.subtleText} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          </Svg>
        </View>
      </View>
    </View>
  </Pressable>
}
