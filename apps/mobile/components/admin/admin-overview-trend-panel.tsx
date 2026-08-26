import type { AdminFinanceOverviewResponse } from '@nestscout/shared'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import type { CustomerThemeTokens } from '@/components/customer/customer-theme'
import { radius, spacing, typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import { AdminPagination } from './admin-pagination'
import { AdminText } from './admin-text'

const TREND_PAGE_SIZE = 5

type AdminOverviewTrendCopy = {
  paidJobsShort: string
  trendEmpty: string
  trendTitle: string
  unavailable: string
}

type AdminOverviewTrendRange = 'day' | 'week' | 'month'

export function AdminOverviewTrendPanel({ copy, expanded, finance, formatCount, formatCurrency, language, range, tokens }: {
  copy: AdminOverviewTrendCopy
  expanded: boolean
  finance: AdminFinanceOverviewResponse
  formatCount: (value: number | null | undefined) => string
  formatCurrency: (value: number | null) => string
  language: AppLanguage
  range: AdminOverviewTrendRange
  tokens: CustomerThemeTokens
}) {
  const [page, setPage] = useState(1)
  const recorded = finance.trend
    .filter((point) => point.gmv_vnd !== null || point.paid_jobs !== null)
    .sort((left, right) => Date.parse(left.bucket_start) - Date.parse(right.bucket_start))
  const totalPages = Math.max(1, Math.ceil(recorded.length / TREND_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleEnd = Math.max(0, recorded.length - ((currentPage - 1) * TREND_PAGE_SIZE))
  const visibleStart = Math.max(0, visibleEnd - TREND_PAGE_SIZE)
  const visiblePoints = recorded.slice(visibleStart, visibleEnd)
  const maxGmv = Math.max(...recorded.map((point) => point.gmv_vnd ?? 0), 1)
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    ...(range === 'day'
      ? { hour: '2-digit', minute: '2-digit' } as const
      : { day: '2-digit', month: '2-digit' } as const),
    timeZone: 'Asia/Ho_Chi_Minh',
  }), [language, range])

  return <View style={[styles.panel, expanded && styles.panelExpanded, { backgroundColor: tokens.base, borderColor: tokens.border }]} testID="admin-overview-trend">
    <AdminText accessibilityRole="header" textRole="headline" style={[styles.panelTitle, { color: tokens.text }]}>{copy.trendTitle}</AdminText>
    {recorded.length === 0
      ? <AdminText textRole="subheadline" style={[styles.emptyText, { color: tokens.muted }]}>{copy.trendEmpty}</AdminText>
      : visiblePoints.map((point) => {
        const label = dateFormatter.format(new Date(point.bucket_start))
        const gmv = point.gmv_vnd === null ? copy.unavailable : formatCurrency(point.gmv_vnd)
        const paidJobs = point.paid_jobs === null ? copy.unavailable : `${formatCount(point.paid_jobs)} ${copy.paidJobsShort}`
        const width = point.gmv_vnd === null ? 0 : Math.max(4, (point.gmv_vnd / maxGmv) * 100)
        return <View accessible accessibilityLabel={`${label}. ${gmv}. ${paidJobs}`} key={`${point.bucket_start}-${point.bucket_end}`} style={styles.trendRow} testID="admin-overview-trend-row">
          <View style={styles.trendMeta}>
            <AdminText textRole="footnote" style={[styles.trendDate, { color: tokens.muted }]}>{label}</AdminText>
            <AdminText numeric textRole="footnote" style={[styles.trendJobs, { color: tokens.text }]}>{paidJobs}</AdminText>
          </View>
          <View style={[styles.trendTrack, { backgroundColor: tokens.service }]}>
            <View style={[styles.trendFill, { backgroundColor: tokens.primary, width: `${width}%` }]} />
          </View>
          <AdminText numeric textRole="headline" style={[styles.trendValue, { color: tokens.text }]}>{gmv}</AdminText>
        </View>
      })}
    <AdminPagination
      hasMore={false}
      labels={{
        more: '…',
        next: language === 'vi' ? 'Trang sau' : 'Next page',
        page: (pageNumber) => `${language === 'vi' ? 'Trang' : 'Page'} ${pageNumber}`,
        previous: language === 'vi' ? 'Trang trước' : 'Previous page',
      }}
      loading={false}
      onPageChange={setPage}
      page={currentPage}
      pageSize={TREND_PAGE_SIZE}
      pageTestIDPrefix="admin-overview-trend-page"
      testID="admin-overview-trend-pagination"
      totalCount={recorded.length}
    />
  </View>
}

const styles = StyleSheet.create({
  emptyText: { ...typography.subheadline, paddingVertical: spacing.sm },
  panel: { borderRadius: radius.lg, borderWidth: 1, minWidth: 0, padding: spacing.md },
  panelExpanded: { flex: 1 },
  panelTitle: { ...typography.headline, fontWeight: '700', paddingBottom: spacing.md },
  trendDate: { ...typography.caption1, fontWeight: '600' },
  trendFill: { borderRadius: radius.pill, height: '100%' },
  trendJobs: { ...typography.footnote, flex: 1, textAlign: 'right' },
  trendMeta: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  trendRow: { gap: spacing.xs, paddingVertical: spacing.sm },
  trendTrack: { borderRadius: radius.pill, height: 7, overflow: 'hidden' },
  trendValue: { ...typography.footnote, fontWeight: '600' },
})
