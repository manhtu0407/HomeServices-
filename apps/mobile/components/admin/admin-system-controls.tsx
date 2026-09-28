import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'

import { KaelTextField } from '@/components/ui/kael-primitives'
import { color, spacing } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import { FinanceSecondaryButton } from './admin-finance-controls'
import { formatAdminDateTime } from './admin-intl'
import { AdminText } from './admin-text'

export function AdminSystemToolbar({ language, onChangeQuery, onRefresh, query, refreshing, searchPlaceholder }: {
  language: AppLanguage
  onChangeQuery: (value: string) => void
  onRefresh: () => void
  query: string
  refreshing: boolean
  searchPlaceholder?: string
}) {
  const labels = language === 'vi'
    ? { refresh: 'Tải lại', refreshing: 'Đang cập nhật…', search: 'Tìm trong dữ liệu Production' }
    : { refresh: 'Refresh', refreshing: 'Updating…', search: 'Search Production data' }
  const searchLabel = searchPlaceholder ?? labels.search
  return <View style={styles.toolbar}>
    <View style={styles.search}><KaelTextField accessibilityLabel={searchLabel} autoCapitalize="none" mode="search" onChangeText={onChangeQuery} placeholder={searchLabel} placeholderTextColor={color.text.muted} value={query} /></View>
    <FinanceSecondaryButton disabled={refreshing} label={refreshing ? labels.refreshing : labels.refresh} loading={refreshing} onPress={onRefresh} />
  </View>
}

export function AdminSystemSummary({ children, generatedAt, language, quality }: {
  children: ReactNode
  generatedAt: string | null
  language: AppLanguage
  quality: 'available' | 'partial' | 'unavailable'
}) {
  const qualityLabel = language === 'vi'
    ? { available: 'Dữ liệu hiện tại', partial: 'Dữ liệu một phần', unavailable: 'Chưa ghi nhận' }[quality]
    : { available: 'Current data', partial: 'Partial data', unavailable: 'Not recorded' }[quality]
  return <View style={styles.summary}>
    <View style={styles.summaryMetrics}>{children}</View>
    <AdminText textRole="caption1" style={styles.meta}>{qualityLabel}{generatedAt ? ` · ${formatAdminDateTime(generatedAt, language)}` : ''}</AdminText>
  </View>
}

export function AdminSystemMetric({ label, value }: { label: string; value: number | string | null }) {
  return <View style={styles.metric}>
    <AdminText numeric textRole="title2" style={styles.metricValue}>{value ?? '—'}</AdminText>
    <AdminText textRole="caption1" style={styles.meta}>{label}</AdminText>
  </View>
}

export function AdminSystemRow({ accessibilityLabel, aside, id, meta, onPress, selected, title }: {
  accessibilityLabel: string
  aside: string
  id: string
  meta: string
  onPress: (id: string) => void
  selected: boolean
  title: string
}) {
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => onPress(id)} style={[styles.row, selected && styles.rowSelected]}>
    <View style={styles.rowText}><AdminText textRole="headline" style={styles.strong}>{title}</AdminText><AdminText textRole="footnote" style={styles.secondary}>{meta}</AdminText></View>
    <AdminText numeric textRole="subheadline" style={styles.rowAside}>{aside}</AdminText>
  </Pressable>
}

export function AdminSystemDetailHeader({ language, onBack, subtitle, title }: { language: AppLanguage; onBack?: () => void; subtitle: string; title: string }) {
  return <View style={styles.detailHeader}>
    {onBack ? <FinanceSecondaryButton label={language === 'vi' ? 'Quay lại danh sách' : 'Back to list'} onPress={onBack} /> : null}
    <AdminText accessibilityRole="header" textRole="title2" style={styles.strong}>{title}</AdminText>
    <AdminText textRole="footnote" style={styles.secondary}>{subtitle}</AdminText>
  </View>
}

export function AdminSystemField({ label, numeric = false, value }: { label: string; numeric?: boolean; value: string }) {
  return <View style={styles.field}><AdminText textRole="caption1" style={styles.meta}>{label}</AdminText><AdminText numeric={numeric} textRole="body" style={styles.strong}>{value}</AdminText></View>
}

export function AdminSystemState({ actionLabel, compact = false, label, loading = false, onAction }: { actionLabel?: string; compact?: boolean; label: string; loading?: boolean; onAction?: () => void }) {
  return <View accessibilityLiveRegion="polite" style={[styles.state, compact && styles.stateCompact]}>
    {loading ? <ActivityIndicator color={color.brand.primary} /> : null}
    <AdminText accessibilityRole={onAction ? 'alert' : undefined} textRole="subheadline" style={styles.secondary}>{label}</AdminText>
    {actionLabel && onAction ? <FinanceSecondaryButton label={actionLabel} onPress={onAction} /> : null}
  </View>
}

export function AdminSystemDivider() { return <View style={styles.divider} /> }

export function AdminSystemWorkspaceLayout({ detail, emptyDetailLabel, list, selected }: {
  detail: ReactNode
  emptyDetailLabel: string
  list: ReactNode
  selected: boolean
}) {
  const { width } = useWindowDimensions()
  const expanded = width >= 768
  if (!expanded && selected) return <View style={styles.ownedPane}>{detail}</View>
  return <View style={[styles.ownedPane, expanded && styles.splitPane]}>
    <View style={styles.listPane}>{list}</View>
    {expanded ? <View style={styles.detailPane}>{selected ? detail : <AdminSystemState label={emptyDetailLabel} />}</View> : null}
  </View>
}

export function AdminSystemDetailScroll({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.detailScroll} testID="admin-system-detail">{children}</ScrollView>
}

const styles = StyleSheet.create({
  detailHeader: { gap: spacing.xs },
  divider: { backgroundColor: color.surface.stroke, height: StyleSheet.hairlineWidth },
  field: { borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingVertical: spacing.sm },
  meta: { color: color.text.muted },
  metric: { flexBasis: 110, flexGrow: 1, gap: spacing.xs, minWidth: 92 },
  metricValue: { color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '600' },
  row: { alignItems: 'flex-start', borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 72, paddingBottom: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: 14 },
  rowAside: { color: color.text.strong, flexShrink: 1, fontVariant: ['tabular-nums'], fontWeight: '600', maxWidth: '42%', textAlign: 'right' },
  rowSelected: { backgroundColor: color.mint.mint50 },
  rowText: { flex: 1, gap: spacing.xs, minWidth: 0 },
  search: { flex: 1, minWidth: 220 },
  secondary: { color: color.text.secondary },
  state: { alignItems: 'center', gap: spacing.md, justifyContent: 'center', padding: spacing.xl },
  stateCompact: { alignItems: 'flex-start', paddingHorizontal: 0, paddingVertical: spacing.md },
  strong: { color: color.text.strong },
  summary: { borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.md, paddingBottom: spacing.md },
  summaryMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailContent: { gap: spacing.lg, paddingBottom: spacing.xl, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  detailPane: { borderLeftColor: color.surface.stroke, borderLeftWidth: StyleSheet.hairlineWidth, flex: 1.1, maxWidth: 720, minWidth: 0 },
  detailScroll: { flex: 1 },
  listPane: { flex: 1, minWidth: 0 },
  ownedPane: { flex: 1, minHeight: 0 },
  splitPane: { flexDirection: 'row' },
})
