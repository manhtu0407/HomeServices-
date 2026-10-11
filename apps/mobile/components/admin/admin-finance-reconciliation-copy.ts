export const reconciliationCopyByLanguage = {
  vi: {
    invalidActualAmount: 'Nhập số tiền thực nhận lớn hơn 0.',
    bankReferenceHint: 'Nhập mã giao dịch thật trên sao kê để lưu dấu vết đối soát. Mã NS… phía trên chỉ giúp tìm khoản chuyển.',
    bankReferenceRequired: 'Chưa nhập mã giao dịch thật trên sao kê để lưu dấu vết đối soát.',
    transferContent: 'Nội dung chuyển khoản NestScout',
    transferContentHint: 'Mã NS… do NestScout cấp để bạn tìm khoản tiền trong sao kê; mã này không xác nhận tiền đã vào.',
    transferContentUnavailable: 'Chưa có nội dung chuyển khoản NestScout trên lệnh này. Hãy tra soát theo thông tin giao dịch khác.',
  },
  en: {
    invalidActualAmount: 'Enter an actual amount greater than zero.',
    bankReferenceHint: 'Enter the real bank statement reference for the audit trail. The NS… code above only helps find the transfer.',
    bankReferenceRequired: 'The real bank statement transaction reference is required for the reconciliation audit trail.',
    transferContent: 'NestScout transfer content',
    transferContentHint: 'NestScout generated this NS… code to help locate the payment in your statement; it does not confirm receipt.',
    transferContentUnavailable: 'NestScout transfer content is not available for this order. Reconcile using other transaction details.',
  },
} as const
