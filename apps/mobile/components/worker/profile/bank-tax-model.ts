import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import { formatVnd, textByLanguage } from '../ui/format'

export type WorkerV5PayoutRuleRow = {
  icon: WorkerV5IconName
  meta: string
  status: string
  title: string
}

export function workerV5PayoutRuleRows(
  earnings: EarningsResponse | null | undefined,
  language: AppLanguage,
): WorkerV5PayoutRuleRow[] {
  return [
    {
      icon: 'wallet',
      meta: earnings
        ? formatVnd(earnings.available_balance, language)
        : textByLanguage(language, 'Chưa có dữ liệu số dư đã ghi có', 'No credited balance data'),
      status: textByLanguage(language, 'Tài khoản trong ứng dụng', 'In-app account'),
      title: textByLanguage(language, 'Số dư đã SePay xác thực', 'SePay-verified balance'),
    },
    {
      icon: 'clock',
      meta: textByLanguage(
        language,
        'Chuyển tiền từ tài khoản thợ ra ngân hàng chưa được bật.',
        'Bank payout from the worker in-app account is not enabled.',
      ),
      status: textByLanguage(language, 'Chưa mở', 'Not enabled'),
      title: textByLanguage(language, 'Chuyển tiền chưa khả dụng', 'Payout unavailable'),
    },
    {
      icon: 'document',
      meta: textByLanguage(
        language,
        'Chưa có nguồn chứng từ thu nhập để hiển thị.',
        'No income-document source is available to display.',
      ),
      status: textByLanguage(language, 'Chưa có nguồn', 'No source'),
      title: textByLanguage(language, 'Chứng từ chưa khả dụng', 'Income documents unavailable'),
    },
  ]
}
