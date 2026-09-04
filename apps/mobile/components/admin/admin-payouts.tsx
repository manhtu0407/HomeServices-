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
import { generateClientRequestId } from '@/lib/client-request-id'
import { adminControlService } from '@/lib/services'
import { FinanceChoiceChip, FinanceSecondaryButton } from './admin-finance-controls'
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

export type PanelCopy = {
  accounts: string
  accountsEmpty: string
  accountStatus: Record<AdminViewPayoutMethodStatus, string>
  amount: string
  availableBalance: string
  bankAccount: string
  bankName: string
  back: string
  cancel: string
  close: string
  confirmPaid: string
  confirmStatus: string
  failed: string
  holder: string
  manualTransferHint: string
  methodDecision: string
  needReview: string
  noProcessCapability: string
  noticeAccount: string
  noticeWithdrawal: string
  openDetail: string
  paid: string
  pending: string
  processing: string
  processingBy: string
  reason: string
  reasonRequired: string
  reference: string
  referenceRequired: string
  reveal: string
  revealReason: string
  revealReasonRequired: string
  rejected: string
  requestedAt: string
  reviewAccount: string
  reviewReason: string
  save: string
  status: string
  transferReference: string
  transferReview: string
  transferReviewHint: string
  verify: string
  withdrawalDetail: string
  withdrawalStatus: Record<AdminViewWithdrawalRequestStatus, string>
  withdrawals: string
  withdrawalsEmpty: string
  withdrawer: string
  claim: string
  reload: string
  loadError: string
  actionError: string
  allAssignees: string
  assignedMine: string
  unassigned: string
  assignmentReason: string
  release: string
  takeover: string
}

const copyByLanguage: Record<'vi' | 'en', PanelCopy> = {
  vi: {
    accounts: 'Tài khoản nhận tiền',
    accountsEmpty: 'Chưa có tài khoản nhận tiền nào cần hiển thị.',
    accountStatus: {
      pending_verification: 'Chờ xác minh',
      verified: 'Đã xác minh',
      rejected: 'Không được chấp nhận',
    },
    amount: 'Số tiền rút',
    availableBalance: 'Số dư khi gửi yêu cầu',
    bankAccount: 'Số tài khoản',
    bankName: 'Ngân hàng',
    back: 'Quay lại danh sách',
    cancel: 'Hủy',
    close: 'Đóng',
    confirmPaid: 'Xác nhận đã chuyển',
    confirmStatus: 'Xác nhận trạng thái',
    failed: 'Chuyển tiền lỗi',
    holder: 'Chủ tài khoản',
    manualTransferHint: 'Chuyển tiền thủ công bên ngoài ứng dụng. Chỉ xác nhận sau khi đã đối chiếu tài khoản và hoàn tất chuyển khoản.',
    methodDecision: 'Quyết định xác minh',
    needReview: 'Cần xử lý',
    noProcessCapability: 'Tài khoản này chỉ có quyền xem. Chỉ quản trị viên có quyền xử lý chi trả mới mở được thông tin để chuyển tiền.',
    noticeAccount: 'Đã lưu quyết định xác minh tài khoản nhận tiền.',
    noticeWithdrawal: 'Đã lưu kết quả xử lý yêu cầu rút tiền.',
    openDetail: 'Mở để xử lý',
    paid: 'Đã chuyển tiền',
    pending: 'Chờ xử lý',
    processing: 'Đang xử lý',
    processingBy: 'Người đang xử lý',
    reason: 'Lý do',
    reasonRequired: 'Nhập lý do trước khi xác nhận.',
    reference: 'Mã giao dịch ngân hàng',
    referenceRequired: 'Nhập mã giao dịch ngân hàng trước khi xác nhận đã chuyển.',
    reveal: 'Mở thông tin tài khoản',
    revealReason: 'Lý do cần xem thông tin tài khoản',
    revealReasonRequired: 'Nhập lý do nghiệp vụ trước khi mở thông tin tài khoản.',
    rejected: 'Từ chối',
    requestedAt: 'Gửi lúc',
    reviewAccount: 'Xác minh tài khoản nhận tiền',
    reviewReason: 'Lý do từ chối (bắt buộc khi từ chối)',
    save: 'Lưu',
    status: 'Trạng thái',
    transferReference: 'Mã chuyển khoản',
    transferReview: 'Rà soát kết quả',
    transferReviewHint: 'Xác nhận bạn đã chuyển tiền bên ngoài NestScout và đã đối chiếu đúng tài khoản cùng mã giao dịch.',
    verify: 'Xác minh',
    withdrawalDetail: 'Xử lý yêu cầu rút tiền',
    withdrawalStatus: {
      pending: 'Chờ xử lý',
      processing: 'Đang xử lý',
      paid: 'Đã chi trả',
      rejected: 'Đã từ chối',
      failed: 'Chuyển tiền lỗi',
    },
    withdrawals: 'Yêu cầu rút tiền',
    withdrawalsEmpty: 'Chưa có yêu cầu rút tiền nào cần hiển thị.',
    withdrawer: 'Thợ yêu cầu',
    claim: 'Nhận xử lý',
    reload: 'Tải lại',
    loadError: 'Không thể tải dữ liệu chi trả. Hãy thử lại.',
    actionError: 'Không thể lưu thay đổi. Dữ liệu chưa được cập nhật.',
    allAssignees: 'Mọi người xử lý',
    assignedMine: 'Tôi đang xử lý',
    unassigned: 'Chưa có người nhận',
    assignmentReason: 'Lý do nhận thay hoặc bỏ nhận',
    release: 'Bỏ nhận',
    takeover: 'Nhận thay',
  },
  en: {
    accounts: 'Payout accounts',
    accountsEmpty: 'There are no payout accounts to show.',
    accountStatus: {
      pending_verification: 'Pending verification',
      verified: 'Verified',
      rejected: 'Rejected',
    },
    amount: 'Withdrawal amount',
    availableBalance: 'Balance at request time',
    bankAccount: 'Account number',
    bankName: 'Bank',
    back: 'Back to list',
    cancel: 'Cancel',
    close: 'Close',
    confirmPaid: 'Confirm transfer',
    confirmStatus: 'Confirm status',
    failed: 'Transfer failed',
    holder: 'Account holder',
    manualTransferHint: 'Make the transfer outside the app. Confirm only after checking the account and completing the transfer.',
    methodDecision: 'Verification decision',
    needReview: 'Needs action',
    noProcessCapability: 'This account can view only. Only an administrator with payout processing access can open transfer details.',
    noticeAccount: 'The payout-account verification decision was saved.',
    noticeWithdrawal: 'The withdrawal processing result was saved.',
    openDetail: 'Open to process',
    paid: 'Transfer completed',
    pending: 'Pending',
    processing: 'Processing',
    processingBy: 'Processed by',
    reason: 'Reason',
    reasonRequired: 'Enter a reason before confirming.',
    reference: 'Bank transfer reference',
    referenceRequired: 'Enter the bank transfer reference before confirming the transfer.',
    reveal: 'Open account details',
    revealReason: 'Business reason for accessing account details',
    revealReasonRequired: 'Enter a business reason before opening account details.',
    rejected: 'Reject',
    requestedAt: 'Requested at',
    reviewAccount: 'Verify payout account',
    reviewReason: 'Rejection reason (required when rejecting)',
    save: 'Save',
    status: 'Status',
    transferReference: 'Transfer reference',
    transferReview: 'Review result',
    transferReviewHint: 'Confirm that you transferred funds outside NestScout and verified the destination account and transfer reference.',
    verify: 'Verify',
    withdrawalDetail: 'Process withdrawal request',
    withdrawalStatus: {
      pending: 'Pending',
      processing: 'Processing',
      paid: 'Paid',
      rejected: 'Rejected',
      failed: 'Transfer failed',
    },
    withdrawals: 'Withdrawal requests',
    withdrawalsEmpty: 'There are no withdrawal requests to show.',
    withdrawer: 'Worker',
    claim: 'Claim processing',
    reload: 'Reload',
    loadError: 'Unable to load payout data. Please try again.',
    actionError: 'Unable to save the change. The data was not updated.',
    allAssignees: 'All assignees',
    assignedMine: 'Assigned to me',
    unassigned: 'Unassigned',
    assignmentReason: 'Reason for takeover or release',
    release: 'Release',
    takeover: 'Take over',
  },
}

function useAdminPayoutsController({ actor, initialTab = 'accounts' }: AdminPayoutsPanelProps) {
  const language = useAppLanguage()
  const copy = copyByLanguage[language]
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
    setError(null)
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
          } else setError(copy.loadError)
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
          } else setError(copy.loadError)
        }
      }
    } finally {
      if (requestId === loadRequestIds[requestedTab]) {
        loadedTabs.add(requestedTab)
        backgroundLoads.delete(requestedTab)
        if (activeTabRef.current === requestedTab) setLoading(false)
      }
    }
  }, [activeTab, backgroundLoads, copy.loadError, debouncedSearch, loadRequestIds, loadedTabs, methodFilter, payoutMethodPage, withdrawalAssignment, withdrawalFilter, withdrawalPage])

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
    setDetailLoading(true)
    setError(null)
    const result = await adminControlService.getPayoutMethod(method.id)
    if (result.success) {
      setMethodDecision(method.status === 'pending_verification' ? 'verify' : 'reject')
      setMethodReason('')
      setSensitiveReason('')
      setSensitiveData(null)
      setSelectedPayoutMethod(result.data)
    } else {
      setError(copy.actionError)
    }
    setDetailLoading(false)
  }, [copy.actionError])

  const openWithdrawal = useCallback(async (request: AdminViewWithdrawalRequestSummary) => {
    setDetailLoading(true)
    setError(null)
    const result = await adminControlService.getWithdrawalRequest(request.id)
    if (result.success) {
      setResolution('paid')
      setResolutionReason('')
      setTransferReference('')
      setAssignmentReason('')
      setConfirmingResolution(false)
      setSensitiveReason('')
      setSensitiveData(null)
      setSelectedWithdrawal(result.data)
    } else {
      setError(copy.actionError)
    }
    setDetailLoading(false)
  }, [copy.actionError])

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
      setSelectedPayoutMethod(null)
      setNotice(copy.noticeAccount)
      await loadData()
    } else {
      setError(copy.actionError)
    }
    setActionPending(null)
  }, [copy.actionError, copy.noticeAccount, copy.reasonRequired, loadData, methodDecision, methodReason, selectedPayoutMethod])

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
      const detail = await adminControlService.getWithdrawalRequest(withdrawal.id)
      if (detail.success) setSelectedWithdrawal(detail.data)
      await loadData()
    } else {
      setError(copy.actionError)
    }
    setActionPending(null)
  }, [actor?.access_level, assignmentReason, copy.actionError, copy.reasonRequired, loadData, selectedWithdrawal])

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
      setSelectedWithdrawal(null)
      setNotice(copy.noticeWithdrawal)
      await loadData()
    } else {
      setError(copy.actionError)
    }
    setActionPending(null)
  }, [actor?.access_level, assignmentReason, copy.actionError, copy.noticeWithdrawal, copy.reasonRequired, loadData, selectedWithdrawal])

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
      setSelectedWithdrawal(null)
      setNotice(copy.noticeWithdrawal)
      await loadData()
    } else {
      setError(copy.actionError)
    }
    setActionPending(null)
  }, [confirmingResolution, copy.actionError, copy.noticeWithdrawal, copy.reasonRequired, copy.referenceRequired, loadData, resolution, resolutionReason, selectedWithdrawal, transferReference])

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
    error,
    formatCurrency,
    formatDate,
    language,
    loadData,
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
    confirmingResolution, copy, detailLoading, error, formatCurrency, formatDate, language,
    loadData, loading, methodDecision, methodFilter, methodReason, notice, openPayoutMethod,
    openWithdrawal, paginationLabels, payoutCursors, payoutMethodPage, payoutMethods,
    payoutMethodsHasMore, payoutMethodsTotalCount, releaseWithdrawal, resolution, resolutionReason,
    resolveWithdrawal, revealSensitiveData, search, selectedPayoutMethod, selectedWithdrawal,
    sensitiveData, sensitiveReason, setActiveTab, setAssignmentReason, setConfirmingResolution,
    setError, setMethodDecision, setMethodFilter, setMethodReason, setNotice, setPayoutMethodPage,
    setResolution, setResolutionReason, setSearch, setSelectedPayoutMethod, setSelectedWithdrawal,
    setSensitiveData, setSensitiveReason, setTransferReference, setWithdrawalAssignment,
    setWithdrawalFilter, setWithdrawalPage, submitPayoutMethodDecision, transferReference,
    withdrawalAssignment, withdrawalCursors, withdrawalFilter, withdrawalPage, withdrawalRequests,
    withdrawalsHasMore, withdrawalsTotalCount,
  } = controller

  return <View style={styles.stack} testID="admin-payout-panel">
    <AdminTabNavigation
      items={[
        { key: 'accounts', label: copy.accounts, onPress: () => { setActiveTab('accounts'); setSelectedWithdrawal(null); setSensitiveData(null) }, selected: activeTab === 'accounts', testID: 'admin-payout-accounts-tab' },
        { key: 'withdrawals', label: copy.withdrawals, onPress: () => { setActiveTab('withdrawals'); setSelectedPayoutMethod(null); setSensitiveData(null) }, selected: activeTab === 'withdrawals', testID: 'admin-payout-withdrawals-tab' },
      ]}
      testID="admin-payout-navigation"
    />

    {notice ? <View style={styles.notice}><AdminText textRole="subheadline" style={styles.noticeText}>{notice}</AdminText><Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={() => setNotice(null)}><AdminText textRole="subheadline" style={styles.noticeClose}>×</AdminText></Pressable></View> : null}
    {error ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{error}</AdminText><Pressable accessibilityRole="button" accessibilityLabel={copy.reload} onPress={() => { setError(null); void loadData() }}><AdminText textRole="subheadline" style={styles.errorAction}>{copy.reload}</AdminText></Pressable></View> : null}

    {selectedPayoutMethod ? <PayoutMethodDetail
      canProcess={canProcess}
      copy={copy}
      decision={methodDecision}
      formatDate={formatDate}
      onBack={() => { setSelectedPayoutMethod(null); setSensitiveData(null); setSensitiveReason('') }}
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
      onBack={() => { setSelectedWithdrawal(null); setSensitiveData(null); setSensitiveReason(''); setAssignmentReason(''); setConfirmingResolution(false) }}
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
        <FinanceSecondaryButton label={copy.reload} onPress={() => { void loadData() }} size="small" style={styles.reloadButton} />
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
      {loading ? <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><AdminText textRole="subheadline" style={styles.loadingText}>{copy.reload}</AdminText></View> : activeItems.length === 0 ? <EmptyPayoutState body={activeTab === 'accounts' ? copy.accountsEmpty : copy.withdrawalsEmpty} /> : activeTab === 'accounts' ? <>
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
