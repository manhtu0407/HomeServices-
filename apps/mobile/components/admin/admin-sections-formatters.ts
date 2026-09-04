import { useCallback, useMemo } from 'react'

import { localizedStatusLabel } from '@/lib/app-language'
import type { AdminViewTransactionSummary } from '@/lib/api-types/admin'

import type { AdminSectionsCopy } from './admin-sections-copy'

const serviceLabels = {
  vi: {
    electrical: 'Sửa điện',
    plumbing: 'Sửa nước',
    cleaning: 'Vệ sinh nhà',
    hvac: 'Điều hòa và không khí trong nhà',
    upholstery: 'Chăm sóc sofa và đồ vải',
    handyman: 'Sửa chữa nhỏ và lắp đặt',
  },
  en: {
    electrical: 'Electrical repair',
    plumbing: 'Plumbing repair',
    cleaning: 'Home cleaning',
    hvac: 'Air conditioning and indoor air',
    upholstery: 'Sofa and fabric care',
    handyman: 'Minor repair and installation',
  },
} as const

export function useAdminSectionFormatters(copy: AdminSectionsCopy, language: 'vi' | 'en') {
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }), [language])
  const currencyFormatter = useMemo(() => new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }), [language])
  const formatDate = useCallback((value: string | null | undefined) => {
    if (!value) return copy.notRecorded
    try {
      return dateFormatter.format(new Date(value))
    } catch {
      return copy.notRecorded
    }
  }, [copy.notRecorded, dateFormatter])
  const formatCurrency = useCallback((value: number | null) => value === null
    ? copy.notRecorded
    : currencyFormatter.format(value), [copy.notRecorded, currencyFormatter])
  const serviceLabel = useCallback((value: AdminViewTransactionSummary['service_type']) => serviceLabels[language][value], [language])
  const statusLabel = useCallback((value: string | null) => value ? (copy.transactionStatus[value] ?? copy.notRecorded) : copy.notRecorded, [copy.notRecorded, copy.transactionStatus])
  const paymentProviderLabel = useCallback((value: string | null) => value ? (copy.paymentProvider[value] ?? copy.notRecorded) : copy.notRecorded, [copy.notRecorded, copy.paymentProvider])
  const disputeStatusLabel = useCallback((value: string | null) => value ? (copy.disputeStatus[value] ?? copy.notRecorded) : copy.notRecorded, [copy.disputeStatus, copy.notRecorded])
  const jobStatusLabel = useCallback((value: AdminViewTransactionSummary['status']) => localizedStatusLabel(value, language), [language])

  return useMemo(() => ({
    disputeStatusLabel,
    formatCurrency,
    formatDate,
    jobStatusLabel,
    paymentProviderLabel,
    serviceLabel,
    statusLabel,
  }), [disputeStatusLabel, formatCurrency, formatDate, jobStatusLabel, paymentProviderLabel, serviceLabel, statusLabel])
}
