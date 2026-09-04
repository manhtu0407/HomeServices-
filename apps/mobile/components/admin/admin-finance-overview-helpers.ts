import type { AdminFinanceOverviewResponse, AdminFinancePeriodInput } from '@/lib/api-types/admin'

import type { FinanceView } from './admin-finance-controls'

export type FinanceOverviewMetric = AdminFinanceOverviewResponse['metrics'][keyof AdminFinanceOverviewResponse['metrics']]
export type FinanceOverviewCopy = {
  noBreakdown: string
  noTrend: string
  partial: string
  previousUnavailable: string
  trend: string
  unavailable: string
  versusPrevious: string
}
export type FinanceMetricItem = {
  comparison?: string
  dataSource?: string
  direction?: FinanceOverviewMetric['direction']
  key: string
  label: string
  value: string
}

export function normalizeFinanceView(value: string | undefined): FinanceView {
  return value === 'cash' || value === 'commission' || value === 'tax' ? value : 'overview'
}

export function financeMetricItem(
  key: string,
  label: string,
  source: string,
  metric: FinanceOverviewMetric | undefined,
  formatValue: (value: number | null) => string,
  copy: FinanceOverviewCopy,
  legacyValue?: number | null,
): FinanceMetricItem {
  const value = metric?.value ?? legacyValue ?? null
  const qualityLabel = metric?.data_quality === 'partial'
    ? copy.partial
    : metric?.data_quality === 'unavailable' || value === null
      ? copy.unavailable
      : null
  const dataSource = qualityLabel ? `${source} · ${qualityLabel}` : source
  const formattedValue = value === null
    ? metric?.data_quality === 'partial' ? copy.partial : copy.unavailable
    : formatValue(value)
  if (!metric || metric.value === null) return { dataSource, key, label, value: formattedValue }
  if (metric.change_value === null) return { comparison: copy.previousUnavailable, dataSource, direction: 'unavailable', key, label, value: formattedValue }
  const directionMark = metric.direction === 'up' ? '↑' : metric.direction === 'down' ? '↓' : '→'
  const percent = metric.change_percent === null ? '' : ` · ${Math.abs(metric.change_percent).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
  return {
    comparison: `${directionMark} ${formatValue(Math.abs(metric.change_value))}${percent} ${copy.versusPrevious}`,
    dataSource,
    direction: metric.direction,
    key,
    label,
    value: formattedValue,
  }
}

export function financePendingMetricItem(
  key: string,
  label: string,
  value: number | null | undefined,
  formatValue: (value: number | null) => string,
  copy: FinanceOverviewCopy,
): FinanceMetricItem {
  return {
    dataSource: value === null || value === undefined ? copy.unavailable : undefined,
    key,
    label,
    value: formatValue(value ?? null),
  }
}

export function financeBreakdownLabel(value: string, kind: 'payment' | 'service', language: 'vi' | 'en') {
  const paymentLabels: Record<string, readonly [string, string]> = {
    cash: ['Trả trực tiếp cho thợ', 'Paid directly to worker'],
    direct_worker: ['Trả trực tiếp cho thợ', 'Paid directly to worker'],
    platform_bank_manual: ['Chuyển khoản vào nền tảng', 'Transfer to platform'],
    sepay_vietqr: ['Chuyển khoản vào nền tảng', 'Transfer to platform'],
  }
  const serviceLabels: Record<string, readonly [string, string]> = {
    cleaning: ['Vệ sinh nhà cửa', 'Home cleaning'],
    electrical: ['Sửa điện', 'Electrical repair'],
    handyman: ['Sửa chữa nhỏ và lắp đặt', 'Minor repair and installation'],
    hvac: ['Điều hòa và không khí trong nhà', 'Air conditioning and indoor air'],
    plumbing: ['Sửa nước', 'Plumbing repair'],
    upholstery: ['Chăm sóc sofa và đồ vải', 'Sofa and fabric care'],
  }
  const fallback = kind === 'payment' ? ['Phương thức khác', 'Other payment method'] : ['Dịch vụ khác', 'Other service']
  const labels = kind === 'payment' ? paymentLabels[value] : serviceLabels[value]
  return (labels ?? fallback)[language === 'vi' ? 0 : 1]
}

export function customFinancePeriod(from: string, to: string): AdminFinancePeriodInput | null {
  if (!validDateInput(from) || !validDateInput(to)) return null
  const fromDate = new Date(`${from}T00:00:00+07:00`)
  const inclusiveTo = new Date(`${to}T00:00:00+07:00`)
  const toDate = new Date(inclusiveTo.getTime() + 86_400_000)
  const duration = toDate.getTime() - fromDate.getTime()
  if (!Number.isFinite(duration) || duration <= 0 || duration > 366 * 86_400_000) return null
  return { from: fromDate.toISOString(), to: toDate.toISOString() }
}

function validDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
