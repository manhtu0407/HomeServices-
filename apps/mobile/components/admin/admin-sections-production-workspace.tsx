import { useMemo, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'

import { KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { AdminViewActor } from '@/lib/api-types/admin'

import { AdminProductionWorkstreamTable } from './admin-production-workstream-table'
import {
  adminProductionPresentationCopy,
  type AdminProductionCapability,
  type AdminProductionCapabilityId,
  type AdminProductionSectionPresentation,
} from './admin-sections-production-copy'
import { styles } from './admin-sections-production-workspace-styles'
import { normalizeAdminProductionSearch } from './admin-sections-production-workspace-utils'
import { AdminText } from './admin-text'
import { useProductionWorkspaceTokens } from './use-production-workspace-tokens'

export { AdminProductionCapabilitySheet } from './admin-production-capability-sheet'
export { AdminUnavailableCapability } from './admin-unavailable-capability'

export function AdminProductionSectionIndex({
  actor,
  language,
  onOpenCapability,
  refreshing,
  section,
}: {
  actor: AdminViewActor
  language: AppLanguage
  onOpenCapability: (capability: AdminProductionCapability) => void
  refreshing: boolean
  section: AdminProductionSectionPresentation
}) {
  const { width } = useWindowDimensions()
  const tokens = useProductionWorkspaceTokens()
  const copy = adminProductionPresentationCopy[language]
  const compact = width < 600
  const expanded = width >= 840
  const [focusedCapabilityId, setFocusedCapabilityId] = useState<AdminProductionCapabilityId | null>(null)
  const [query, setQuery] = useState('')
  const filteredWorkstreams = useMemo(() => {
    const normalizedQuery = normalizeAdminProductionSearch(query)
    const capabilityById = new Map(section.capabilities.map((capability) => [capability.id, capability]))
    return section.workstreams.flatMap((workstream) => {
      const capabilities = workstream.capabilityIds.flatMap((capabilityId) => {
        const capability = capabilityById.get(capabilityId)
        if (!capability || (capability.ownerOnly && actor.access_level !== 'owner')) return []
        if (!normalizedQuery) return [capability]
        const searchable = normalizeAdminProductionSearch(`${capability.title} ${capability.useWhen}`)
        return searchable.includes(normalizedQuery) ? [capability] : []
      })
      return capabilities.length > 0 ? [{ capabilities, workstream }] : []
    })
  }, [actor.access_level, query, section.capabilities, section.workstreams])

  return <View testID={`admin-production-section-${section.id}`}>
    <View style={styles.sectionHeader} testID="admin-production-section-header">
      <View style={[styles.sectionHeaderMain, compact && styles.sectionHeaderMainCompact]}>
        <AdminText
          accessibilityRole="header"
          textRole="title1"
          style={[styles.sectionTitle, compact && styles.sectionTitleCompact, { color: tokens.text }]}
        >
          {section.label}
        </AdminText>
        <KaelTextField
          accessibilityLabel={copy.searchLabel}
          allowFontScaling
          inputShellStyle={[styles.searchInputShell, { backgroundColor: tokens.base, borderColor: tokens.border }]}
          mode="search"
          onChangeText={setQuery}
          placeholder={copy.searchPlaceholder}
          placeholderTextColor={tokens.subtleText}
          shellStyle={[styles.searchField, compact && styles.searchFieldCompact]}
          style={[styles.searchInput, { color: tokens.text }]}
          testID="admin-production-section-search"
          value={query}
        />
      </View>
      <View style={styles.sectionGuidance} testID={`admin-production-section-${section.id}-guidance`}>
        <AdminText textRole="caption1" style={[styles.guidanceLabel, { color: tokens.primary }]}>{copy.startHere}</AdminText>
        <AdminText textRole="footnote" style={[styles.guidanceText, { color: tokens.muted }]}>{section.startHere}</AdminText>
      </View>
    </View>

    {refreshing ? <View accessibilityLiveRegion="polite" style={[styles.refreshingBar, { borderColor: tokens.primary }]} testID="admin-sections-refreshing">
      <View style={[styles.refreshingDot, { backgroundColor: tokens.primary }]} />
      <AdminText textRole="footnote" style={[styles.refreshingText, { color: tokens.muted }]}>
        {language === 'vi' ? 'Đang làm mới · Nội dung hiện tại vẫn được giữ nguyên' : 'Refreshing · Current content remains visible'}
      </AdminText>
    </View> : null}

    {filteredWorkstreams.length > 0 ? <View style={styles.workstreamList}>
      {filteredWorkstreams.map(({ capabilities, workstream }) => <AdminProductionWorkstreamTable
        capabilities={capabilities}
        compact={compact}
        copy={copy}
        expanded={expanded}
        focusedCapabilityId={focusedCapabilityId}
        key={workstream.id}
        onFocusCapability={setFocusedCapabilityId}
        onOpen={onOpenCapability}
        sectionId={section.id}
        tokens={tokens}
        workstream={workstream}
      />)}
    </View> : <View style={[styles.emptyState, { borderColor: tokens.border }]} testID="admin-production-section-empty">
      <AdminText textRole="body" style={[styles.emptyText, { color: tokens.muted }]}>
        {language === 'vi' ? 'Không có chức năng phù hợp với nội dung tìm kiếm.' : 'No capability matches this search.'}
      </AdminText>
    </View>}
  </View>
}
