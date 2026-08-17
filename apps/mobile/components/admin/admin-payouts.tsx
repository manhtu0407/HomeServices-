import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { FormulaMintCardAura } from '@/components/ui/formula-mint-card'
import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, radius, shadow, spacing, typography } from '@/design/theme'
import type {
  AdminViewActor,
  AdminViewPayoutMethodDetailResponse,
  AdminViewPayoutMethodStatus,
  AdminViewPayoutMethodSummary,
  AdminViewWithdrawalRequestDetailResponse,
  AdminViewWithdrawalRequestStatus,
  AdminViewWithdrawalRequestSummary,
} from '@/lib/api-types/admin'
import { useAppLanguage } from '@/lib/app-language'
import { adminControlService } from '@/lib/services'
import { AdminTabNavigation } from './admin-tab-navigation'
import { AdminPagination } from './admin-pagination'

type PayoutPanelTab = 'accounts' | 'withdrawals'
type PayoutMethodFilter = 'pending_verification' | 'all'
type WithdrawalFilter = 'pending' | 'processing' | 'all'
type WithdrawalResolution = 'paid' | 'rejected' | 'failed'

const PAYOUTS_PER_PAGE = 8
const PAYOUT_AUTO_REFRESH_MS = 30_000

type PanelCopy = {
  accounts: string
  accountsEmpty: string
  accountStatus: Record<AdminViewPayoutMethodStatus, string>
  amount: string
  availableBalance: string
  bankAccount: string
  bankName: string
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
  rejected: string
  requestedAt: string
  reviewAccount: string
  reviewReason: string
  save: string
  status: string
  transferReference: string
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
    rejected: 'Từ chối',
    requestedAt: 'Gửi lúc',
    reviewAccount: 'Xác minh tài khoản nhận tiền',
    reviewReason: 'Lý do từ chối (bắt buộc khi từ chối)',
    save: 'Lưu',
    status: 'Trạng thái',
    transferReference: 'Mã chuyển khoản',
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
    rejected: 'Reject',
    requestedAt: 'Requested at',
    reviewAccount: 'Verify payout account',
    reviewReason: 'Rejection reason (required when rejecting)',
    save: 'Save',
    status: 'Status',
    transferReference: 'Transfer reference',
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
  },
}

export function AdminPayoutsPanel({ actor, initialTab = 'accounts', reduceMotion, reduceTransparency }: {
  actor: AdminViewActor | null
  initialTab?: PayoutPanelTab
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  const language = useAppLanguage()
  const copy = copyByLanguage[language]
  const [activeTab, setActiveTab] = useState<PayoutPanelTab>(initialTab)
  const [methodFilter, setMethodFilter] = useState<PayoutMethodFilter>('pending_verification')
  const [withdrawalFilter, setWithdrawalFilter] = useState<WithdrawalFilter>('pending')
  const [payoutMethodPage, setPayoutMethodPage] = useState(1)
  const [payoutMethodsHasMore, setPayoutMethodsHasMore] = useState(false)
  const [payoutMethodsTotalCount, setPayoutMethodsTotalCount] = useState<number | null>(null)
  const [withdrawalPage, setWithdrawalPage] = useState(1)
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
  const hasLoadedRef = useRef(false)
  const backgroundLoadInFlightRef = useRef(false)

  const canProcess = actor?.capabilities.includes('payouts.process') ?? false

  const loadData = useCallback(async ({ blocking }: { blocking?: boolean } = {}) => {
    const shouldBlock = blocking ?? !hasLoadedRef.current
    if (!shouldBlock && backgroundLoadInFlightRef.current) return
    if (!shouldBlock) backgroundLoadInFlightRef.current = true
    if (shouldBlock) setLoading(true)
    setError(null)
    try {
      const [methodsResult, withdrawalsResult] = await Promise.all([
        adminControlService.listPayoutMethods({ status: methodFilter, limit: PAYOUTS_PER_PAGE, offset: (payoutMethodPage - 1) * PAYOUTS_PER_PAGE }),
        adminControlService.listWithdrawalRequests({ status: withdrawalFilter, limit: PAYOUTS_PER_PAGE, offset: (withdrawalPage - 1) * PAYOUTS_PER_PAGE }),
      ])
      if (methodsResult.success) {
        setPayoutMethods(methodsResult.data.payout_methods)
        setPayoutMethodsHasMore(methodsResult.data.has_more)
        setPayoutMethodsTotalCount(methodsResult.data.total_count)
      }
      if (withdrawalsResult.success) {
        setWithdrawalRequests(withdrawalsResult.data.withdrawal_requests)
        setWithdrawalsHasMore(withdrawalsResult.data.has_more)
        setWithdrawalsTotalCount(withdrawalsResult.data.total_count)
      }
      if (!methodsResult.success || !withdrawalsResult.success) setError(copy.loadError)
    } finally {
      hasLoadedRef.current = true
      setLoading(false)
      if (!shouldBlock) backgroundLoadInFlightRef.current = false
    }
  }, [copy.loadError, methodFilter, payoutMethodPage, withdrawalFilter, withdrawalPage])

  useEffect(() => {
    const initialLoad = setTimeout(() => { void loadData({ blocking: true }) }, 0)
    return () => clearTimeout(initialLoad)
  }, [loadData])

  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => { void loadData({ blocking: false }) }, PAYOUT_AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [loadData]))

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
    if (!canProcess) {
      setNotice(copy.noProcessCapability)
      return
    }
    setDetailLoading(true)
    setError(null)
    const result = await adminControlService.getPayoutMethod(method.id)
    if (result.success) {
      setMethodDecision(method.status === 'pending_verification' ? 'verify' : 'reject')
      setMethodReason('')
      setSelectedPayoutMethod(result.data)
    } else {
      setError(copy.actionError)
    }
    setDetailLoading(false)
  }, [canProcess, copy.actionError, copy.noProcessCapability])

  const openWithdrawal = useCallback(async (request: AdminViewWithdrawalRequestSummary) => {
    if (!canProcess) {
      setNotice(copy.noProcessCapability)
      return
    }
    setDetailLoading(true)
    setError(null)
    const result = await adminControlService.getWithdrawalRequest(request.id)
    if (result.success) {
      setResolution('paid')
      setResolutionReason('')
      setTransferReference('')
      setSelectedWithdrawal(result.data)
    } else {
      setError(copy.actionError)
    }
    setDetailLoading(false)
  }, [canProcess, copy.actionError, copy.noProcessCapability])

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
    setActionPending(`claim:${withdrawal.id}`)
    setError(null)
    const result = await adminControlService.claimWithdrawalRequest(withdrawal.id)
    if (result.success) {
      const detail = await adminControlService.getWithdrawalRequest(withdrawal.id)
      if (detail.success) setSelectedWithdrawal(detail.data)
      await loadData()
    } else {
      setError(copy.actionError)
    }
    setActionPending(null)
  }, [copy.actionError, loadData, selectedWithdrawal])

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
    setActionPending(`resolve:${withdrawal.id}`)
    setError(null)
    const result = await adminControlService.resolveWithdrawalRequest(withdrawal.id, {
      decision: resolution,
      ...(resolution === 'paid' ? { transfer_reference: transferReference.trim() } : { reason: resolutionReason.trim() }),
    })
    if (result.success) {
      setSelectedWithdrawal(null)
      setNotice(copy.noticeWithdrawal)
      await loadData()
    } else {
      setError(copy.actionError)
    }
    setActionPending(null)
  }, [copy.actionError, copy.noticeWithdrawal, copy.reasonRequired, copy.referenceRequired, loadData, resolution, resolutionReason, selectedWithdrawal, transferReference])

  const activeItems = useMemo(() => activeTab === 'accounts' ? payoutMethods : withdrawalRequests, [activeTab, payoutMethods, withdrawalRequests])
  const paginationLabels = useMemo(() => ({
    more: language === 'vi' ? 'Còn trang tiếp theo' : 'More pages available',
    next: language === 'vi' ? 'Trang sau' : 'Next page',
    page: (page: number) => language === 'vi' ? `Trang ${page}` : `Page ${page}`,
    previous: language === 'vi' ? 'Trang trước' : 'Previous page',
  }), [language])

  return <View style={styles.stack} testID="admin-payout-panel">
    <AdminTabNavigation
      items={[
        { key: 'accounts', label: copy.accounts, onPress: () => setActiveTab('accounts'), selected: activeTab === 'accounts', testID: 'admin-payout-accounts-tab' },
        { key: 'withdrawals', label: copy.withdrawals, onPress: () => setActiveTab('withdrawals'), selected: activeTab === 'withdrawals', testID: 'admin-payout-withdrawals-tab' },
      ]}
      testID="admin-payout-navigation"
    />

    <View style={styles.toolbar}>
      <View style={styles.filterRow}>
        {activeTab === 'accounts' ? <>
          <KaelChip accessibilityLabel={copy.needReview} accessibilityState={{ selected: methodFilter === 'pending_verification' }} label={copy.needReview} onPress={() => { setMethodFilter('pending_verification'); setPayoutMethodPage(1) }} variant={methodFilter === 'pending_verification' ? 'selected' : 'unselected'} />
          <KaelChip accessibilityLabel={language === 'vi' ? 'Tất cả' : 'All'} accessibilityState={{ selected: methodFilter === 'all' }} label={language === 'vi' ? 'Tất cả' : 'All'} onPress={() => { setMethodFilter('all'); setPayoutMethodPage(1) }} variant={methodFilter === 'all' ? 'selected' : 'unselected'} />
        </> : <>
          <KaelChip accessibilityLabel={copy.pending} accessibilityState={{ selected: withdrawalFilter === 'pending' }} label={copy.pending} onPress={() => { setWithdrawalFilter('pending'); setWithdrawalPage(1) }} variant={withdrawalFilter === 'pending' ? 'selected' : 'unselected'} />
          <KaelChip accessibilityLabel={copy.processing} accessibilityState={{ selected: withdrawalFilter === 'processing' }} label={copy.processing} onPress={() => { setWithdrawalFilter('processing'); setWithdrawalPage(1) }} variant={withdrawalFilter === 'processing' ? 'selected' : 'unselected'} />
          <KaelChip accessibilityLabel={language === 'vi' ? 'Tất cả' : 'All'} accessibilityState={{ selected: withdrawalFilter === 'all' }} label={language === 'vi' ? 'Tất cả' : 'All'} onPress={() => { setWithdrawalFilter('all'); setWithdrawalPage(1) }} variant={withdrawalFilter === 'all' ? 'selected' : 'unselected'} />
        </>}
      </View>
      <KaelButton label={copy.reload} onPress={() => { void loadData() }} size="small" style={styles.reloadButton} variant="secondary" />
    </View>

    {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text><Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={() => setNotice(null)}><Text style={styles.noticeClose}>×</Text></Pressable></View> : null}
    {error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel={copy.reload} onPress={() => { setError(null); void loadData() }}><Text style={styles.errorAction}>{copy.reload}</Text></Pressable></View> : null}

    {loading ? <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><Text style={styles.loadingText}>{copy.reload}</Text></View> : activeItems.length === 0 ? <EmptyState body={activeTab === 'accounts' ? copy.accountsEmpty : copy.withdrawalsEmpty} /> : activeTab === 'accounts' ? <>
      {payoutMethods.map((method) => <PayoutMethodCard
        canProcess={canProcess}
        copy={copy}
        key={method.id}
        method={method}
        onOpen={() => { void openPayoutMethod(method) }}
        reduceTransparency={reduceTransparency}
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
        canProcess={canProcess}
        copy={copy}
        formatCurrency={formatCurrency}
        key={request.id}
        onOpen={() => { void openWithdrawal(request) }}
        reduceTransparency={reduceTransparency}
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
    <PayoutMethodModal
      copy={copy}
      decision={methodDecision}
      formatDate={formatDate}
      onChangeDecision={setMethodDecision}
      onChangeReason={setMethodReason}
      onClose={() => setSelectedPayoutMethod(null)}
      onSubmit={() => { void submitPayoutMethodDecision() }}
      pending={Boolean(actionPending)}
      reason={methodReason}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      response={selectedPayoutMethod}
    />
    <WithdrawalModal
      copy={copy}
      formatCurrency={formatCurrency}
      formatDate={formatDate}
      onChangeReason={setResolutionReason}
      onChangeResolution={setResolution}
      onChangeTransferReference={setTransferReference}
      onClaim={() => { void claimWithdrawal() }}
      onClose={() => setSelectedWithdrawal(null)}
      onResolve={() => { void resolveWithdrawal() }}
      pending={Boolean(actionPending)}
      reason={resolutionReason}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      resolution={resolution}
      response={selectedWithdrawal}
      transferReference={transferReference}
    />
  </View>
}

function PayoutMethodCard({ canProcess, copy, method, onOpen, reduceTransparency }: {
  canProcess: boolean
  copy: PanelCopy
  method: AdminViewPayoutMethodSummary
  onOpen: () => void
  reduceTransparency: boolean
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${copy.accounts}: ${method.worker_name ?? method.worker_id}`} onPress={onOpen} style={styles.card} testID={`admin-payout-method-${method.id}`}>
    <FormulaMintCardAura reduceTransparency={reduceTransparency} scope={`AdminPayoutMethod${method.id}`} testID={`admin-payout-method-${method.id}-formula-mint-aura`} />
    <View style={styles.cardContent}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{method.worker_name ?? method.worker_id}</Text>
          <Text style={styles.cardSubtitle}>{method.bank_name} · {method.bank_account_masked}</Text>
        </View>
        <StatusPill label={copy.accountStatus[method.status]} tone={method.status === 'verified' ? 'success' : method.status === 'rejected' ? 'danger' : 'warning'} />
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>{method.reviewed_at ? copy.accountStatus[method.status] : copy.needReview}</Text>
        <Text style={styles.cardAction}>{canProcess ? copy.openDetail : copy.status}</Text>
      </View>
    </View>
  </Pressable>
}

function WithdrawalRequestCard({ canProcess, copy, formatCurrency, reduceTransparency, request, onOpen }: {
  canProcess: boolean
  copy: PanelCopy
  formatCurrency: (value: number) => string
  reduceTransparency: boolean
  request: AdminViewWithdrawalRequestSummary
  onOpen: () => void
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${copy.withdrawals}: ${request.worker_name ?? request.worker_id}`} onPress={onOpen} style={styles.card} testID={`admin-withdrawal-request-${request.id}`}>
    <FormulaMintCardAura reduceTransparency={reduceTransparency} scope={`AdminWithdrawal${request.id}`} testID={`admin-withdrawal-request-${request.id}-formula-mint-aura`} />
    <View style={styles.cardContent}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{request.worker_name ?? request.worker_id}</Text>
          <Text style={styles.cardSubtitle}>{request.bank_name} · {request.bank_account_masked}</Text>
        </View>
        <StatusPill label={copy.withdrawalStatus[request.status]} tone={request.status === 'paid' ? 'success' : request.status === 'rejected' || request.status === 'failed' ? 'danger' : request.status === 'processing' ? 'neutral' : 'warning'} />
      </View>
      <View style={styles.withdrawalNumbers}>
        <AmountItem label={copy.amount} value={formatCurrency(request.amount_vnd)} />
        <AmountItem label={copy.availableBalance} value={formatCurrency(request.available_balance_before_vnd)} />
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>{request.processing_by_name ? `${copy.processingBy}: ${request.processing_by_name}` : copy.requestedAt}</Text>
        <Text style={styles.cardAction}>{canProcess ? copy.openDetail : copy.status}</Text>
      </View>
    </View>
  </Pressable>
}

function PayoutMethodModal({ copy, decision, formatDate, onChangeDecision, onChangeReason, onClose, onSubmit, pending, reason, reduceMotion, reduceTransparency, response }: {
  copy: PanelCopy
  decision: 'verify' | 'reject'
  formatDate: (value: string | null) => string
  onChangeDecision: (value: 'verify' | 'reject') => void
  onChangeReason: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  pending: boolean
  reason: string
  reduceMotion: boolean
  reduceTransparency: boolean
  response: AdminViewPayoutMethodDetailResponse | null
}) {
  if (!response) return null
  const method = response.payout_method
  const canDecide = method.status === 'pending_verification'
  return <Modal animationType={reduceMotion ? 'none' : 'fade'} transparent visible onRequestClose={onClose}>
    <View style={styles.modalBackdrop}><View style={styles.modalCard} testID="admin-payout-method-detail">
      <FormulaMintCardAura reduceTransparency={reduceTransparency} scope={`AdminPayoutMethodDetail${method.id}`} testID="admin-payout-method-detail-formula-mint-aura" />
      <View style={styles.modalContent}>
        <ModalHeader closeLabel={copy.close} onClose={onClose} subtitle={method.worker_name ?? method.worker_id} title={copy.reviewAccount} />
        <View style={styles.destinationBlock}>
          <DetailItem label={copy.holder} value={method.account_holder_name} />
          <DetailItem label={copy.bankName} value={method.bank_name} />
          <DetailItem label={copy.bankAccount} value={method.bank_account} mono />
        </View>
        <Text style={styles.modalHint}>{copy.manualTransferHint}</Text>
        <DetailItem label={copy.status} value={copy.accountStatus[method.status]} />
        <DetailItem label={copy.requestedAt} value={formatDate(method.created_at)} />
        {canDecide ? <>
          <Text style={styles.modalSectionTitle}>{copy.methodDecision}</Text>
          <View style={styles.modalChipRow}>
            <KaelChip accessibilityLabel={copy.verify} accessibilityState={{ selected: decision === 'verify' }} label={copy.verify} onPress={() => onChangeDecision('verify')} variant={decision === 'verify' ? 'selected' : 'unselected'} />
            <KaelChip accessibilityLabel={copy.rejected} accessibilityState={{ selected: decision === 'reject' }} label={copy.rejected} onPress={() => onChangeDecision('reject')} variant={decision === 'reject' ? 'error' : 'unselected'} />
          </View>
          {decision === 'reject' ? <KaelTextField accessibilityLabel={copy.reviewReason} multiline onChangeText={onChangeReason} placeholder={copy.reviewReason} placeholderTextColor={color.text.muted} style={styles.reasonText} inputShellStyle={styles.reasonInput} value={reason} /> : null}
          <View style={styles.modalActionRow}><KaelButton label={copy.cancel} onPress={onClose} style={styles.modalButton} variant="secondary" /><KaelButton label={copy.save} loading={pending} onPress={onSubmit} style={styles.modalButton} variant={decision === 'reject' ? 'destructive' : 'primary'} /></View>
        </> : <KaelButton label={copy.close} onPress={onClose} style={styles.fullButton} variant="secondary" />}
      </View>
    </View></View>
  </Modal>
}

function WithdrawalModal({ copy, formatCurrency, formatDate, onChangeReason, onChangeResolution, onChangeTransferReference, onClaim, onClose, onResolve, pending, reason, reduceMotion, reduceTransparency, resolution, response, transferReference }: {
  copy: PanelCopy
  formatCurrency: (value: number) => string
  formatDate: (value: string | null) => string
  onChangeReason: (value: string) => void
  onChangeResolution: (value: WithdrawalResolution) => void
  onChangeTransferReference: (value: string) => void
  onClaim: () => void
  onClose: () => void
  onResolve: () => void
  pending: boolean
  reason: string
  reduceMotion: boolean
  reduceTransparency: boolean
  resolution: WithdrawalResolution
  response: AdminViewWithdrawalRequestDetailResponse | null
  transferReference: string
}) {
  if (!response) return null
  const request = response.withdrawal_request
  const canClaim = request.status === 'pending'
  const canResolve = request.status === 'processing'
  return <Modal animationType={reduceMotion ? 'none' : 'fade'} transparent visible onRequestClose={onClose}>
    <View style={styles.modalBackdrop}><View style={[styles.modalCard, styles.withdrawalModal]} testID="admin-withdrawal-request-detail">
      <FormulaMintCardAura reduceTransparency={reduceTransparency} scope={`AdminWithdrawalDetail${request.id}`} testID="admin-withdrawal-request-detail-formula-mint-aura" />
      <View style={styles.modalContent}>
        <ModalHeader closeLabel={copy.close} onClose={onClose} subtitle={request.worker_name ?? request.worker_id} title={copy.withdrawalDetail} />
        <ScrollView contentContainerStyle={styles.modalScrollContent}>
          <View style={styles.amountBlock}><FormulaMintCardAura reduceTransparency={reduceTransparency} scope={`AdminWithdrawalAmount${request.id}`} /><View style={styles.amountContent}><Text style={styles.amountLabel}>{copy.amount}</Text><Text style={styles.amountValue}>{formatCurrency(request.amount_vnd)}</Text></View></View>
          <View style={styles.destinationBlock}>
            <DetailItem label={copy.holder} value={request.account_holder_name} />
            <DetailItem label={copy.bankName} value={request.bank_name} />
            <DetailItem label={copy.bankAccount} value={request.bank_account} mono />
          </View>
          <Text style={styles.modalHint}>{copy.manualTransferHint}</Text>
          <View style={styles.detailGrid}>
            <DetailItem label={copy.availableBalance} value={formatCurrency(request.available_balance_before_vnd)} />
            <DetailItem label={copy.status} value={copy.withdrawalStatus[request.status]} />
            <DetailItem label={copy.requestedAt} value={formatDate(request.requested_at)} />
            <DetailItem label={copy.processingBy} value={request.processing_by_name ?? '—'} />
          </View>
          {canClaim ? <KaelButton label={copy.claim} loading={pending} onPress={onClaim} style={styles.fullButton} variant="primary" /> : null}
          {canResolve ? <>
            <Text style={styles.modalSectionTitle}>{copy.confirmStatus}</Text>
            <View style={styles.modalChipRow}>
              <KaelChip accessibilityLabel={copy.paid} accessibilityState={{ selected: resolution === 'paid' }} label={copy.paid} onPress={() => onChangeResolution('paid')} variant={resolution === 'paid' ? 'selected' : 'unselected'} />
              <KaelChip accessibilityLabel={copy.rejected} accessibilityState={{ selected: resolution === 'rejected' }} label={copy.rejected} onPress={() => onChangeResolution('rejected')} variant={resolution === 'rejected' ? 'error' : 'unselected'} />
              <KaelChip accessibilityLabel={copy.failed} accessibilityState={{ selected: resolution === 'failed' }} label={copy.failed} onPress={() => onChangeResolution('failed')} variant={resolution === 'failed' ? 'error' : 'unselected'} />
            </View>
            {resolution === 'paid' ? <KaelTextField accessibilityLabel={copy.reference} onChangeText={onChangeTransferReference} placeholder={copy.reference} placeholderTextColor={color.text.muted} style={styles.singleInputText} inputShellStyle={styles.singleInput} value={transferReference} /> : <KaelTextField accessibilityLabel={copy.reason} multiline onChangeText={onChangeReason} placeholder={copy.reason} placeholderTextColor={color.text.muted} style={styles.reasonText} inputShellStyle={styles.reasonInput} value={reason} />}
            <KaelButton label={copy.confirmStatus} loading={pending} onPress={onResolve} style={styles.fullButton} variant={resolution === 'paid' ? 'primary' : 'destructive'} />
          </> : null}
          {!canClaim && !canResolve ? <KaelButton label={copy.close} onPress={onClose} style={styles.fullButton} variant="secondary" /> : null}
        </ScrollView>
      </View>
    </View></View>
  </Modal>
}

function ModalHeader({ closeLabel, onClose, subtitle, title }: { closeLabel: string; onClose: () => void; subtitle: string; title: string }) {
  return <View style={styles.modalHeader}><View style={styles.modalHeaderText}><Text style={styles.modalTitle}>{title}</Text><Text style={styles.modalSubtitle}>{subtitle}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose}><Text style={styles.closeLabel}>×</Text></Pressable></View>
}

function DetailItem({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return <View style={styles.detailItem}><Text style={styles.detailLabel}>{label}</Text><Text selectable={mono} style={[styles.detailValue, mono ? styles.detailValueMono : null]}>{value}</Text></View>
}

function AmountItem({ label, value }: { label: string; value: string }) {
  return <View style={styles.amountItem}><Text style={styles.amountItemLabel}>{label}</Text><Text style={styles.amountItemValue}>{value}</Text></View>
}

function StatusPill({ label, tone }: { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }) {
  return <View style={[styles.statusPill, tone === 'warning' ? styles.statusWarning : null, tone === 'success' ? styles.statusSuccess : null, tone === 'danger' ? styles.statusDanger : null]}><Text style={styles.statusPillText}>{label}</Text></View>
}

function EmptyState({ body }: { body: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{body}</Text></View>
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  toolbar: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  filterRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reloadButton: { minHeight: component.button.small.height },
  notice: { alignItems: 'center', backgroundColor: component.chip.successStatus.bg, borderColor: component.chip.successStatus.border, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  noticeText: { ...typography.footnote, color: component.chip.successStatus.text, flex: 1 },
  noticeClose: { ...typography.title3, color: component.chip.successStatus.text, paddingHorizontal: spacing.xs },
  error: { alignItems: 'center', backgroundColor: color.surface.mint, borderColor: color.surface.strokeStrong, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  errorText: { ...typography.footnote, color: color.brand.primaryDark, flex: 1 },
  errorAction: { ...typography.label, color: color.brand.primaryDark, fontWeight: '600' },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
  loadingText: { ...typography.footnote, color: color.text.secondary },
  detailLoading: { alignItems: 'center', padding: spacing.lg },
  empty: { alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.xxxl, ...shadow.soft },
  emptyText: { ...typography.body, color: color.text.secondary, textAlign: 'center' },
  card: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, overflow: 'hidden', padding: spacing.lg, position: 'relative', ...shadow.soft },
  cardContent: { gap: spacing.md, position: 'relative', zIndex: 1 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  cardTitleBlock: { flex: 1, gap: spacing.xs },
  cardTitle: { ...typography.headline, color: color.text.strong, fontWeight: '600', includeFontPadding: false },
  cardSubtitle: { ...typography.footnote, color: color.text.secondary },
  statusPill: { backgroundColor: color.surface.disabled, borderColor: color.surface.stroke, borderRadius: component.chip.radius, borderWidth: 1, flexShrink: 1, maxWidth: '46%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusWarning: { backgroundColor: component.chip.warning.bg, borderColor: component.chip.warning.border },
  statusSuccess: { backgroundColor: component.chip.successStatus.bg, borderColor: component.chip.successStatus.border },
  statusDanger: { backgroundColor: component.chip.error.bg, borderColor: component.chip.error.border },
  statusPillText: { ...typography.caption2, color: color.text.strong, fontWeight: '600' },
  withdrawalNumbers: { borderTopColor: color.surface.stroke, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md },
  amountItem: { flex: 1, gap: spacing.xs, minWidth: 132 },
  amountItemLabel: { ...typography.caption2, color: color.text.muted, fontWeight: '600' },
  amountItemValue: { ...typography.label, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '600' },
  cardFooter: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  cardMeta: { ...typography.caption2, color: color.text.secondary, flex: 1 },
  cardAction: { ...typography.caption1, color: color.brand.primaryDark, fontWeight: '600' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(7,26,36,0.58)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.largeRadius, borderWidth: 1, maxHeight: '90%', maxWidth: 620, overflow: 'hidden', padding: spacing.xl, position: 'relative', width: '100%', ...shadow.raised },
  withdrawalModal: { maxWidth: 680 },
  modalContent: { gap: spacing.md, position: 'relative', zIndex: 1 },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  modalHeaderText: { flex: 1, gap: spacing.xs },
  modalTitle: { ...typography.title2, color: color.text.strong, fontWeight: '600', includeFontPadding: false },
  modalSubtitle: { ...typography.footnote, color: color.text.secondary },
  closeLabel: { ...typography.title1, color: color.text.secondary, fontWeight: '400', paddingHorizontal: spacing.xs },
  destinationBlock: { backgroundColor: color.surface.soft, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: StyleSheet.hairlineWidth, gap: spacing.md, padding: spacing.lg },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  detailItem: { flexBasis: '44%', flexGrow: 1, gap: spacing.xs, minWidth: 120 },
  detailLabel: { ...typography.caption2, color: color.text.muted, fontWeight: '600', textTransform: 'uppercase' },
  detailValue: { ...typography.footnote, color: color.text.primary },
  detailValueMono: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  modalHint: { ...typography.footnote, color: color.text.secondary },
  modalSectionTitle: { ...typography.label, color: color.text.strong, fontWeight: '600', marginTop: spacing.xs },
  modalChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonInput: { backgroundColor: color.surface.soft, borderColor: component.input.border, borderRadius: component.input.radius, borderWidth: 1, minHeight: 104 },
  reasonText: { ...typography.body, color: color.text.primary, minHeight: 100, padding: spacing.md, textAlignVertical: 'top' },
  singleInput: { backgroundColor: color.surface.soft, borderColor: component.input.border, borderRadius: component.input.radius, borderWidth: 1, minHeight: component.input.height },
  singleInputText: { ...typography.body, color: color.text.primary, minHeight: component.input.height - 2, paddingHorizontal: spacing.md },
  modalActionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
  fullButton: { marginTop: spacing.sm, width: '100%' },
  modalScrollContent: { gap: spacing.md, paddingBottom: spacing.xs },
  amountBlock: { alignItems: 'flex-start', backgroundColor: color.mint.mint50, borderRadius: component.card.radius, overflow: 'hidden', padding: spacing.lg, position: 'relative' },
  amountContent: { position: 'relative', zIndex: 1 },
  amountLabel: { ...typography.caption1, color: color.text.secondary, fontWeight: '600', textAlign: 'left' },
  amountValue: { ...typography.title1, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '600', marginTop: spacing.xs, textAlign: 'left' },
})
