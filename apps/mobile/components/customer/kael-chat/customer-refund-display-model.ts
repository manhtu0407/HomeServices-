import { refundSummarySchema, type LocalDealPayment } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

export function customerRefundDisplayModel(payment: LocalDealPayment | null | undefined, language: AppLanguage) {
  if (!payment?.refund && !payment?.refundDataUnavailable) return null
  const result = refundSummarySchema.safeParse(payment.refund)
  const state = payment.refundDataUnavailable || !result.success ? 'unavailable' : result.data.state
  const text = refundCopy[language][state]
  return {
    ...text,
    amount: state === 'refund_required' && result.success ? result.data.amount_vnd : null,
    amountLabel: language === 'vi' ? 'Số tiền cần hoàn' : 'Amount to return',
    noteTitle: language === 'vi' ? 'Đối soát hoàn tiền' : 'Refund reconciliation',
  }
}

const refundCopy = {
  vi: {
    review_required: {
      title: 'Yêu cầu hoàn tiền cần rà soát',
      status: 'Chờ rà soát',
      noteCopy: 'Yêu cầu đã được ghi nhận để rà soát. Chưa có quyết định về số tiền cần hoàn và chưa có xác nhận chuyển tiền hoàn lại.',
    },
    refund_required: {
      title: 'Đã ghi nhận khoản cần hoàn tiền',
      status: 'Chờ hoàn tiền',
      noteCopy: 'Số tiền dưới đây là khoản cần hoàn đã được ghi nhận. Chưa có bằng chứng ngân hàng xác nhận tiền đã được hoàn lại.',
    },
    unavailable: {
      title: 'Thông tin hoàn tiền cần đối soát',
      status: 'Đang đối soát',
      noteCopy: 'Chưa thể xác minh thông tin hoàn tiền. Hãy cập nhật trạng thái hoặc liên hệ hỗ trợ; không chuyển thêm tiền cho công việc này.',
    },
  },
  en: {
    review_required: {
      title: 'Refund request needs review',
      status: 'Awaiting review',
      noteCopy: 'Your request has been recorded for review. No refund amount has been decided and no return transfer has been confirmed.',
    },
    refund_required: {
      title: 'Refund obligation recorded',
      status: 'Refund pending',
      noteCopy: 'The amount below is a recorded refund obligation. There is no bank evidence confirming that the money has been returned.',
    },
    unavailable: {
      title: 'Refund information needs reconciliation',
      status: 'Reconciling',
      noteCopy: 'Refund information could not be verified. Refresh the status or contact support; do not send another payment for this work.',
    },
  },
} as const
