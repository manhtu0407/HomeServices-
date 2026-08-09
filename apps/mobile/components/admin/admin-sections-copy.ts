import type { AppLanguage } from '@/lib/app-language'

export type AdminSectionsCopy = {
  actions: {
    approve: string
    approving: string
    close: string
    refresh: string
    reject: string
    requestChanges: string
    retry: string
    signOut: string
    signingOut: string
    staySignedIn: string
  }
  applicationStatus: Record<'open' | 'acknowledged' | 'resolved' | 'cancelled', string>
  errors: {
    action: string
    load: string
    reasonRequired: string
  }
  filters: {
    all: string
    open: string
    searchPlaceholder: string
  }
  heroBody: string
  heroTitle: string
  labels: {
    accountAccess: string
    accountRole: string
    commissionRate: string
    contact: string
    customer: string
    documents: string
    fullName: string
    job: string
    ledgerRecordedAt: string
    payment: string
    paymentAmount: string
    paymentAvailableAt: string
    paymentMethod: string
    platformFee: string
    phone: string
    profileStatus: string
    service: string
    submitted: string
    jobStatus: string
    jobStatusSummary: string
    transactionStatus: string
    worker: string
    workerLedger: string
    workerNet: string
  }
  documentsSummary: (hasCccd: boolean, hasSelfie: boolean) => string
  loading: string
  modal: {
    decisionReasonPlaceholder: string
    requestChangesTitle: string
    rejectTitle: string
    signOutBody: string
    signOutTitle: string
    transactionTitle: string
  }
  navigation: {
    operations: string
    overview: string
    team: string
    transactions: string
    workers: string
  }
  notices: {
    approved: string
    changesRequested: string
    rejected: string
  }
  noData: {
    transactions: string
    workers: string
  }
  notRecorded: string
  pagination: {
    more: string
    next: string
    page: (page: number) => string
    previous: string
  }
  profileStatus: Record<'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'suspended', string>
  timeline: Record<'created' | 'payment_updated' | 'paid' | 'ledger_recorded' | 'dispute_opened', string>
  title: string
  disputeStatus: Record<string, string>
  paymentProvider: Record<string, string>
  transactionStatus: Record<string, string>
  workerProfileHint: string
}

export const adminSectionsCopy: Record<AppLanguage, AdminSectionsCopy> = {
  vi: {
    actions: {
      approve: 'Duyệt quyền vào luồng thợ',
      approving: 'Đang lưu...',
      close: 'Đóng',
      refresh: 'Tải lại',
      reject: 'Từ chối',
      requestChanges: 'Yêu cầu bổ sung',
      retry: 'Thử lại',
      signOut: 'Đăng xuất',
      signingOut: 'Đang đăng xuất...',
      staySignedIn: 'Ở lại',
    },
    applicationStatus: {
      open: 'Chờ xét duyệt',
      acknowledged: 'Cần bổ sung',
      resolved: 'Đã xử lý',
      cancelled: 'Đã hủy',
    },
    errors: {
      action: 'Không thể lưu quyết định lúc này. Vui lòng thử lại.',
      load: 'Không thể tải dữ liệu quản trị lúc này.',
      reasonRequired: 'Nhập lý do trước khi yêu cầu bổ sung hoặc từ chối.',
    },
    filters: {
      all: 'Tất cả',
      open: 'Cần xử lý',
      searchPlaceholder: 'Tìm theo tên, mã việc hoặc trạng thái',
    },
    heroBody: 'Quản lý vận hành, duyệt tài khoản thợ và phân quyền quản trị.',
    heroTitle: 'Điều hành hệ thống',
    labels: {
      accountAccess: 'Quyền vào luồng thợ',
      accountRole: 'Vai trò tài khoản',
      commissionRate: 'Mức phí nền tảng',
      contact: 'Liên hệ',
      customer: 'Khách hàng',
      documents: 'Bằng chứng hồ sơ',
      fullName: 'Họ tên',
      job: 'Mã việc',
      ledgerRecordedAt: 'Ghi sổ lúc',
      payment: 'Thanh toán',
      paymentAmount: 'Tổng tiền',
      paymentAvailableAt: 'Có thể rút từ',
      paymentMethod: 'Phương thức',
      platformFee: 'Phí nền tảng',
      phone: 'Số điện thoại',
      profileStatus: 'Trạng thái hồ sơ thợ',
      service: 'Dịch vụ',
      submitted: 'Gửi lúc',
      jobStatus: 'Trạng thái công việc',
      jobStatusSummary: 'Công việc',
      transactionStatus: 'Thanh toán',
      worker: 'Thợ',
      workerLedger: 'Sổ cái thợ',
      workerNet: 'Thợ nhận',
    },
    documentsSummary: (hasCccd, hasSelfie) => `${hasCccd ? '✓' : '—'} CCCD · ${hasSelfie ? '✓' : '—'} Ảnh chân dung`,
    loading: 'Đang tải dữ liệu quản trị...',
    modal: {
      decisionReasonPlaceholder: 'Lý do hoặc hướng dẫn bổ sung',
      requestChangesTitle: 'Yêu cầu bổ sung hồ sơ',
      rejectTitle: 'Từ chối hồ sơ',
      signOutBody: 'Bạn sẽ trở về cổng đăng nhập.',
      signOutTitle: 'Đăng xuất khỏi khu quản trị?',
      transactionTitle: 'Chi tiết giao dịch',
    },
    navigation: {
      operations: 'Vận hành',
      overview: 'Tổng quan',
      team: 'Đội quản trị',
      transactions: 'Giao dịch',
      workers: 'Duyệt tài khoản thợ',
    },
    notices: {
      approved: 'Đã cấp quyền vào luồng thợ. Tài khoản vẫn cần hoàn tất hồ sơ xác minh.',
      changesRequested: 'Đã chuyển hồ sơ sang trạng thái cần bổ sung.',
      rejected: 'Đã từ chối hồ sơ thợ.',
    },
    noData: {
      transactions: 'Chưa có giao dịch phù hợp.',
      workers: 'Chưa có hồ sơ thợ cần xử lý.',
    },
    notRecorded: 'Chưa ghi nhận',
    pagination: {
      more: 'Còn trang tiếp theo',
      next: 'Trang sau',
      page: (page) => `Trang ${page}`,
      previous: 'Trang trước',
    },
    profileStatus: {
      draft: 'Chưa hoàn tất',
      submitted: 'Đã gửi',
      under_review: 'Đang xác minh',
      approved: 'Đã xác minh',
      rejected: 'Cần gửi lại',
      suspended: 'Tạm khóa',
    },
    timeline: {
      created: 'Tạo việc',
      payment_updated: 'Cập nhật thanh toán',
      paid: 'Đã thanh toán',
      ledger_recorded: 'Ghi sổ thợ',
      dispute_opened: 'Mở tranh chấp',
    },
    title: 'Khu vực quản trị',
    disputeStatus: {
      open: 'Đang mở',
      awaiting_counter_party: 'Đang chờ phản hồi',
      admin_review: 'Đang được quản trị viên xem xét',
      admin_decided: 'Đã có quyết định',
      resolved: 'Đã giải quyết',
      rejected: 'Không chấp nhận',
      withdrawn: 'Đã rút yêu cầu',
      cancelled: 'Đã hủy',
    },
    paymentProvider: {
      bank_transfer: 'Chuyển khoản ngân hàng',
      cash: 'Tiền mặt',
      sepay_vietqr: 'Chuyển khoản qua mã QR',
      staging_simulator: 'Mô phỏng thanh toán',
    },
    transactionStatus: {
      not_started: 'Chưa bắt đầu',
      pending: 'Đang chờ xác nhận',
      received: 'Đã nhận tiền',
      cash_confirmed: 'Đã xác nhận tiền mặt',
      amount_mismatch: 'Lệch số tiền',
      reconciled: 'Đã đối soát',
      failed: 'Thất bại',
      expired: 'Hết hạn',
    },
    workerProfileHint: 'Duyệt tài khoản chỉ mở quyền vào luồng thợ; không thay thế bước xác minh hồ sơ.',
  },
  en: {
    actions: {
      approve: 'Grant worker access',
      approving: 'Saving...',
      close: 'Close',
      refresh: 'Refresh',
      reject: 'Reject',
      requestChanges: 'Request changes',
      retry: 'Try again',
      signOut: 'Sign out',
      signingOut: 'Signing out...',
      staySignedIn: 'Stay signed in',
    },
    applicationStatus: {
      open: 'Awaiting review',
      acknowledged: 'Changes requested',
      resolved: 'Resolved',
      cancelled: 'Cancelled',
    },
    errors: {
      action: 'Unable to save this decision right now. Please try again.',
      load: 'Unable to load admin data right now.',
      reasonRequired: 'Enter a reason before requesting changes or rejecting.',
    },
    filters: {
      all: 'All',
      open: 'Needs action',
      searchPlaceholder: 'Search by name, job code, or status',
    },
    heroBody: 'Manage operations, approve worker accounts, and assign admin access.',
    heroTitle: 'Operate the system',
    labels: {
      accountAccess: 'Worker access',
      accountRole: 'Account role',
      commissionRate: 'Platform fee rate',
      contact: 'Contact',
      customer: 'Customer',
      documents: 'Profile evidence',
      fullName: 'Full name',
      job: 'Job code',
      ledgerRecordedAt: 'Ledger recorded at',
      payment: 'Payment',
      paymentAmount: 'Total amount',
      paymentAvailableAt: 'Available from',
      paymentMethod: 'Payment method',
      platformFee: 'Platform fee',
      phone: 'Phone',
      profileStatus: 'Worker profile status',
      service: 'Service',
      submitted: 'Submitted',
      jobStatus: 'Job status',
      jobStatusSummary: 'Job',
      transactionStatus: 'Transaction status',
      worker: 'Worker',
      workerLedger: 'Worker ledger',
      workerNet: 'Worker net',
    },
    documentsSummary: (hasCccd, hasSelfie) => `${hasCccd ? '✓' : '—'} ID · ${hasSelfie ? '✓' : '—'} Selfie`,
    loading: 'Loading admin data...',
    modal: {
      decisionReasonPlaceholder: 'Reason or requested next step',
      requestChangesTitle: 'Request profile changes',
      rejectTitle: 'Reject application',
      signOutBody: 'You will return to the Login Gate.',
      signOutTitle: 'Sign out of Admin?',
      transactionTitle: 'Transaction detail',
    },
    navigation: {
      operations: 'Operations',
      overview: 'Overview',
      team: 'Admin team',
      transactions: 'Transactions',
      workers: 'Worker account review',
    },
    notices: {
      approved: 'Worker access granted. The account still needs to complete profile verification.',
      changesRequested: 'The application is now waiting for requested changes.',
      rejected: 'The worker application was rejected.',
    },
    noData: {
      transactions: 'No matching transactions yet.',
      workers: 'No worker applications need action.',
    },
    notRecorded: 'Not recorded',
    pagination: {
      more: 'More pages available',
      next: 'Next page',
      page: (page) => `Page ${page}`,
      previous: 'Previous page',
    },
    profileStatus: {
      draft: 'Incomplete',
      submitted: 'Submitted',
      under_review: 'In verification',
      approved: 'Verified',
      rejected: 'Needs resubmission',
      suspended: 'Suspended',
    },
    timeline: {
      created: 'Job created',
      payment_updated: 'Payment updated',
      paid: 'Paid',
      ledger_recorded: 'Worker ledger recorded',
      dispute_opened: 'Dispute opened',
    },
    title: 'Admin Sections',
    disputeStatus: {
      open: 'Open',
      awaiting_counter_party: 'Awaiting response',
      admin_review: 'Under admin review',
      admin_decided: 'Decision recorded',
      resolved: 'Resolved',
      rejected: 'Rejected',
      withdrawn: 'Withdrawn',
      cancelled: 'Cancelled',
    },
    paymentProvider: {
      bank_transfer: 'Bank transfer',
      cash: 'Cash',
      sepay_vietqr: 'QR bank transfer',
      staging_simulator: 'Simulated payment',
    },
    transactionStatus: {
      not_started: 'Not started',
      pending: 'Awaiting confirmation',
      received: 'Payment received',
      cash_confirmed: 'Cash confirmed',
      amount_mismatch: 'Amount mismatch',
      reconciled: 'Reconciled',
      failed: 'Failed',
      expired: 'Expired',
    },
    workerProfileHint: 'Account approval grants worker-flow access; it does not replace profile verification.',
  },
}
