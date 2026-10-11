import type { AdminViewPayoutMethodStatus, AdminViewWithdrawalRequestStatus } from '@/lib/api-types/admin'

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
  loading: string
  loadError: string
  actionError: string
  allAssignees: string
  assignedMine: string
  unassigned: string
  assignmentReason: string
  release: string
  takeover: string
}

export const adminPayoutCopyByLanguage: Record<'vi' | 'en', PanelCopy> = {
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
    loading: 'Đang tải…',
    loadError: 'Chưa tải được dữ liệu chi trả. Hệ thống đang tự thử lại.',
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
    loading: 'Loading…',
    loadError: 'Payout data is unavailable. The system is retrying automatically.',
    actionError: 'Unable to save the change. The data was not updated.',
    allAssignees: 'All assignees',
    assignedMine: 'Assigned to me',
    unassigned: 'Unassigned',
    assignmentReason: 'Reason for takeover or release',
    release: 'Release',
    takeover: 'Take over',
  },
}
