import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'

import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
} from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelButton } from '@/components/ui/kael-primitives'
import { radius, spacing } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { AdminViewOverviewDetailKey, AdminViewOverviewDetailsResponse } from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'

import {
  AdminOverviewDetailBreakdown,
  AdminOverviewDetailRecordRow,
} from './admin-overview-detail-sheet'
import { formatAdminDateTime } from './admin-intl'
import { getAdminOverviewDetailCopy } from './admin-overview-detail-copy'
import { AdminText } from './admin-text'

const PAGE_SIZE = 20

type WorklistState = {
  cursorHistory: string[]
  detail: AdminViewOverviewDetailsResponse | null
  error: boolean
  loading: boolean
}

const initialWorklistState: WorklistState = {
  cursorHistory: ['0'],
  detail: null,
  error: false,
  loading: true,
}

export function AdminOverviewDetailWorklist({
  detailKey,
  language,
  onClearFilter,
  onSessionMissing,
  title,
}: {
  detailKey: AdminViewOverviewDetailKey
  language: AppLanguage
  onClearFilter: () => void
  onSessionMissing: () => void
  title: string
}) {
  const mode = useCustomerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const tokens = useMemo(() => {
    const resolved = getCustomerThemeTokens(mode)
    return reduceTransparency ? getReducedTransparencyCustomerTokens(resolved) : resolved
  }, [mode, reduceTransparency])
  const copy = getAdminOverviewDetailCopy(language)
  const worklistCopy = language === 'vi' ? VI_COPY : EN_COPY
  const [state, patch] = useReducer(
    (current: WorklistState, next: Partial<WorklistState>) => ({ ...current, ...next }),
    initialWorklistState,
  )
  const requestIdRef = useRef(0)
  const cursor = state.cursorHistory[state.cursorHistory.length - 1] ?? '0'

  useEffect(() => {
    let active = true
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    void adminControlService.getOverviewDetails({ cursor, key: detailKey, limit: PAGE_SIZE }).then((result) => {
      if (!active || requestId !== requestIdRef.current) return
      if (!result.success && isMissingAdminSession(result)) {
        onSessionMissing()
        return
      }
      patch(result.success ? { detail: result.data, error: false, loading: false } : { error: true, loading: false })
    }).catch(() => {
      if (!active || requestId !== requestIdRef.current) return
      patch({ error: true, loading: false })
    })
    return () => { active = false }
  }, [cursor, detailKey, onSessionMissing])

  const nextPage = useCallback(() => {
    const nextCursor = state.detail?.next_cursor
    if (nextCursor === null || nextCursor === undefined) return
    patch({ cursorHistory: [...state.cursorHistory, nextCursor], error: false, loading: true })
  }, [state.cursorHistory, state.detail?.next_cursor])
  const previousPage = useCallback(() => {
    patch({ cursorHistory: state.cursorHistory.length > 1 ? state.cursorHistory.slice(0, -1) : state.cursorHistory, error: false, loading: true })
  }, [state.cursorHistory])
  const retry = useCallback(() => {
    patch({ error: false, loading: true })
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    void adminControlService.getOverviewDetails({ cursor, key: detailKey, limit: PAGE_SIZE }).then((result) => {
      if (requestId !== requestIdRef.current) return
      if (!result.success && isMissingAdminSession(result)) {
        onSessionMissing()
        return
      }
      patch(result.success ? { detail: result.data, error: false, loading: false } : { error: true, loading: false })
    }).catch(() => {
      if (requestId === requestIdRef.current) patch({ error: true, loading: false })
    })
  }, [cursor, detailKey, onSessionMissing])

  return <View style={styles.root} testID="admin-overview-filtered-worklist">
    <View style={[styles.header, { borderBottomColor: tokens.border }]}>
      <View style={styles.headerCopy}>
        <AdminText textRole="caption1" style={[styles.eyebrow, { color: tokens.primary }]}>{worklistCopy.filtered}</AdminText>
        <AdminText accessibilityRole="header" textRole="title2" style={{ color: tokens.text }}>{title}</AdminText>
        <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{worklistCopy.description}</AdminText>
      </View>
      <KaelButton label={worklistCopy.clear} onPress={onClearFilter} testID="admin-overview-worklist-clear" variant="secondary" />
    </View>

    {state.loading ? <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: tokens.border }]} testID="admin-overview-worklist-loading">
      <ActivityIndicator color={tokens.primary} />
      <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{copy.loading}</AdminText>
    </View> : null}
    {state.error ? <View accessibilityRole="alert" style={[styles.feedback, { borderColor: tokens.border }]} testID="admin-overview-worklist-error">
      <AdminText textRole="subheadline" style={styles.feedbackText}>{worklistCopy.error}</AdminText>
      <KaelButton label={copy.retry} onPress={retry} testID="admin-overview-worklist-retry" variant="secondary" />
    </View> : null}

    {state.detail && !state.loading && !state.error ? <>
      <View style={styles.summary}>
        <View>
          <AdminText textRole="caption1" style={{ color: tokens.muted }}>{copy.total}</AdminText>
          <AdminText numeric textRole="title1" style={{ color: tokens.text }}>{state.detail.total_count}</AdminText>
        </View>
        <AdminText textRole="footnote" style={[styles.generated, { color: tokens.subtleText }]}>
          {copy.generatedAt}: {formatTimestamp(state.detail.generated_at, language)}
        </AdminText>
      </View>
      {state.detail.total_count === 0 ? <View style={[styles.feedback, { borderColor: tokens.border }]}>
        <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{copy.empty}</AdminText>
      </View> : <>
        <View style={styles.breakdownGrid}>
          <AdminOverviewDetailBreakdown copy={copy} items={state.detail.status_breakdown} kind="status" language={language} tokens={tokens} />
          <AdminOverviewDetailBreakdown copy={copy} items={state.detail.service_breakdown} kind="service" language={language} tokens={tokens} />
        </View>
        <View style={[styles.records, { borderColor: tokens.border }]} testID="admin-overview-worklist-records">
          {state.detail.records.map((record, index) => <AdminOverviewDetailRecordRow index={index} key={`${record.kind}-${record.updated_at}-${index}`} language={language} record={record} tokens={tokens} />)}
        </View>
        <View style={styles.pagination}>
          <KaelButton disabled={state.cursorHistory.length === 1 || state.loading} label={worklistCopy.previous} onPress={previousPage} variant="secondary" />
          <AdminText numeric textRole="footnote" style={{ color: tokens.muted }}>{worklistCopy.page} {state.cursorHistory.length}</AdminText>
          <KaelButton disabled={!state.detail.has_more || state.loading} label={worklistCopy.next} onPress={nextPage} variant="secondary" />
        </View>
      </>}
    </> : null}
  </View>
}

function isMissingAdminSession(result: { success: boolean; status?: number; code?: string }) {
  return !result.success && (result.status === 401 || result.code === 'AUTH_MISSING' || result.code === 'AUTH_REQUIRED')
}

function formatTimestamp(value: string, language: AppLanguage) {
  return formatAdminDateTime(value, language, 'numeric')
}

const VI_COPY = {
  clear: 'Bỏ bộ lọc', description: 'Danh sách chỉ đọc theo bộ lọc đã chọn từ Tổng quan.', error: 'Không thể tải danh sách đã lọc.',
  filtered: 'Bộ lọc từ Tổng quan', next: 'Tiếp', page: 'Trang', previous: 'Trước',
}
const EN_COPY = {
  clear: 'Clear filter', description: 'Read-only records filtered by the selection made in Overview.', error: 'The filtered records could not be loaded.',
  filtered: 'Overview filter', next: 'Next', page: 'Page', previous: 'Previous',
}

const styles = StyleSheet.create({
  breakdownGrid: { gap: spacing.lg },
  eyebrow: { fontWeight: '600', textTransform: 'uppercase' },
  feedback: { alignItems: 'center', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, minHeight: 72, padding: spacing.md },
  feedbackText: { flex: 1 },
  generated: { maxWidth: 260, textAlign: 'right' },
  header: { alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between', paddingBottom: spacing.lg },
  headerCopy: { flex: 1, gap: spacing.xs, minWidth: 240 },
  pagination: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
  records: { borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth },
  root: { gap: spacing.lg },
  summary: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
})
