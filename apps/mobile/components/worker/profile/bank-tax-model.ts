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
        ? formatVnd(earnings.net_earnings, language)
        : textByLanguage(language, 'Chưa có dữ liệu thu nhập đã ghi nhận', 'No recorded earnings data'),
      status: textByLanguage(language, 'Sổ thu nhập', 'Earnings ledger'),
      title: textByLanguage(language, 'Thu nhập ròng đã ghi nhận', 'Recorded net earnings'),
    },
    {
      icon: 'clock',
      meta: textByLanguage(
        language,
        'Ứng dụng chưa có luồng chuyển tiền cho thợ.',
        'The worker payout rail is not available in the app.',
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
