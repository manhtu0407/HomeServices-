import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  View,
} from 'react-native'

import { KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type {
  AdminViewActor,
  AdminViewPayoutMethodDetailResponse,
  AdminViewPayoutMethodStatus,
  AdminViewPayoutMethodSummary,
  AdminViewWithdrawalRequestDetailResponse,
  AdminViewWithdrawalRequestStatus,
  AdminViewWithdrawalRequestSummary,
  AdminViewSensitivePayoutAccessResponse,
} from '@/lib/api-types/admin'
import { useAppLanguage } from '@/lib/app-language'
import { useAdminSectionAutoRefresh } from '@/lib/admin-data-sync'
import { adminPayoutCopyByLanguage } from './admin-payouts-copy'
import { generateClientRequestId } from '@/lib/client-request-id'
import { adminControlService } from '@/lib/services'
import { FinanceChoiceChip } from './admin-finance-controls'
import { EmptyPayoutState, PayoutMethodCard, WithdrawalRequestCard } from './admin-payout-list'
import { PayoutMethodDetail, WithdrawalDetail, type WithdrawalResolution } from './admin-payout-details'
import { adminPayoutStyles as styles } from './admin-payout-styles'
import { AdminTabNavigation } from './admin-tab-navigation'
import { AdminPagination } from './admin-pagination'
import { AdminText } from './admin-text'

type PayoutPanelTab = 'accounts' | 'withdrawals'
type PayoutMethodFilter = 'pending_verification' | 'all'
type WithdrawalFilter = 'pending' | 'processing' | 'all'
type WithdrawalAssignment = 'all' | 'mine' | 'unassigned'
type AdminPayoutsPanelProps = {
  actor: AdminViewActor | null
  initialTab?: PayoutPanelTab
  reduceMotion: boolean
  reduceTransparency: boolean
}
const PAYOUTS_PER_PAGE = 8

function useAdminPayoutsController({ actor, initialTab = 'accounts' }: AdminPayoutsPanelProps) {
  const language = useAppLanguage()
  const copy = adminPayoutCopyByLanguage[language]
  const [activeTab, setActiveTab] = useState<PayoutPanelTab>(initialTab)
  const [methodFilter, setMethodFilter] = useState<PayoutMethodFilter>('pending_verification')
  const [withdrawalFilter, setWithdrawalFilter] = useState<WithdrawalFilter>('pending')
  const [withdrawalAssignment, setWithdrawalAssignment] = useState<WithdrawalAssignment>('all')
  const [queryState, patchQueryState] = useReducer((current: {
    debouncedSearch: string
    payoutMethodPage: number
    withdrawalPage: number
  }, next: Partial<{
    debouncedSearch: string
    payoutMethodPage: number
    withdrawalPage: number
  }>) => ({ ...current, ...next }), {
    debouncedSearch: '',
    payoutMethodPage: 1,
    withdrawalPage: 1,
  })
  const { debouncedSearch, payoutMethodPage, withdrawalPage } = queryState
  const [payoutMethodsHasMore, setPayoutMethodsHasMore] = useState(false)
  const [payoutMethodsTotalCount, setPayoutMethodsTotalCount] = useState<number | null>(null)
  const [withdrawalsHasMore, setWithdrawalsHasMore] = useState(false)
  const [withdrawalsTotalCount, setWithdrawalsTotalCount] = useState<number | null>(null)
  const [payoutMethods, setPayoutMethods] = useState<AdminViewPayoutMethodSummary[]>([])
  const [withdrawalRequests, setWithdrawalRequests] = useState<AdminViewWithdrawalRequestSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [detailReadError, setDetailReadError] = useState<string | null>(null)
  const [detailReadFailed, setDetailReadFailed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedPayoutMethod, setSelectedPayoutMethod] = useState<AdminViewPayoutMethodDetailResponse | null>(null)
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<AdminViewWithdrawalRequestDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [methodDecision, setMethodDecision] = useState<'verify' | 'reject'>('verify')
  const [methodReason, setMethodReason] = useState('')
  const [resolution, setResolution] = useState<WithdrawalResolution>('paid')
  const [resolutionReason, setResolutionReason] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [assignmentReason, setAssignmentReason] = useState('')
  const [search, setSearch] = useState('')
  const [sensitiveReason, setSensitiveReason] = useState('')
  const [sensitiveData, setSensitiveData] = useState<AdminViewSensitivePayoutAccessResponse | null>(null)
  const [confirmingResolution, setConfirmingResolution] = useState(false)
  const payoutCursors = useRef<Record<number, string | undefined>>({ 1: undefined })
  const withdrawalCursors = useRef<Record<number, string | undefined>>({ 1: undefined })
  const loadedTabs = useMemo(() => new Set<PayoutPanelTab>(), [])
  const backgroundLoads = useMemo(() => new Set<PayoutPanelTab>(), [])
  const loadRequestIds = useMemo<Partial<Record<PayoutPanelTab, number>>>(() => ({}), [])
  const activeTabRef = useRef(activeTab)
  const detailTarget = useRef<{ kind: 'method'; id: string } | { kind: 'withdrawal'; id: string } | null>(null)
  const detailRequest = useRef<object | null>(null)
  const setPayoutMethodPage = useCallback((page: number) => patchQueryState({ payoutMethodPage: page }), [])
  const setWithdrawalPage = useCallback((page: number) => patchQueryState({ withdrawalPage: page }), [])

  useEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    const timeout = setTimeout(() => {
      payoutCursors.current = { 1: undefined }
      withdrawalCursors.current = { 1: undefined }
      patchQueryState({ debouncedSearch: search.trim(), payoutMethodPage: 1, withdrawalPage: 1 })
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  const canProcess = actor?.capabilities.includes('payouts.process') ?? false

  const loadData = useCallback(async ({ blocking }: { blocking?: boolean } = {}) => {
    const requestedTab = activeTab
    const shouldBlock = blocking ?? !loadedTabs.has(requestedTab)
    if (!shouldBlock && backgroundLoads.has(requestedTab)) return
    if (!shouldBlock) backgroundLoads.add(requestedTab)
    const requestId = (loadRequestIds[requestedTab] ?? 0) + 1
    loadRequestIds[requestedTab] = requestId
    if (shouldBlock) setLoading(true)
    try {
      if (requestedTab === 'accounts') {
        const result = await adminControlService.listPayoutMethods({
          status: methodFilter,
          limit: PAYOUTS_PER_PAGE,
          cursor: payoutCursors.current[payoutMethodPage],
          query: debouncedSearch || undefined,
        })
        if (requestId === loadRequestIds[requestedTab] && activeTabRef.current === requestedTab) {
          if (result.success) {
            setPayoutMethods(result.data.payout_methods)
            setPayoutMethodsHasMore(result.data.has_more)
            setPayoutMethodsTotalCount(result.data.total_count)
            payoutCursors.current[payoutMethodPage + 1] = result.data.next_cursor ?? undefined
            setReadError(null)
            setReadFailed(false)
          } else {
            setReadError(copy.loadError)
            setReadFailed(true)
          }
        }
      } else {
        const result = await adminControlService.listWithdrawalRequests({
          assignment: withdrawalAssignment,
          status: withdrawalFilter,
          limit: PAYOUTS_PER_PAGE,
          cursor: withdrawalCursors.current[withdrawalPage],
          query: debouncedSearch || undefined,
        })
        if (requestId === loadRequestIds[requestedTab] && activeTabRef.current === requestedTab) {
          if (result.success) {
            setWithdrawalRequests(result.data.withdrawal_requests)
            setWithdrawalsHasMore(result.data.has_more)
            setWithdrawalsTotalCount(result.data.total_count)
            withdrawalCursors.current[withdrawalPage + 1] = result.data.next_cursor ?? undefined
            setReadError(null)
            setReadFailed(false)
          } else {
            setReadError(copy.loadError)
            setReadFailed(true)
          }
        }
      }
    } catch {
      if (requestId === loadRequestIds[requestedTab] && activeTabRef.current === requestedTab) {
        setReadError(copy.loadError)
        setReadFailed(true)
      }
    } finally {
      if (requestId === loadRequestIds[requestedTab]) {
        loadedTabs.add(requestedTab)
        backgroundLoads.delete(requestedTab)
        if (activeTabRef.current === requestedTab) setLoading(false)
      }
    }
  }, [activeTab, backgroundLoads, copy.loadError, debouncedSearch, loadRequestIds, loadedTabs, methodFilter, payoutMethodPage, withdrawalAssignment, withdrawalFilter, withdrawalPage])

  const loadSelectedDetail = useCallback(async () => {
    const target = detailTarget.current
    if (!target) return
    const request = {}
    detailRequest.current = request
    setDetailLoading(true)
    try {
      if (target.kind === 'method') {
        // The post-read identity guard prevents an old detail from replacing a newer selection.
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const result = await adminControlService.getPayoutMethod(target.id)
        if (detailRequest.current !== request || detailTarget.current?.id !== target.id) return
        if (result.success && result.data.payout_method.id === target.id) {
          setSelectedPayoutMethod(result.data)
          setDetailReadError(null)
          setDetailReadFailed(false)
        } else {
          setDetailReadError(copy.loadError)
          setDetailReadFailed(true)
        }
      } else {
        // The post-read identity guard prevents an old detail from replacing a newer selection.
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const result = await adminControlService.getWithdrawalRequest(target.id)
        if (detailRequest.current !== request || detailTarget.current?.id !== target.id) return
        if (result.success && result.data.withdrawal_request.id === target.id) {
          setSelectedWithdrawal(result.data)
          setDetailReadError(null)
          setDetailReadFailed(false)
        } else {
          setDetailReadError(copy.loadError)
          setDetailReadFailed(true)
        }
      }
    } catch {
      if (detailRequest.current === request && detailTarget.current?.id === target.id) {
        setDetailReadError(copy.loadError)
        setDetailReadFailed(true)
      }
    } finally {
      if (detailRequest.current === request) setDetailLoading(false)
    }
  }, [copy.loadError])

  const refreshPayoutPanel = useCallback(async () => {
    setSensitiveData(null)
    await Promise.all([loadData({ blocking: false }), loadSelectedDetail()])
  }, [loadData, loadSelectedDetail])

  useAdminSectionAutoRefresh('finance', refreshPayoutPanel, readFailed || detailReadFailed, refreshPayoutPanel)

  const closeDetail = useCallback(() => {
    detailTarget.current = null
    detailRequest.current = null
    setSelectedPayoutMethod(null)
    setSelectedWithdrawal(null)
    setSensitiveData(null)
    setSensitiveReason('')
    setDetailReadError(null)
    setDetailReadFailed(false)
    setDetailLoading(false)
  }, [])

  useEffect(() => {
    const tabAtStart = activeTab
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void loadData()
    })
    return () => {
      cancelled = true
      loadRequestIds[tabAtStart] = (loadRequestIds[tabAtStart] ?? 0) + 1
      backgroundLoads.delete(tabAtStart)
    }
  }, [activeTab, backgroundLoads, debouncedSearch, loadData, loadRequestIds, methodFilter, payoutMethodPage, withdrawalAssignment, withdrawalFilter, withdrawalPage])

  const formatCurrency = useCallback((value: number) => new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    currency: 'VND',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value), [language])

  const formatDate = useCallback((value: string | null) => {
    if (!value) return '—'
    try {
      return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    } catch {
      return value
    }
  }, [language])

  const openPayoutMethod = useCallback(async (method: AdminViewPayoutMethodSummary) => {
    detailTarget.current = { kind: 'method', id: method.id }
    setSelectedPayoutMethod(null)
    setSelectedWithdrawal(null)
    setError(null)
    setMethodDecision(method.status === 'pending_verification' ? 'verify' : 'reject')
    setMethodReason('')
    setSensitiveReason('')
    setSensitiveData(null)
    void loadSelectedDetail()
  }, [loadSelectedDetail])

  const openWithdrawal = useCallback(async (request: AdminViewWithdrawalRequestSummary) => {
    detailTarget.current = { kind: 'withdrawal', id: request.id }
    setSelectedPayoutMethod(null)
    setSelectedWithdrawal(null)
    setError(null)
    setResolution('paid')
    setResolutionReason('')
    setTransferReference('')
    setAssignmentReason('')
    setConfirmingResolution(false)
    setSensitiveReason('')
    setSensitiveData(null)
    void loadSelectedDetail()
  }, [loadSelectedDetail])

  const submitPayoutMethodDecision = useCallback(async () => {
    const payoutMethod = selectedPayoutMethod?.payout_method
    if (!payoutMethod) return
    if (methodDecision === 'reject' && !methodReason.trim()) {
      setError(copy.reasonRequired)
      return
    }
    setActionPending(`method:${payoutMethod.id}`)
    setError(null)
    const result = await adminControlService.decidePayoutMethod(payoutMethod.id, {
      decision: methodDecision,
      expected_version: payoutMethod.version,
      client_request_id: generateClientRequestId(),
      ...(methodDecision === 'reject' ? { reason: methodReason.trim() } : {}),
    })
    if (result.success) {
      closeDetail()
      setNotice(copy.noticeAccount)
      await loadData()
    } else {
      setError(copy.actionError)
    }
    setActionPending(null)
  }, [closeDetail, copy.actionError, copy.noticeAccount, copy.reasonRequired, loadData, methodDecision, methodReason, selectedPayoutMethod])

  const claimWithdrawal = useCallback(async () => {
    const withdrawal = selectedWithdrawal?.withdrawal_request
    if (!withdrawal) return
    const takeover = withdrawal.status === 'processing' && !withdrawal.processing_by_me
    if (takeover && (actor?.access_level !== 'owner' || assignmentReason.trim().length < 3)) {
      setError(copy.reasonRequired)
      return
    }
    setActionPending(`claim:${withdrawal.id}`)
    setError(null)
    const result = await adminControlService.claimWithdrawalRequest(withdrawal.id, {
      expected_version: withdrawal.version,
      client_request_id: generateClientRequestId(),
      ...(takeover ? { takeover_reason: assignmentReason.trim() } : {}),
    })
    if (result.success) {
      await loadSelectedDetail()
      await loadData()
    } else {
      setError(copy.actionError)
    }
    setActionPending(null)
  }, [actor?.access_level, assignmentReason, copy.actionError, copy.reasonRequired, loadData, loadSelectedDetail, selectedWithdrawal])

  const releaseWithdrawal = useCallback(async () => {
    const withdrawal = selectedWithdrawal?.withdrawal_request
    if (!withdrawal || withdrawal.status !== 'processing' || (!withdrawal.processing_by_me && actor?.access_level !== 'owner')) return
    if (assignmentReason.trim().length < 3) {
      setError(copy.reasonRequired)
      return
    }
    setActionPending(`release:${withdrawal.id}`)
    setError(null)
    const result = await adminControlService.releaseWithdrawalRequest(withdrawal.id, {
      client_request_id: generateClientRequestId(),
      expected_version: withdrawal.version,
      reason: assignmentReason.trim(),
    })
    if (result.success) {
      closeDetail()
      setNotice(copy.noticeWithdrawal)
      await loadData()
    } else {
      setError(copy.actionError)
    }
    setActionPending(null)
  }, [actor?.access_level, assignmentReason, closeDetail, copy.actionError, copy.noticeWithdrawal, copy.reasonRequired, loadData, selectedWithdrawal])

  const resolveWithdrawal = useCallback(async () => {
    const withdrawal = selectedWithdrawal?.withdrawal_request
    if (!withdrawal) return
    if (resolution === 'paid' && !transferReference.trim()) {
      setError(copy.referenceRequired)
      return
    }
    if (resolution !== 'paid' && !resolutionReason.trim()) {
      setError(copy.reasonRequired)
      return
    }
    if (!confirmingResolution) {
      setConfirmingResolution(true)
      return
    }
    setActionPending(`resolve:${withdrawal.id}`)
    setError(null)
    const result = await adminControlService.resolveWithdrawalRequest(withdrawal.id, {
      decision: resolution,
      expected_version: withdrawal.version,
      client_request_id: generateClientRequestId(),
      ...(resolution === 'paid' ? {
        transfer_reference: transferReference.trim(),
        external_transfer_confirmed: true as const,
      } : { reason: resolutionReason.trim() }),
    })
    if (result.success) {
      closeDetail()
      setNotice(copy.noticeWithdrawal)
      await loadData()
    } else {
      setError(copy.actionError)
    }
    setActionPending(null)
  }, [closeDetail, confirmingResolution, copy.actionError, copy.noticeWithdrawal, copy.reasonRequired, copy.referenceRequired, loadData, resolution, resolutionReason, selectedWithdrawal, transferReference])

  const revealSensitiveData = useCallback(async () => {
    if (!sensitiveReason.trim()) {
      setError(copy.revealReasonRequired)
      return
    }
    const id = selectedPayoutMethod?.payout_method.id ?? selectedWithdrawal?.withdrawal_request.id
    if (!id) return
    setActionPending(`sensitive:${id}`)
    setError(null)
    const result = selectedPayoutMethod
      ? await adminControlService.accessPayoutMethodSensitive(id, { reason: sensitiveReason.trim() })
      : await adminControlService.accessWithdrawalSensitive(id, { reason: sensitiveReason.trim() })
    if (result.success) setSensitiveData(result.data)
    else setError(copy.actionError)
    setActionPending(null)
  }, [copy.actionError, copy.revealReasonRequired, selectedPayoutMethod, selectedWithdrawal, sensitiveReason])

  const activeItems = useMemo(() => activeTab === 'accounts' ? payoutMethods : withdrawalRequests, [activeTab, payoutMethods, withdrawalRequests])
  const paginationLabels = useMemo(() => ({
    more: language === 'vi' ? 'Còn trang tiếp theo' : 'More pages available',
    next: language === 'vi' ? 'Trang sau' : 'Next page',
    page: (page: number) => language === 'vi' ? `Trang ${page}` : `Page ${page}`,
    previous: language === 'vi' ? 'Trang trước' : 'Previous page',
  }), [language])

  return {
    activeItems,
    activeTab,
    actionPending,
    actor,
    assignmentReason,
    canProcess,
    claimWithdrawal,
    confirmingResolution,
    copy,
    detailLoading,
    detailReadError,
    error,
    formatCurrency,
    formatDate,
    language,
    closeDetail,
    loading,
    methodDecision,
    methodFilter,
    methodReason,
    notice,
    openPayoutMethod,
    openWithdrawal,
    paginationLabels,
    payoutCursors,
    payoutMethodPage,
    payoutMethods,
    payoutMethodsHasMore,
    payoutMethodsTotalCount,
    releaseWithdrawal,
    readError,
    resolution,
    resolutionReason,
    resolveWithdrawal,
    revealSensitiveData,
    search,
    selectedPayoutMethod,
    selectedWithdrawal,
    sensitiveData,
    sensitiveReason,
    setActiveTab,
    setAssignmentReason,
    setConfirmingResolution,
    setError,
    setMethodDecision,
    setMethodFilter,
    setMethodReason,
    setNotice,
    setPayoutMethodPage,
    setResolution,
    setResolutionReason,
    setSearch,
    setSelectedPayoutMethod,
    setSelectedWithdrawal,
    setSensitiveData,
    setSensitiveReason,
    setTransferReference,
    setWithdrawalAssignment,
    setWithdrawalFilter,
    setWithdrawalPage,
    submitPayoutMethodDecision,
    transferReference,
    withdrawalAssignment,
    withdrawalCursors,
    withdrawalFilter,
    withdrawalPage,
    withdrawalRequests,
    withdrawalsHasMore,
    withdrawalsTotalCount,
  }
}

export function AdminPayoutsPanel(props: AdminPayoutsPanelProps) {
  return <PayoutPanelBody controller={useAdminPayoutsController(props)} />
}

function PayoutPanelBody({ controller }: { controller: ReturnType<typeof useAdminPayoutsController> }) {
  const {
    activeItems, activeTab, actionPending, actor, assignmentReason, canProcess, claimWithdrawal,
    closeDetail, confirmingResolution, copy, detailLoading, detailReadError, error, formatCurrency, formatDate, language,
    loading, methodDecision, methodFilter, methodReason, notice, openPayoutMethod, readError,
    openWithdrawal, paginationLabels, payoutCursors, payoutMethodPage, payoutMethods,
    payoutMethodsHasMore, payoutMethodsTotalCount, releaseWithdrawal, resolution, resolutionReason,
    resolveWithdrawal, revealSensitiveData, search, selectedPayoutMethod, selectedWithdrawal,
    sensitiveData, sensitiveReason, setActiveTab, setAssignmentReason, setConfirmingResolution,
    setMethodDecision, setMethodFilter, setMethodReason, setNotice, setPayoutMethodPage,
    setResolution, setResolutionReason, setSearch, setSensitiveReason, setTransferReference, setWithdrawalAssignment,
    setWithdrawalFilter, setWithdrawalPage, submitPayoutMethodDecision, transferReference,
    withdrawalAssignment, withdrawalCursors, withdrawalFilter, withdrawalPage, withdrawalRequests,
    withdrawalsHasMore, withdrawalsTotalCount,
  } = controller

  return <View style={styles.stack} testID="admin-payout-panel">
    <AdminTabNavigation
      items={[
        { key: 'accounts', label: copy.accounts, onPress: () => { closeDetail(); setActiveTab('accounts') }, selected: activeTab === 'accounts', testID: 'admin-payout-accounts-tab' },
        { key: 'withdrawals', label: copy.withdrawals, onPress: () => { closeDetail(); setActiveTab('withdrawals') }, selected: activeTab === 'withdrawals', testID: 'admin-payout-withdrawals-tab' },
      ]}
      testID="admin-payout-navigation"
    />

    {notice ? <View style={styles.notice}><AdminText textRole="subheadline" style={styles.noticeText}>{notice}</AdminText><Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={() => setNotice(null)}><AdminText textRole="subheadline" style={styles.noticeClose}>×</AdminText></Pressable></View> : null}
    {error ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{error}</AdminText></View> : null}
    {readError ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{readError}</AdminText></View> : null}
    {detailReadError ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{detailReadError}</AdminText></View> : null}

    {selectedPayoutMethod ? <PayoutMethodDetail
      canProcess={canProcess}
      copy={copy}
      decision={methodDecision}
      formatDate={formatDate}
      onBack={closeDetail}
      onChangeDecision={setMethodDecision}
      onChangeReason={setMethodReason}
      onChangeSensitiveReason={setSensitiveReason}
      onReveal={() => { void revealSensitiveData() }}
      onSubmit={() => { void submitPayoutMethodDecision() }}
      pending={Boolean(actionPending)}
      reason={methodReason}
      response={selectedPayoutMethod}
      sensitiveData={sensitiveData}
      sensitiveReason={sensitiveReason}
    /> : selectedWithdrawal ? <WithdrawalDetail
      assignmentReason={assignmentReason}
      canProcess={canProcess}
      canTakeover={canProcess && actor?.access_level === 'owner'}
      confirming={confirmingResolution}
      copy={copy}
      formatCurrency={formatCurrency}
      formatDate={formatDate}
      onBack={closeDetail}
      onChangeAssignmentReason={setAssignmentReason}
      onChangeReason={(value) => { setResolutionReason(value); setConfirmingResolution(false) }}
      onChangeResolution={(value) => { setResolution(value); setConfirmingResolution(false) }}
      onChangeSensitiveReason={setSensitiveReason}
      onChangeTransferReference={(value) => { setTransferReference(value); setConfirmingResolution(false) }}
      onClaim={() => { void claimWithdrawal() }}
      onRelease={() => { void releaseWithdrawal() }}
      onReveal={() => { void revealSensitiveData() }}
      onResolve={() => { void resolveWithdrawal() }}
      pending={Boolean(actionPending)}
      reason={resolutionReason}
      resolution={resolution}
      response={selectedWithdrawal}
      sensitiveData={sensitiveData}
      sensitiveReason={sensitiveReason}
      transferReference={transferReference}
    /> : <>
      <KaelTextField
        accessibilityLabel={language === 'vi' ? 'Tìm theo tên thợ hoặc tài khoản đã che' : 'Search by worker or masked account'}
        inputShellStyle={styles.searchInput}
        onChangeText={setSearch}
        placeholder={language === 'vi' ? 'Tìm theo tên thợ hoặc tài khoản đã che' : 'Search worker or masked account'}
        placeholderTextColor={color.text.muted}
        style={styles.searchText}
        value={search}
      />
      <View style={styles.toolbar}>
        <View style={styles.filterRow}>
          {activeTab === 'accounts' ? <>
            <FinanceChoiceChip accessibilityLabel={copy.needReview} label={copy.needReview} onPress={() => { payoutCursors.current = { 1: undefined }; setMethodFilter('pending_verification'); setPayoutMethodPage(1) }} selected={methodFilter === 'pending_verification'} />
            <FinanceChoiceChip accessibilityLabel={language === 'vi' ? 'Tất cả' : 'All'} label={language === 'vi' ? 'Tất cả' : 'All'} onPress={() => { payoutCursors.current = { 1: undefined }; setMethodFilter('all'); setPayoutMethodPage(1) }} selected={methodFilter === 'all'} />
          </> : <>
            <FinanceChoiceChip accessibilityLabel={copy.pending} label={copy.pending} onPress={() => { withdrawalCursors.current = { 1: undefined }; setWithdrawalFilter('pending'); setWithdrawalPage(1) }} selected={withdrawalFilter === 'pending'} />
            <FinanceChoiceChip accessibilityLabel={copy.processing} label={copy.processing} onPress={() => { withdrawalCursors.current = { 1: undefined }; setWithdrawalFilter('processing'); setWithdrawalPage(1) }} selected={withdrawalFilter === 'processing'} />
            <FinanceChoiceChip accessibilityLabel={language === 'vi' ? 'Tất cả' : 'All'} label={language === 'vi' ? 'Tất cả' : 'All'} onPress={() => { withdrawalCursors.current = { 1: undefined }; setWithdrawalFilter('all'); setWithdrawalPage(1) }} selected={withdrawalFilter === 'all'} />
          </>}
        </View>
      </View>
      {activeTab === 'withdrawals' ? <View style={styles.filterRow}>
        {([
          ['all', copy.allAssignees],
          ['unassigned', copy.unassigned],
          ['mine', copy.assignedMine],
        ] as const).map(([value, label]) => <FinanceChoiceChip
          key={value}
          label={label}
          onPress={() => { withdrawalCursors.current = { 1: undefined }; setWithdrawalAssignment(value); setWithdrawalPage(1) }}
          selected={withdrawalAssignment === value}
        />)}
      </View> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><AdminText textRole="subheadline" style={styles.loadingText}>{copy.loading}</AdminText></View> : activeItems.length === 0 ? <EmptyPayoutState body={activeTab === 'accounts' ? copy.accountsEmpty : copy.withdrawalsEmpty} /> : activeTab === 'accounts' ? <>
      {payoutMethods.map((method) => <PayoutMethodCard
        copy={copy}
        key={method.id}
        method={method}
        onOpen={() => { void openPayoutMethod(method) }}
      />)}
      <AdminPagination
        hasMore={payoutMethodsHasMore}
        labels={paginationLabels}
        loading={loading}
        onPageChange={setPayoutMethodPage}
        page={payoutMethodPage}
        pageTestIDPrefix="admin-payout-method-page"
        pageSize={PAYOUTS_PER_PAGE}
        testID="admin-payout-method-pagination"
        totalCount={payoutMethodsTotalCount}
      />
    </> : <>
      {withdrawalRequests.map((request) => <WithdrawalRequestCard
        copy={copy}
        formatCurrency={formatCurrency}
        key={request.id}
        onOpen={() => { void openWithdrawal(request) }}
        request={request}
      />)}
      <AdminPagination
        hasMore={withdrawalsHasMore}
        labels={paginationLabels}
        loading={loading}
        onPageChange={setWithdrawalPage}
        page={withdrawalPage}
        pageTestIDPrefix="admin-withdrawal-page"
        pageSize={PAYOUTS_PER_PAGE}
        testID="admin-withdrawal-pagination"
        totalCount={withdrawalsTotalCount}
      />
    </>}
      {detailLoading ? <View style={styles.detailLoading}><ActivityIndicator color={color.brand.primary} /></View> : null}
    </>}
  </View>
}
