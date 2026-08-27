import { isLocalDealStatus } from '@nestscout/shared'
import { ActivityIndicator, Modal, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { CustomerThemeTokens } from '@/components/customer/customer-theme'
import { KaelButton } from '@/components/ui/kael-primitives'
import { radius, spacing, typography } from '@/design/theme'
import { localizedStatusLabel, type AppLanguage } from '@/lib/app-language'
import type {
  AdminViewOverviewDetailKey,
  AdminViewOverviewDetailRecord,
  AdminViewOverviewDetailsResponse,
} from '@/lib/api-types/admin'

import { AdminText } from './admin-text'
import { formatAdminDateTime } from './admin-intl'
import { getAdminOverviewDetailCopy } from './admin-overview-detail-copy'

export type AdminOverviewDetailSelection = {
  count: number | null
  key: AdminViewOverviewDetailKey
  title: string
}

export function AdminOverviewDetailSheet({
  detail,
  error,
  generatedAt,
  language,
  loading,
  onClose,
  onRetry,
  onViewAll,
  permissionLimited,
  reduceMotion,
  selection,
  tokens,
}: {
  detail: AdminViewOverviewDetailsResponse | null
  error: string | null
  generatedAt: string | null
  language: AppLanguage
  loading: boolean
  onClose: () => void
  onRetry: () => void
  onViewAll?: () => void
  permissionLimited: boolean
  reduceMotion: boolean
  selection: AdminOverviewDetailSelection | null
  tokens: CustomerThemeTokens
}) {
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  if (!selection) return null

  const copy = getAdminOverviewDetailCopy(language)
  const compact = width < 600
  const snapshotCount = selection.count === null ? copy.notRecorded : String(selection.count)
  const totalCount = detail ? String(detail.total_count) : snapshotCount
  const detailGeneratedAt = detail?.generated_at ?? generatedAt

  return <Modal animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} transparent visible>
    <View accessibilityViewIsModal style={[
      styles.overlay,
      compact && styles.overlayCompact,
      { paddingBottom: Math.max(insets.bottom, spacing.sm), paddingTop: Math.max(insets.top, spacing.sm) },
    ]}>
      <View style={[styles.sheet, compact && styles.sheetCompact, { backgroundColor: tokens.base, borderColor: tokens.border }]} testID="admin-overview-detail-sheet">
        <View style={[styles.handle, { backgroundColor: tokens.border }]} />
        <View style={[styles.header, compact && styles.horizontalCompact, { borderBottomColor: tokens.border }]}>
          <View style={styles.headerContext}>
            <AdminText textRole="caption1" style={[styles.eyebrow, { color: tokens.primary }]}>{copy.detail}</AdminText>
            <AdminText textRole="footnote" style={[styles.currentStatus, { color: tokens.muted }]}>{copy.currentData}</AdminText>
          </View>
          <AdminText accessibilityRole="header" textRole="title2" style={[styles.title, { color: tokens.text }]}>{selection.title}</AdminText>
          <AdminText textRole="footnote" style={[styles.generatedAt, { color: tokens.subtleText }]}>
            {copy.generatedAt}: {formatGeneratedAt(detailGeneratedAt, language, copy.notRecorded)}
          </AdminText>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, compact && styles.horizontalCompact]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          testID="admin-overview-detail-scroll"
        >
          <View style={[styles.summary, { borderBottomColor: tokens.border }]}>
            <AdminText textRole="caption1" style={[styles.label, { color: tokens.muted }]}>{copy.total}</AdminText>
            <AdminText numeric textRole="title1" style={[styles.total, { color: tokens.text }]} testID="admin-overview-detail-count">{totalCount}</AdminText>
            {detail?.oldest_updated_at ? <AdminText textRole="footnote" style={[styles.oldest, { color: tokens.subtleText }]}>
              {copy.oldestUpdate}: {formatGeneratedAt(detail.oldest_updated_at, language, copy.notRecorded)}
            </AdminText> : null}
          </View>

          {permissionLimited ? <Feedback message={copy.permissionLimited} testID="admin-overview-detail-permission" tokens={tokens} /> : null}
          {loading ? <View accessibilityLiveRegion="polite" style={styles.loading} testID="admin-overview-detail-loading">
            <ActivityIndicator color={tokens.primary} />
            <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{copy.loading}</AdminText>
          </View> : null}
          {error ? <View accessibilityRole="alert" style={styles.feedbackRow} testID="admin-overview-detail-error">
            <AdminText textRole="subheadline" style={[styles.feedbackText, { color: tokens.text }]}>{error}</AdminText>
            <KaelButton label={copy.retry} onPress={onRetry} testID="admin-overview-detail-retry" variant="secondary" />
          </View> : null}

          {detail && !loading && !error ? <>
            {detail.total_count === 0 ? <Feedback message={copy.empty} testID="admin-overview-detail-empty" tokens={tokens} /> : <>
              <AdminOverviewDetailBreakdown copy={copy} items={detail.status_breakdown} kind="status" language={language} tokens={tokens} />
              <AdminOverviewDetailBreakdown copy={copy} items={detail.service_breakdown} kind="service" language={language} tokens={tokens} />
              <View style={styles.recordsSection} testID="admin-overview-detail-records">
                <View style={styles.recordsHeader}>
                  <AdminText textRole="headline" style={[styles.recordsTitle, { color: tokens.text }]}>{copy.recentRecords}</AdminText>
                  <AdminText numeric textRole="footnote" style={{ color: tokens.subtleText }}>{Math.min(detail.records.length, 5)} / {detail.total_count}</AdminText>
                </View>
                <View style={[styles.records, { borderColor: tokens.border }]}>
                  {detail.records.slice(0, 5).map((record, index) => <AdminOverviewDetailRecordRow
                    index={index}
                    key={recordKey(record)}
                    language={language}
                    record={record}
                    tokens={tokens}
                  />)}
                </View>
              </View>
            </>}
          </> : null}
        </ScrollView>

        <View style={[styles.footer, compact && styles.horizontalCompact, { borderTopColor: tokens.border }]}>
          <KaelButton label={copy.close} onPress={onClose} style={styles.footerButton} testID="admin-overview-detail-close" variant="secondary" />
          {onViewAll ? <KaelButton label={copy.viewAll} onPress={onViewAll} style={styles.footerButton} testID="admin-overview-detail-view-all" variant="primary" /> : null}
        </View>
      </View>
    </View>
  </Modal>
}

export function AdminOverviewDetailBreakdown({ copy, items, kind, language, tokens }: {
  copy: ReturnType<typeof getAdminOverviewDetailCopy>
  items: AdminViewOverviewDetailsResponse['status_breakdown']
  kind: 'service' | 'status'
  language: AppLanguage
  tokens: CustomerThemeTokens
}) {
  if (items.length === 0) return null
  return <View style={styles.breakdown} testID={`admin-overview-detail-${kind}-breakdown`}>
    <AdminText textRole="headline" style={[styles.breakdownTitle, { color: tokens.text }]}>{kind === 'status' ? copy.statusBreakdown : copy.serviceBreakdown}</AdminText>
    <View style={[styles.breakdownList, { borderColor: tokens.border }]}>
      {items.slice(0, 3).map((item, index) => <View
        key={item.key}
        style={[styles.breakdownRow, index > 0 && styles.divider, { borderTopColor: tokens.border }]}
        testID={`admin-overview-detail-${kind}-${item.key}`}
      >
        <AdminText textRole="subheadline" style={[styles.breakdownLabel, { color: tokens.text }]}>{detailLabel(item.key, kind, language)}</AdminText>
        <AdminText numeric textRole="headline" style={[styles.breakdownCount, { color: tokens.text }]}>{item.count}</AdminText>
      </View>)}
    </View>
  </View>
}

export function AdminOverviewDetailRecordRow({ index, language, record, tokens }: {
  index: number
  language: AppLanguage
  record: AdminViewOverviewDetailRecord
  tokens: CustomerThemeTokens
}) {
  const presentation = recordPresentation(record, language)
  return <View
    accessible
    accessibilityLabel={`${presentation.title}. ${presentation.metadata}. ${presentation.detail}. ${presentation.updated}`}
    style={[styles.recordRow, index > 0 && styles.divider, { borderTopColor: tokens.border }]}
    testID={`admin-overview-detail-record-${recordKey(record)}`}
  >
    <View style={styles.recordTop}>
      <AdminText textRole="headline" style={[styles.recordTitle, { color: tokens.text }]}>{presentation.title}</AdminText>
      <AdminText textRole="footnote" style={[styles.recordUpdated, { color: tokens.subtleText }]}>{presentation.updated}</AdminText>
    </View>
    <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{presentation.metadata}</AdminText>
    <AdminText textRole="footnote" style={{ color: tokens.subtleText }}>{presentation.detail}</AdminText>
  </View>
}

function Feedback({ message, testID, tokens }: { message: string; testID: string; tokens: CustomerThemeTokens }) {
  return <View style={[styles.feedback, { borderColor: tokens.border }]} testID={testID}>
    <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{message}</AdminText>
  </View>
}

function recordPresentation(record: AdminViewOverviewDetailRecord, language: AppLanguage) {
  const updated = formatGeneratedAt(record.updated_at, language, '')
  if (record.kind === 'job') return { detail: detailLabel(record.status, 'status', language), metadata: serviceLabel(record.service_type, language), title: record.display_code, updated }
  if (record.kind === 'application') return {
    detail: `${stageLabel(record.stage, language)} · ${record.checklist.completed_count}/${record.checklist.total_count}`,
    metadata: [record.contact_masked, serviceList(record.service_types, language)].filter(Boolean).join(' · '),
    title: record.name ?? record.application_id,
    updated,
  }
  if (record.kind === 'worker') return { detail: detailLabel(record.state, 'status', language), metadata: serviceList(record.service_types, language), title: record.name ?? record.worker_id, updated }
  if (record.kind === 'payment') return { detail: detailLabel(record.payment_status, 'status', language), metadata: serviceLabel(record.service_type, language), title: record.display_code, updated }
  if (record.kind === 'dispute') return { detail: detailLabel(record.status, 'status', language), metadata: record.dispute_type, title: record.display_code, updated }
  return { detail: detailLabel(record.status, 'status', language), metadata: record.queue_type, title: record.queue_id, updated }
}

function recordKey(record: AdminViewOverviewDetailRecord) {
  if (record.kind === 'job' || record.kind === 'payment') return record.job_id
  if (record.kind === 'application') return record.application_id
  if (record.kind === 'worker') return record.worker_id
  if (record.kind === 'dispute') return record.dispute_id
  return record.queue_id
}

function detailLabel(value: string, kind: 'service' | 'status', language: AppLanguage) {
  if (kind === 'service') return serviceLabel(value, language)
  if (isLocalDealStatus(value)) return localizedStatusLabel(value, language)
  return (language === 'vi' ? VI_STATUS_LABELS : EN_STATUS_LABELS)[value] ?? value.replace(/_/g, ' ')
}

function serviceLabel(value: string, language: AppLanguage) {
  return SERVICE_LABELS[language][value as keyof typeof SERVICE_LABELS.vi] ?? value.replace(/_/g, ' ')
}

function serviceList(values: readonly string[], language: AppLanguage) {
  return values.map((value) => serviceLabel(value, language)).join(', ')
}

function stageLabel(value: string, language: AppLanguage) {
  return (language === 'vi' ? VI_STAGE_LABELS : EN_STAGE_LABELS)[value] ?? value.replace(/_/g, ' ')
}

function formatGeneratedAt(value: string | null, language: AppLanguage, fallback: string) {
  if (!value) return fallback
  const formatted = formatAdminDateTime(value, language, 'numeric')
  return formatted === value && Number.isNaN(new Date(value).getTime()) ? fallback : formatted
}

const SERVICE_LABELS = {
  vi: { electrical: 'Sửa điện', plumbing: 'Sửa nước', cleaning: 'Vệ sinh nhà', hvac: 'Điều hòa và không khí trong nhà', upholstery: 'Chăm sóc sofa và đồ vải', handyman: 'Sửa chữa nhỏ và lắp đặt' },
  en: { electrical: 'Electrical repair', plumbing: 'Plumbing repair', cleaning: 'Home cleaning', hvac: 'Air conditioning and indoor air', upholstery: 'Sofa and fabric care', handyman: 'Minor repair and installation' },
} as const
const VI_STAGE_LABELS: Record<string, string> = { pending_access: 'Chờ cấp quyền', missing_profile: 'Thiếu hồ sơ', ready_verification: 'Sẵn sàng xác minh', verified: 'Đã xác minh' }
const EN_STAGE_LABELS: Record<string, string> = { pending_access: 'Pending access', missing_profile: 'Profile incomplete', ready_verification: 'Ready for verification', verified: 'Verified' }
const VI_STATUS_LABELS: Record<string, string> = { open: 'Đang mở', acknowledged: 'Đã tiếp nhận', submitted: 'Đã gửi xác minh', under_review: 'Đang xét duyệt', suspended: 'Đang tạm ngưng', amount_mismatch: 'Chênh lệch số tiền', resolved: 'Đã xử lý' }
const EN_STATUS_LABELS: Record<string, string> = { open: 'Open', acknowledged: 'Acknowledged', submitted: 'Submitted', under_review: 'Under review', suspended: 'Suspended', amount_mismatch: 'Amount mismatch', resolved: 'Resolved' }

const styles = StyleSheet.create({
  breakdown: { gap: spacing.sm },
  breakdownCount: { ...typography.headline, fontWeight: '600' },
  breakdownLabel: { ...typography.subheadline, flex: 1 },
  breakdownList: { borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth },
  breakdownRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 48, paddingVertical: spacing.sm },
  breakdownTitle: { ...typography.headline, fontWeight: '600' },
  content: { gap: spacing.xl, paddingBottom: spacing.xl, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  currentStatus: { ...typography.footnote, fontWeight: '600' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  eyebrow: { ...typography.caption1, fontWeight: '600', textTransform: 'uppercase' },
  feedback: { borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.lg },
  feedbackRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
  feedbackText: { ...typography.subheadline, flex: 1, minWidth: 180 },
  footer: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  footerButton: { flexGrow: 1, maxWidth: 180, minWidth: 112 },
  generatedAt: { ...typography.footnote },
  handle: { alignSelf: 'center', borderRadius: radius.pill, height: 4, width: 42 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingBottom: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  headerContext: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  horizontalCompact: { paddingHorizontal: spacing.md },
  label: { ...typography.caption1, fontWeight: '600', textTransform: 'uppercase' },
  loading: { alignItems: 'center', gap: spacing.md, justifyContent: 'center', minHeight: 144 },
  oldest: { ...typography.footnote },
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.48)', flex: 1, justifyContent: 'flex-end', padding: spacing.lg },
  overlayCompact: { padding: spacing.sm },
  recordRow: { gap: spacing.xs, minHeight: 84, paddingVertical: spacing.md },
  recordTitle: { ...typography.headline, flex: 1, fontWeight: '600' },
  recordTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  recordUpdated: { ...typography.footnote, flexShrink: 0, textAlign: 'right' },
  records: { borderBottomWidth: StyleSheet.hairlineWidth, borderTopWidth: StyleSheet.hairlineWidth },
  recordsHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  recordsSection: { gap: spacing.sm },
  recordsTitle: { ...typography.headline, fontWeight: '600' },
  scroll: { flex: 1 },
  sheet: { borderRadius: radius.xl, borderWidth: 1, height: '88%', maxWidth: 720, overflow: 'hidden', paddingTop: spacing.sm, width: '100%' },
  sheetCompact: { height: '94%' },
  summary: { borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingBottom: spacing.lg },
  title: { ...typography.title2, fontWeight: '600' },
  total: { ...typography.title1, fontWeight: '600' },
})
