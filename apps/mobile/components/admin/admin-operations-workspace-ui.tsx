import { useCallback } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, type ListRenderItemInfo } from 'react-native'

import type { CustomerThemeTokens } from '@/components/customer/customer-theme'
import { KaelTextField } from '@/components/ui/kael-primitives'
import { radius, spacing } from '@/design/theme'
import type { AdminViewCaseTimelineEntry, AdminViewEvidenceMetadata } from '@/lib/api-types/admin'

import { AdminText } from './admin-text'
import { FinanceChoiceChip, FinanceSecondaryButton } from './admin-finance-controls'

export function WorkspaceSearch({ label, onChange, onRefresh, refreshLabel, refreshing, tokens, value }: {
  label: string
  onChange: (value: string) => void
  onRefresh: () => void
  refreshLabel: string
  refreshing: boolean
  tokens: CustomerThemeTokens
  value: string
}) {
  return <View style={styles.searchRow}>
    <KaelTextField
      accessibilityLabel={label}
      autoCapitalize="none"
      mode="search"
      onChangeText={onChange}
      placeholder={label}
      placeholderTextColor={tokens.subtleText}
      shellStyle={styles.searchField}
      value={value}
    />
    <FinanceSecondaryButton disabled={refreshing} label={refreshLabel} loading={refreshing} onPress={onRefresh} size="small" />
  </View>
}

export function WorkspaceFilterRow<T extends string>({ label, onSelect, options, selected, tokens }: {
  label: string
  onSelect: (value: T) => void
  options: readonly { label: string; value: T }[]
  selected: T
  tokens: CustomerThemeTokens
}) {
  const renderOption = useCallback(({ item }: ListRenderItemInfo<{ label: string; value: T }>) => <WorkspaceFilterOption
    onSelect={onSelect}
    option={item}
    selected={selected === item.value}
  />, [onSelect, selected])
  return <View style={styles.filterGroup}>
    <AdminText textRole="caption1" style={[styles.filterLabel, { color: tokens.subtleText }]}>{label}</AdminText>
    <FlatList
      contentContainerStyle={styles.filterContent}
      data={options}
      horizontal
      keyExtractor={(item) => item.value}
      renderItem={renderOption}
      showsHorizontalScrollIndicator={false}
    />
  </View>
}

function WorkspaceFilterOption<T extends string>({ onSelect, option, selected }: {
  onSelect: (value: T) => void
  option: { label: string; value: T }
  selected: boolean
}) {
  return <FinanceChoiceChip label={option.label} onPress={() => onSelect(option.value)} selected={selected} />
}

export function WorkspaceMetrics({ items, tokens }: {
  items: readonly { label: string; value: number | string }[]
  tokens: CustomerThemeTokens
}) {
  return <View style={[styles.metrics, { borderColor: tokens.border }]}>
    {items.map((item) => <View key={item.label} style={styles.metric}>
      <AdminText numeric textRole="title2" style={[styles.metricValue, { color: tokens.text }]}>{item.value}</AdminText>
      <AdminText textRole="caption1" style={[styles.metricLabel, { color: tokens.muted }]}>{item.label}</AdminText>
    </View>)}
  </View>
}

export function WorkspaceFeedback({ compact, error, loading, loadingLabel, onRetry, retryLabel, tokens }: {
  compact?: boolean
  error: string | null
  loading: boolean
  loadingLabel: string
  onRetry: () => void
  retryLabel: string
  tokens: CustomerThemeTokens
}) {
  if (loading) return <View style={[styles.feedback, compact && styles.feedbackCompact]}>
    <ActivityIndicator color={tokens.primary} />
    <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{loadingLabel}</AdminText>
  </View>
  if (!error) return null
  return <View accessibilityRole="alert" style={[styles.feedback, styles.errorFeedback, compact && styles.feedbackCompact, { borderColor: tokens.border }]}>
    <View style={[styles.errorDot, { backgroundColor: tokens.danger }]} />
    <AdminText textRole="subheadline" style={[styles.feedbackText, { color: tokens.text }]}>{error}</AdminText>
    <Pressable accessibilityRole="button" onPress={onRetry}>
      <AdminText textRole="headline" style={{ color: tokens.primary }}>{retryLabel}</AdminText>
    </Pressable>
  </View>
}

export function WorkspaceEmpty({ label, tokens }: { label: string; tokens: CustomerThemeTokens }) {
  return <View style={[styles.empty, { borderColor: tokens.border }]}>
    <AdminText textRole="subheadline" style={{ color: tokens.muted, textAlign: 'center' }}>{label}</AdminText>
  </View>
}

export function DetailHeading({ backLabel, generatedAt, generatedLabel, onBack, title, tokens }: {
  backLabel?: string
  generatedAt: string
  generatedLabel: string
  onBack?: () => void
  title: string
  tokens: CustomerThemeTokens
}) {
  return <View style={[styles.detailHeading, { borderBottomColor: tokens.border }]}>
    {onBack ? <Pressable accessibilityLabel={backLabel} accessibilityRole="button" onPress={onBack} style={styles.backButton}>
      <AdminText textRole="headline" style={{ color: tokens.primary }}>‹</AdminText>
    </Pressable> : null}
    <View style={styles.detailHeadingText}>
      <AdminText accessibilityRole="header" textRole="title2" style={[styles.detailTitle, { color: tokens.text }]}>{title}</AdminText>
      <AdminText textRole="caption1" style={{ color: tokens.subtleText }}>{generatedLabel}: {generatedAt}</AdminText>
    </View>
  </View>
}

export function DetailSection({ children, title, tokens }: { children: React.ReactNode; title: string; tokens: CustomerThemeTokens }) {
  return <View style={styles.detailSection}>
    <AdminText textRole="headline" style={[styles.sectionTitle, { color: tokens.text }]}>{title}</AdminText>
    <View style={[styles.sectionBody, { borderTopColor: tokens.border }]}>{children}</View>
  </View>
}

export function DetailField({ label, numeric, tokens, value }: {
  label: string
  numeric?: boolean
  tokens: CustomerThemeTokens
  value: string
}) {
  return <View style={[styles.fieldRow, { borderBottomColor: tokens.border }]}>
    <AdminText textRole="caption1" style={[styles.fieldLabel, { color: tokens.subtleText }]}>{label}</AdminText>
    <AdminText numeric={numeric} textRole="subheadline" style={[styles.fieldValue, { color: tokens.text }]}>{value}</AdminText>
  </View>
}

export function EvidenceRows({ items, lockedLabel, onOpen, openLabel, tokens }: {
  items: AdminViewEvidenceMetadata[]
  lockedLabel?: string
  onOpen: (item: AdminViewEvidenceMetadata) => void
  openLabel: string
  tokens: CustomerThemeTokens
}) {
  return <>{items.map((item) => {
    const snapshot = item.evidence_id.startsWith('snapshot:')
    const content = <>
    <View style={styles.evidenceText}>
      <AdminText textRole="subheadline" style={{ color: tokens.text }}>{item.label}</AdminText>
      {item.captured_at ? <AdminText textRole="caption1" style={{ color: tokens.subtleText }}>{item.captured_at}</AdminText> : null}
    </View>
    <AdminText textRole="headline" style={{ color: snapshot ? tokens.subtleText : tokens.primary }}>{snapshot ? lockedLabel ?? item.kind : openLabel}</AdminText>
    </>
    if (snapshot) return <View key={item.evidence_id} style={[styles.evidenceRow, { borderBottomColor: tokens.border }]}>{content}</View>
    return <Pressable
      accessibilityRole="button"
      key={item.evidence_id}
      onPress={() => onOpen(item)}
      style={({ pressed }) => [styles.evidenceRow, { borderBottomColor: tokens.border, opacity: pressed ? 0.66 : 1 }]}
    >{content}</Pressable>
  })}</>
}

export function TimelineRows({ items, tokens }: { items: AdminViewCaseTimelineEntry[]; tokens: CustomerThemeTokens }) {
  return <>{items.map((item, index) => <View key={`${item.key}-${item.occurred_at}-${index}`} style={[styles.timelineRow, { borderBottomColor: tokens.border }]}>
    <View style={[styles.timelineDot, { backgroundColor: tokens.primary }]} />
    <View style={styles.timelineText}>
      <AdminText textRole="subheadline" style={{ color: tokens.text }}>{item.label}</AdminText>
      <AdminText textRole="caption1" style={{ color: tokens.subtleText }}>{item.occurred_at}</AdminText>
    </View>
  </View>)}</>
}

const styles = StyleSheet.create({
  backButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  detailHeading: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
  detailHeadingText: { flex: 1, gap: spacing.xs },
  detailSection: { gap: spacing.sm },
  detailTitle: { fontWeight: '600' },
  empty: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.xl },
  errorDot: { borderRadius: radius.pill, height: 9, width: 9 },
  errorFeedback: { borderWidth: 1 },
  evidenceRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 58, paddingVertical: spacing.sm },
  evidenceText: { flex: 1, gap: spacing.xs },
  feedback: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'center', padding: spacing.xl },
  feedbackCompact: { paddingVertical: spacing.md },
  feedbackText: { flex: 1 },
  fieldLabel: { flexBasis: 124, flexGrow: 1, fontWeight: '600', minWidth: 112 },
  fieldRow: { alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm },
  fieldValue: { flexGrow: 3, flexShrink: 1, minWidth: 156 },
  filterContent: { gap: spacing.sm, paddingRight: spacing.md },
  filterGroup: { gap: spacing.xs },
  filterLabel: { fontWeight: '600', textTransform: 'uppercase' },
  metric: { flexBasis: 136, flexGrow: 1, gap: spacing.xs, minWidth: 120, paddingHorizontal: spacing.sm },
  metricLabel: { textAlign: 'center' },
  metrics: { borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, padding: spacing.md },
  metricValue: { fontVariant: ['tabular-nums'], fontWeight: '600', textAlign: 'center' },
  searchField: { flex: 1, minWidth: 180 },
  searchRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionBody: { borderTopWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontWeight: '600' },
  timelineDot: { borderRadius: radius.pill, height: 9, marginTop: 5, width: 9 },
  timelineRow: { alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  timelineText: { flex: 1, gap: spacing.xs },
})
