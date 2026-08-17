import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'

import { color, radius, shadow, spacing, typography } from '@/design/theme'
import type {
  AdminViewActor,
  AdminViewAiCostSummary,
  AdminViewDisputeSummary,
  AdminViewLearningRuleSummary,
  AdminViewPriceBaselineSummary,
} from '@/lib/api-types/admin'
import { type AppLanguage } from '@/lib/app-language'
import { adminControlService } from '@/lib/services'

import { AdminPagination } from './admin-pagination'
import { AdminTabNavigation } from './admin-tab-navigation'

type GovernancePanel = 'disputes' | 'prices' | 'kael'

const PAGE_SIZE = 8
const REFRESH_INTERVAL_MS = 30_000

const copy = {
  vi: {
    aiCosts: 'Chi phí và độ ổn định Kael',
    aiEmpty: 'Chưa có bản ghi chi phí Kael.',
    calls: 'Lần gọi',
    disputes: 'Tranh chấp',
    disputesEmpty: 'Chưa có tranh chấp nào.',
    error: 'Không thể tải dữ liệu giám sát. Hãy thử lại.',
    evidence: 'Bằng chứng',
    failed: 'Lỗi',
    fallback: 'Dự phòng',
    generated: 'Dữ liệu tự động cập nhật khi khu vực này đang mở.',
    kael: 'Giám sát Kael',
    loading: 'Đang tải giám sát hệ thống...',
    ownerOnly: 'Khu vực giám sát hệ thống chỉ dành cho quản trị viên chính.',
    page: (value: number) => `Trang ${value}`,
    priceEmpty: 'Chưa có nền tảng giá nào.',
    priceRange: 'Khoảng giá',
    prices: 'Nền tảng giá',
    provider: 'Nhà cung cấp',
    purpose: 'Mục đích',
    refresh: 'Tải lại',
    rollbackAvailable: 'Có thể hoàn tác',
    ruleEmpty: 'Chưa có quy tắc học nào.',
    rules: 'Quy tắc học',
    status: 'Trạng thái',
    updated: 'Cập nhật',
    version: 'Phiên bản',
  },
  en: {
    aiCosts: 'Kael cost and reliability',
    aiEmpty: 'No Kael cost record yet.',
    calls: 'Calls',
    disputes: 'Disputes',
    disputesEmpty: 'There are no disputes.',
    error: 'Unable to load monitoring data. Please try again.',
    evidence: 'Evidence',
    failed: 'Failures',
    fallback: 'Fallbacks',
    generated: 'This data refreshes while the section is open.',
    kael: 'Kael monitoring',
    loading: 'Loading system monitoring...',
    ownerOnly: 'System monitoring is available only to the Owner Admin.',
    page: (value: number) => `Page ${value}`,
    priceEmpty: 'No price baseline is available.',
    priceRange: 'Price range',
    prices: 'Price baselines',
    provider: 'Provider',
    purpose: 'Purpose',
    refresh: 'Refresh',
    rollbackAvailable: 'Rollback available',
    ruleEmpty: 'No learning rule is available.',
    rules: 'Learning rules',
    status: 'Status',
    updated: 'Updated',
    version: 'Version',
  },
} as const

export function AdminGovernancePanel({ actor, language }: { actor: AdminViewActor | null; language: AppLanguage }) {
  const labels = copy[language]
  const [activePanel, setActivePanel] = useState<GovernancePanel>('disputes')
  const [disputePage, setDisputePage] = useState(1)
  const [pricePage, setPricePage] = useState(1)
  const [costPage, setCostPage] = useState(1)
  const [rulePage, setRulePage] = useState(1)
  const [disputes, setDisputes] = useState<AdminViewDisputeSummary[]>([])
  const [prices, setPrices] = useState<AdminViewPriceBaselineSummary[]>([])
  const [costs, setCosts] = useState<AdminViewAiCostSummary[]>([])
  const [rules, setRules] = useState<AdminViewLearningRuleSummary[]>([])
  const [disputeTotal, setDisputeTotal] = useState(0)
  const [priceTotal, setPriceTotal] = useState(0)
  const [costTotal, setCostTotal] = useState(0)
  const [ruleTotal, setRuleTotal] = useState(0)
  const [disputeHasMore, setDisputeHasMore] = useState(false)
  const [priceHasMore, setPriceHasMore] = useState(false)
  const [costHasMore, setCostHasMore] = useState(false)
  const [ruleHasMore, setRuleHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (actor?.access_level !== 'owner') {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    if (activePanel === 'disputes') {
      const result = await adminControlService.listDisputes({ limit: PAGE_SIZE, offset: (disputePage - 1) * PAGE_SIZE })
      if (result.success) {
        setDisputes(result.data.disputes)
        setDisputeTotal(result.data.total_count)
        setDisputeHasMore(result.data.has_more)
      } else setError(result.error)
    } else if (activePanel === 'prices') {
      const result = await adminControlService.listPriceBaselines({ limit: PAGE_SIZE, offset: (pricePage - 1) * PAGE_SIZE })
      if (result.success) {
        setPrices(result.data.price_baselines)
        setPriceTotal(result.data.total_count)
        setPriceHasMore(result.data.has_more)
      } else setError(result.error)
    } else {
      const [costResult, ruleResult] = await Promise.all([
        adminControlService.listAiCosts({ limit: PAGE_SIZE, offset: (costPage - 1) * PAGE_SIZE }),
        adminControlService.listLearningRules({ limit: PAGE_SIZE, offset: (rulePage - 1) * PAGE_SIZE }),
      ])
      if (costResult.success) {
        setCosts(costResult.data.costs)
        setCostTotal(costResult.data.total_count)
        setCostHasMore(costResult.data.has_more)
      }
      if (ruleResult.success) {
        setRules(ruleResult.data.rules)
        setRuleTotal(ruleResult.data.total_count)
        setRuleHasMore(ruleResult.data.has_more)
      }
      if (!costResult.success) setError(costResult.error)
      else if (!ruleResult.success) setError(ruleResult.error)
    }
    setLoading(false)
  }, [activePanel, actor?.access_level, costPage, disputePage, pricePage, rulePage])

  useEffect(() => {
    const initialLoad = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(initialLoad)
  }, [load])

  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => { void load() }, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load]))

  if (actor?.access_level !== 'owner') return <View style={styles.empty}><Text style={styles.emptyText}>{labels.ownerOnly}</Text></View>

  return <View style={styles.stack} testID="admin-governance-panel">
    <View style={styles.heading}>
      <View>
        <Text style={styles.title}>{labels.kael}</Text>
        <Text style={styles.subtitle}>{labels.generated}</Text>
      </View>
      <Pressable accessibilityLabel={labels.refresh} accessibilityRole="button" onPress={() => { void load() }} style={styles.refresh}>
        <Text style={styles.refreshText}>{labels.refresh}</Text>
      </Pressable>
    </View>
    <AdminTabNavigation
      items={[
        { key: 'disputes', label: labels.disputes, onPress: () => { setActivePanel('disputes'); setDisputePage(1) }, selected: activePanel === 'disputes', testID: 'admin-governance-disputes-tab' },
        { key: 'prices', label: labels.prices, onPress: () => { setActivePanel('prices'); setPricePage(1) }, selected: activePanel === 'prices', testID: 'admin-governance-prices-tab' },
        { key: 'kael', label: 'Kael', onPress: () => { setActivePanel('kael'); setCostPage(1); setRulePage(1) }, selected: activePanel === 'kael', testID: 'admin-governance-kael-tab' },
      ]}
      testID="admin-governance-navigation"
    />
    {loading ? <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><Text style={styles.loadingText}>{labels.loading}</Text></View> : error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{labels.error}</Text><Pressable accessibilityRole="button" onPress={() => { void load() }}><Text style={styles.retry}>{labels.refresh}</Text></Pressable></View> : activePanel === 'disputes' ? <>
      {disputes.length === 0 ? <EmptyState label={labels.disputesEmpty} /> : disputes.map((item) => <DisputeCard item={item} key={item.id} language={language} />)}
      <Pagination hasMore={disputeHasMore} language={language} loading={loading} onPageChange={setDisputePage} page={disputePage} prefix="admin-governance-dispute-page" total={disputeTotal} />
    </> : activePanel === 'prices' ? <>
      {prices.length === 0 ? <EmptyState label={labels.priceEmpty} /> : prices.map((item) => <PriceCard item={item} key={item.id} language={language} />)}
      <Pagination hasMore={priceHasMore} language={language} loading={loading} onPageChange={setPricePage} page={pricePage} prefix="admin-governance-price-page" total={priceTotal} />
    </> : <>
      <Text style={styles.sectionTitle}>{labels.aiCosts}</Text>
      {costs.length === 0 ? <EmptyState label={labels.aiEmpty} /> : costs.map((item) => <CostCard item={item} key={`${item.day}:${item.provider}:${item.purpose}`} language={language} />)}
      <Pagination hasMore={costHasMore} language={language} loading={loading} onPageChange={setCostPage} page={costPage} prefix="admin-governance-cost-page" total={costTotal} />
      <Text style={styles.sectionTitle}>{labels.rules}</Text>
      {rules.length === 0 ? <EmptyState label={labels.ruleEmpty} /> : rules.map((item) => <RuleCard item={item} key={item.id} language={language} />)}
      <Pagination hasMore={ruleHasMore} language={language} loading={loading} onPageChange={setRulePage} page={rulePage} prefix="admin-governance-rule-page" total={ruleTotal} />
    </>}
  </View>
}

function Pagination({ hasMore, language, loading, onPageChange, page, prefix, total }: { hasMore: boolean; language: AppLanguage; loading: boolean; onPageChange: (page: number) => void; page: number; prefix: string; total: number }) {
  const labels = copy[language]
  return <AdminPagination hasMore={hasMore} labels={{ more: '…', next: language === 'vi' ? 'Trang sau' : 'Next page', page: labels.page, previous: language === 'vi' ? 'Trang trước' : 'Previous page' }} loading={loading} onPageChange={onPageChange} page={page} pageSize={PAGE_SIZE} pageTestIDPrefix={prefix} testID={`${prefix}-pagination`} totalCount={total} />
}

function DisputeCard({ item, language }: { item: AdminViewDisputeSummary; language: AppLanguage }) {
  const labels = copy[language]
  return <View style={styles.card} testID={`admin-governance-dispute-${item.id}`}>
    <View style={styles.cardTop}><Text style={styles.cardTitle}>{item.display_code}</Text><Text style={styles.pill}>{disputeStatusLabel(item.status, language)}</Text></View>
    <Text style={styles.cardMeta}>{disputeTypeLabel(item.dispute_type, language)} · {actorLabel(item.initiated_by, language)}</Text>
    <Metric label={labels.updated} value={formatDate(item.updated_at, language)} />
  </View>
}

function PriceCard({ item, language }: { item: AdminViewPriceBaselineSummary; language: AppLanguage }) {
  const labels = copy[language]
  return <View style={styles.card} testID={`admin-governance-price-${item.id}`}>
    <View style={styles.cardTop}><Text style={styles.cardTitle}>{serviceLabel(item.service_type, language)}</Text><Text style={styles.pill}>{complexityLabel(item.complexity, language)}</Text></View>
    <Metric label={labels.priceRange} value={`${formatVnd(item.price_min, language)} – ${formatVnd(item.price_max, language)}`} />
    <Text style={styles.cardMeta}>{districtLabel(item.district_code, language)} · {labels.version} {item.version}</Text>
  </View>
}

function CostCard({ item, language }: { item: AdminViewAiCostSummary; language: AppLanguage }) {
  const labels = copy[language]
  return <View style={styles.card} testID={`admin-governance-cost-${item.day}-${item.purpose}`}>
    <View style={styles.cardTop}><Text style={styles.cardTitle}>{kaelPurposeLabel(item.purpose, language)}</Text><Text style={styles.pill}>{providerLabel(item.provider, language)}</Text></View>
    <View style={styles.metricGrid}><Metric label={labels.calls} value={String(item.call_count)} /><Metric label={labels.failed} value={String(item.failure_count)} /><Metric label="USD" value={formatUsd(item.total_cost_usd, language)} /></View>
    <Text style={styles.cardMeta}>{formatDate(item.day, language)} · {labels.fallback}: {item.fallback_count}</Text>
  </View>
}

function RuleCard({ item, language }: { item: AdminViewLearningRuleSummary; language: AppLanguage }) {
  const labels = copy[language]
  return <View style={styles.card} testID={`admin-governance-rule-${item.id}`}>
    <View style={styles.cardTop}><Text style={styles.cardTitle}>{learningRuleLabel(item.rule_type, language)}</Text><Text style={styles.pill}>{ruleStatusLabel(item.status, language)}</Text></View>
    <View style={styles.metricGrid}><Metric label={labels.version} value={String(item.active_version)} /><Metric label={labels.evidence} value={String(item.evidence_count)} /><Metric label={labels.rollbackAvailable} value={item.rollback_available ? '✓' : '—'} /></View>
    <Text style={styles.cardMeta}>{item.affected_service ? serviceLabel(item.affected_service, language) : 'Kael'} · {formatDate(item.updated_at, language)}</Text>
  </View>
}

function actorLabel(value: string, language: AppLanguage) {
  if (value === 'customer') return language === 'vi' ? 'Khách hàng' : 'Customer'
  if (value === 'worker') return language === 'vi' ? 'Thợ' : 'Worker'
  return language === 'vi' ? 'Tài khoản trong hệ thống' : 'System account'
}

function complexityLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    large: ['Lớn', 'Large'],
    medium: ['Trung bình', 'Medium'],
    small: ['Nhỏ', 'Small'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Chưa phân loại' : 'Unclassified')
}

function districtLabel(value: string, language: AppLanguage) {
  if (value === 'hcmc_all') return language === 'vi' ? 'TP. Hồ Chí Minh' : 'Ho Chi Minh City'
  return language === 'vi' ? 'Khu vực đã cấu hình' : 'Configured area'
}

function disputeStatusLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    admin_decided: ['Đã quyết định', 'Decided'],
    open: ['Đang mở', 'Open'],
    resolved: ['Đã xử lý', 'Resolved'],
    under_review: ['Đang xem xét', 'Under review'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Cần xem xét' : 'Needs review')
}

function disputeTypeLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    cancellation: ['Hủy việc', 'Cancellation'],
    payment: ['Thanh toán', 'Payment'],
    scope: ['Phạm vi công việc', 'Work scope'],
    work_quality: ['Chất lượng công việc', 'Work quality'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Yêu cầu hỗ trợ' : 'Support request')
}

function kaelPurposeLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    chat: ['Trò chuyện với Kael', 'Kael chat'],
    classify: ['Phân loại yêu cầu', 'Request classification'],
    estimate: ['Ước tính công việc', 'Work estimate'],
    routing: ['Điều phối yêu cầu', 'Request routing'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Tác vụ Kael' : 'Kael task')
}

function learningRuleLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    matching: ['Quy tắc ghép việc', 'Matching rule'],
    pricing: ['Quy tắc giá', 'Pricing rule'],
    quality: ['Quy tắc chất lượng', 'Quality rule'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Quy tắc học' : 'Learning rule')
}

function providerLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    anthropic: ['Anthropic', 'Anthropic'],
    deepseek: ['DeepSeek', 'DeepSeek'],
    openai: ['OpenAI', 'OpenAI'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Nhà cung cấp AI' : 'AI provider')
}

function ruleStatusLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    active: ['Đang áp dụng', 'Active'],
    archived: ['Đã lưu trữ', 'Archived'],
    paused: ['Tạm dừng', 'Paused'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Cần xem xét' : 'Needs review')
}

function serviceLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    cleaning: ['Dọn dẹp nhà cửa', 'Home cleaning'],
    electrical: ['Sửa điện', 'Electrical repair'],
    handyman: ['Sửa chữa vặt', 'Handyman'],
    hvac: ['Điều hòa', 'Air conditioning'],
    plumbing: ['Sửa nước', 'Plumbing repair'],
    upholstery: ['Vệ sinh nội thất', 'Upholstery care'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Dịch vụ khác' : 'Other service')
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text numberOfLines={1} style={styles.metricValue}>{value}</Text></View>
}

function EmptyState({ label }: { label: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{label}</Text></View>
}

function formatDate(value: string, language: AppLanguage) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'medium' }).format(date)
}

function formatVnd(value: number, language: AppLanguage) {
  return new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { currency: 'VND', maximumFractionDigits: 0, style: 'currency' }).format(value)
}

function formatUsd(value: number, language: AppLanguage) {
  return new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { currency: 'USD', maximumFractionDigits: 4, style: 'currency' }).format(value)
}

const styles = StyleSheet.create({
  card: { ...shadow.soft, backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  cardMeta: { ...typography.footnote, color: color.text.secondary },
  cardTitle: { ...typography.headline, color: color.text.strong, flex: 1, textTransform: 'capitalize' },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  empty: { ...shadow.soft, alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: radius.lg, borderWidth: 1, minHeight: 88, justifyContent: 'center', padding: spacing.lg },
  emptyText: { ...typography.callout, color: color.text.secondary, textAlign: 'center' },
  error: { alignItems: 'center', backgroundColor: color.mint.mint50, borderColor: color.mint.mint300, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  errorText: { ...typography.footnote, color: color.text.secondary, textAlign: 'center' },
  heading: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  loading: { alignItems: 'center', gap: spacing.sm, minHeight: 160, justifyContent: 'center' },
  loadingText: { ...typography.footnote, color: color.text.secondary },
  metric: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  metricGrid: { flexDirection: 'row', gap: spacing.sm },
  metricLabel: { ...typography.caption, color: color.text.muted, fontWeight: '600' },
  metricValue: { ...typography.footnote, color: color.text.strong, fontWeight: '600' },
  pill: { ...typography.caption, backgroundColor: color.mint.mint50, borderColor: color.mint.mint300, borderRadius: radius.pill, borderWidth: 1, color: color.brand.primaryDark, fontWeight: '600', overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, textTransform: 'capitalize' },
  refresh: { alignItems: 'center', borderColor: color.mint.mint300, borderRadius: radius.pill, borderWidth: 1, minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md },
  refreshText: { ...typography.footnote, color: color.brand.primaryDark, fontWeight: '600' },
  retry: { ...typography.footnote, color: color.brand.primaryDark, fontWeight: '600' },
  sectionTitle: { ...typography.title3, color: color.text.strong, marginTop: spacing.xs },
  stack: { gap: spacing.md },
  subtitle: { ...typography.footnote, color: color.text.secondary, marginTop: spacing.xxs, maxWidth: 260 },
  title: { ...typography.title2, color: color.text.strong, fontWeight: '600' },
})
