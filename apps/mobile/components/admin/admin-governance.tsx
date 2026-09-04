import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { color, radius, spacing } from '@/design/theme'
import type {
  AdminViewActor,
  AdminViewAiCostSummary,
  AdminViewLearningRuleSummary,
  AdminViewPriceBaselineSummary,
} from '@/lib/api-types/admin'
import { type AppLanguage } from '@/lib/app-language'
import { adminControlService } from '@/lib/services'

import { AdminPagination } from './admin-pagination'
import { AdminPolicyGovernance } from './admin-policy-governance'
import { AdminTabNavigation } from './admin-tab-navigation'
import { AdminText } from './admin-text'

export type AdminGovernancePanelId = 'prices' | 'policies' | 'kael'

const PAGE_SIZE = 8

const copy = {
  vi: {
    aiCosts: 'Chi phí và độ ổn định Kael',
    aiEmpty: 'Chưa có bản ghi chi phí Kael.',
    calls: 'Lần gọi',
    error: 'Không thể tải dữ liệu giám sát. Hãy thử lại.',
    evidence: 'Bằng chứng',
    failed: 'Lỗi',
    fallback: 'Dự phòng',
    kael: 'Giám sát Kael',
    loading: 'Đang tải giám sát hệ thống...',
    ownerOnly: 'Khu vực giám sát hệ thống chỉ dành cho quản trị viên chính.',
    page: (value: number) => `Trang ${value}`,
    priceEmpty: 'Chưa có nền tảng giá nào.',
    priceRange: 'Khoảng giá',
    prices: 'Nền tảng giá',
    policies: 'Chính sách',
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
    error: 'Unable to load monitoring data. Please try again.',
    evidence: 'Evidence',
    failed: 'Failures',
    fallback: 'Fallbacks',
    kael: 'Kael monitoring',
    loading: 'Loading system monitoring...',
    ownerOnly: 'System monitoring is available only to the Owner Admin.',
    page: (value: number) => `Page ${value}`,
    priceEmpty: 'No price baseline is available.',
    priceRange: 'Price range',
    prices: 'Price baselines',
    policies: 'Policies',
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

type GovernanceState = {
  activePanel: AdminGovernancePanelId
  costHasMore: boolean
  costPage: number
  costs: AdminViewAiCostSummary[]
  costTotal: number
  error: string | null
  loading: boolean
  priceHasMore: boolean
  pricePage: number
  prices: AdminViewPriceBaselineSummary[]
  priceTotal: number
  ruleHasMore: boolean
  rulePage: number
  rules: AdminViewLearningRuleSummary[]
  ruleTotal: number
}

function initialGovernanceState(activePanel: AdminGovernancePanelId): GovernanceState {
  return {
    activePanel,
    costHasMore: false,
    costPage: 1,
    costs: [],
    costTotal: 0,
    error: null,
    loading: true,
    priceHasMore: false,
    pricePage: 1,
    prices: [],
    priceTotal: 0,
    ruleHasMore: false,
    rulePage: 1,
    rules: [],
    ruleTotal: 0,
  }
}

function governanceReducer(state: GovernanceState, patch: Partial<GovernanceState>) {
  return { ...state, ...patch }
}

export function AdminGovernancePanel({ actor, initialPanel = 'prices', language }: {
  actor: AdminViewActor | null
  initialPanel?: AdminGovernancePanelId
  language: AppLanguage
}) {
  const labels = copy[language]
  const [state, patch] = useReducer(governanceReducer, initialPanel, initialGovernanceState)
  const {
    activePanel,
    costHasMore,
    costPage,
    costs,
    costTotal,
    error,
    loading,
    priceHasMore,
    pricePage,
    prices,
    priceTotal,
    ruleHasMore,
    rulePage,
    rules,
    ruleTotal,
  } = state
  const loadedPanels = useMemo(() => new Set<AdminGovernancePanelId>(), [])
  const backgroundLoads = useMemo(() => new Set<AdminGovernancePanelId>(), [])
  const loadRequestIds = useMemo<Partial<Record<AdminGovernancePanelId, number>>>(() => ({}), [])
  const activePanelRef = useRef(activePanel)

  useEffect(() => {
    activePanelRef.current = activePanel
  }, [activePanel])

  const load = useCallback(async ({ blocking }: { blocking?: boolean } = {}) => {
    if (actor?.access_level !== 'owner') {
      patch({ loading: false })
      return
    }
    const requestedPanel = activePanel
    const shouldBlock = blocking ?? !loadedPanels.has(requestedPanel)
    if (!shouldBlock && backgroundLoads.has(requestedPanel)) return
    if (!shouldBlock) backgroundLoads.add(requestedPanel)
    const requestId = (loadRequestIds[requestedPanel] ?? 0) + 1
    loadRequestIds[requestedPanel] = requestId
    patch({ error: null, ...(shouldBlock ? { loading: true } : {}) })
    try {
      if (requestedPanel === 'policies') {
        return
      } else if (requestedPanel === 'prices') {
        const result = await adminControlService.listPriceBaselines({ limit: PAGE_SIZE, offset: (pricePage - 1) * PAGE_SIZE })
        if (requestId === loadRequestIds[requestedPanel] && activePanelRef.current === requestedPanel) {
          if (result.success) {
            patch({
              priceHasMore: result.data.has_more,
              prices: result.data.price_baselines,
              priceTotal: result.data.total_count,
            })
          } else patch({ error: result.error })
        }
      } else {
        const [costResult, ruleResult] = await Promise.all([
          adminControlService.listAiCosts({ limit: PAGE_SIZE, offset: (costPage - 1) * PAGE_SIZE }),
          adminControlService.listLearningRules({ limit: PAGE_SIZE, offset: (rulePage - 1) * PAGE_SIZE }),
        ])
        if (requestId === loadRequestIds[requestedPanel] && activePanelRef.current === requestedPanel) {
          if (costResult.success) {
            patch({
              costHasMore: costResult.data.has_more,
              costs: costResult.data.costs,
              costTotal: costResult.data.total_count,
            })
          }
          if (ruleResult.success) {
            patch({
              ruleHasMore: ruleResult.data.has_more,
              rules: ruleResult.data.rules,
              ruleTotal: ruleResult.data.total_count,
            })
          }
          if (!costResult.success) patch({ error: costResult.error })
          else if (!ruleResult.success) patch({ error: ruleResult.error })
        }
      }
    } finally {
      if (requestId === loadRequestIds[requestedPanel]) {
        loadedPanels.add(requestedPanel)
        backgroundLoads.delete(requestedPanel)
        if (activePanelRef.current === requestedPanel) patch({ loading: false })
      }
    }
  }, [activePanel, actor?.access_level, backgroundLoads, costPage, loadRequestIds, loadedPanels, pricePage, rulePage])

  useEffect(() => {
    const panelAtStart = activePanel
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
      loadRequestIds[panelAtStart] = (loadRequestIds[panelAtStart] ?? 0) + 1
      backgroundLoads.delete(panelAtStart)
    }
  }, [activePanel, backgroundLoads, costPage, load, loadRequestIds, pricePage, rulePage])

  if (actor?.access_level !== 'owner') return <View style={styles.empty}><AdminText textRole="subheadline" style={styles.emptyText}>{labels.ownerOnly}</AdminText></View>

  return <View style={styles.stack} testID="admin-governance-panel">
    <View style={styles.heading}>
      <View>
        <AdminText textRole="headline" style={styles.title}>{labels.kael}</AdminText>
      </View>
      <Pressable accessibilityLabel={labels.refresh} accessibilityRole="button" onPress={() => { void load() }} style={styles.refresh}>
        <AdminText textRole="subheadline" style={styles.refreshText}>{labels.refresh}</AdminText>
      </Pressable>
    </View>
    <AdminTabNavigation
      items={[
        { key: 'prices', label: labels.prices, onPress: () => patch({ activePanel: 'prices', pricePage: 1 }), selected: activePanel === 'prices', testID: 'admin-governance-prices-tab' },
        { key: 'policies', label: labels.policies, onPress: () => patch({ activePanel: 'policies' }), selected: activePanel === 'policies', testID: 'admin-governance-policies-tab' },
        { key: 'kael', label: 'Kael', onPress: () => patch({ activePanel: 'kael', costPage: 1, rulePage: 1 }), selected: activePanel === 'kael', testID: 'admin-governance-kael-tab' },
      ]}
      testID="admin-governance-navigation"
    />
    {loading ? <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><AdminText textRole="subheadline" style={styles.loadingText}>{labels.loading}</AdminText></View> : error ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{labels.error}</AdminText><Pressable accessibilityRole="button" onPress={() => { void load() }}><AdminText textRole="headline" style={styles.retry}>{labels.refresh}</AdminText></Pressable></View> : activePanel === 'prices' ? <>
      {prices.length === 0 ? <EmptyState label={labels.priceEmpty} /> : prices.map((item) => <PriceCard item={item} key={item.id} language={language} />)}
      <Pagination hasMore={priceHasMore} language={language} loading={loading} onPageChange={(pricePage) => patch({ pricePage })} page={pricePage} prefix="admin-governance-price-page" total={priceTotal} />
    </> : activePanel === 'policies' ? <AdminPolicyGovernance language={language} /> : <>
      <AdminText textRole="title2" style={styles.sectionTitle}>{labels.aiCosts}</AdminText>
      {costs.length === 0 ? <EmptyState label={labels.aiEmpty} /> : costs.map((item) => <CostCard item={item} key={`${item.day}:${item.provider}:${item.purpose}`} language={language} />)}
      <Pagination hasMore={costHasMore} language={language} loading={loading} onPageChange={(costPage) => patch({ costPage })} page={costPage} prefix="admin-governance-cost-page" total={costTotal} />
      <AdminText textRole="title2" style={styles.sectionTitle}>{labels.rules}</AdminText>
      {rules.length === 0 ? <EmptyState label={labels.ruleEmpty} /> : rules.map((item) => <RuleCard item={item} key={item.id} language={language} />)}
      <Pagination hasMore={ruleHasMore} language={language} loading={loading} onPageChange={(rulePage) => patch({ rulePage })} page={rulePage} prefix="admin-governance-rule-page" total={ruleTotal} />
    </>}
  </View>
}

function Pagination({ hasMore, language, loading, onPageChange, page, prefix, total }: { hasMore: boolean; language: AppLanguage; loading: boolean; onPageChange: (page: number) => void; page: number; prefix: string; total: number }) {
  const labels = copy[language]
  return <AdminPagination hasMore={hasMore} labels={{ more: '…', next: language === 'vi' ? 'Trang sau' : 'Next page', page: labels.page, previous: language === 'vi' ? 'Trang trước' : 'Previous page' }} loading={loading} onPageChange={onPageChange} page={page} pageSize={PAGE_SIZE} pageTestIDPrefix={prefix} testID={`${prefix}-pagination`} totalCount={total} />
}

function PriceCard({ item, language }: { item: AdminViewPriceBaselineSummary; language: AppLanguage }) {
  const labels = copy[language]
  return <View style={styles.card} testID={`admin-governance-price-${item.id}`}>
    <View style={styles.cardTop}><AdminText textRole="headline" style={styles.cardTitle}>{serviceLabel(item.service_type, language)}</AdminText><AdminText textRole="caption1" style={styles.pill}>{complexityLabel(item.complexity, language)}</AdminText></View>
    <Metric label={labels.priceRange} value={`${formatVnd(item.price_min, language)} – ${formatVnd(item.price_max, language)}`} />
    <AdminText textRole="footnote" style={styles.cardMeta}>{districtLabel(item.district_code, language)} · {labels.version} {item.version}</AdminText>
  </View>
}

function CostCard({ item, language }: { item: AdminViewAiCostSummary; language: AppLanguage }) {
  const labels = copy[language]
  return <View style={styles.card} testID={`admin-governance-cost-${item.day}-${item.purpose}`}>
    <View style={styles.cardTop}><AdminText textRole="headline" style={styles.cardTitle}>{kaelPurposeLabel(item.purpose, language)}</AdminText><AdminText textRole="caption1" style={styles.pill}>{providerLabel(item.provider, language)}</AdminText></View>
    <View style={styles.metricGrid}><Metric label={labels.calls} value={String(item.call_count)} /><Metric label={labels.failed} value={String(item.failure_count)} /><Metric label="USD" value={formatUsd(item.total_cost_usd, language)} /></View>
    <AdminText textRole="footnote" style={styles.cardMeta}>{formatDate(item.day, language)} · {labels.fallback}: {item.fallback_count}</AdminText>
  </View>
}

function RuleCard({ item, language }: { item: AdminViewLearningRuleSummary; language: AppLanguage }) {
  const labels = copy[language]
  return <View style={styles.card} testID={`admin-governance-rule-${item.id}`}>
    <View style={styles.cardTop}><AdminText textRole="headline" style={styles.cardTitle}>{learningRuleLabel(item.rule_type, language)}</AdminText><AdminText textRole="caption1" style={styles.pill}>{ruleStatusLabel(item.status, language)}</AdminText></View>
    <View style={styles.metricGrid}><Metric label={labels.version} value={String(item.active_version)} /><Metric label={labels.evidence} value={String(item.evidence_count)} /><Metric label={labels.rollbackAvailable} value={item.rollback_available ? '✓' : '—'} /></View>
    <AdminText textRole="footnote" style={styles.cardMeta}>{item.affected_service ? serviceLabel(item.affected_service, language) : 'Kael'} · {formatDate(item.updated_at, language)}</AdminText>
  </View>
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
  return <View style={styles.metric}><AdminText textRole="subheadline" style={styles.metricLabel}>{label}</AdminText><AdminText numeric textRole="headline" style={styles.metricValue}>{value}</AdminText></View>
}

function EmptyState({ label }: { label: string }) {
  return <View style={styles.empty}><AdminText textRole="subheadline" style={styles.emptyText}>{label}</AdminText></View>
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
  card: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  cardMeta: { color: color.text.secondary },
  cardTitle: { color: color.text.strong, flex: 1, textTransform: 'capitalize' },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  empty: { alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: radius.lg, borderWidth: 1, minHeight: 88, justifyContent: 'center', padding: spacing.lg },
  emptyText: { color: color.text.secondary, textAlign: 'center' },
  error: { alignItems: 'center', backgroundColor: color.mint.mint50, borderColor: color.mint.mint300, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  errorText: { color: color.text.secondary, textAlign: 'center' },
  heading: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  loading: { alignItems: 'center', gap: spacing.sm, minHeight: 160, justifyContent: 'center' },
  loadingText: { color: color.text.secondary },
  metric: { flex: 1, gap: spacing.xxs, minWidth: 0 },
  metricGrid: { flexDirection: 'row', gap: spacing.sm },
  metricLabel: { color: color.text.muted, fontWeight: '600' },
  metricValue: { color: color.text.strong, fontWeight: '600' },
  pill: { backgroundColor: color.mint.mint50, borderColor: color.mint.mint300, borderRadius: radius.pill, borderWidth: 1, color: color.brand.primaryDark, fontWeight: '600', overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, textTransform: 'capitalize' },
  refresh: { alignItems: 'center', borderColor: color.mint.mint300, borderRadius: radius.pill, borderWidth: 1, minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md },
  refreshText: { color: color.brand.primaryDark, fontWeight: '600' },
  retry: { color: color.brand.primaryDark, fontWeight: '600' },
  sectionTitle: { color: color.text.strong, marginTop: spacing.xs },
  stack: { gap: spacing.md },
  title: { color: color.text.strong, fontWeight: '600' },
})
