import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWorkResponse } from './case-work-response'
import type { CaseWorkResponseModel } from './case-work-response-model'
import { localizedQuoteReviewReason } from './case-work-localization'

const EMPTY_SAFETY_MESSAGES: string[] = []

export function QuoteReadinessReviewResponse({
  language,
  reason,
  reduceMotion,
  safetyMessages = EMPTY_SAFETY_MESSAGES,
  tokens,
}: {
  language: AppLanguage
  reason?: string
  reduceMotion: boolean
  safetyMessages?: string[]
  tokens: CustomerThemeTokens
}) {
  const safetyBlocked = safetyMessages.length > 0
  const model: CaseWorkResponseModel = {
    actionKind: 'none',
    noteCopy: safetyBlocked
      ? safetyMessages.join(' ')
      : localizedQuoteReviewReason(reason, language),
    noteTitle: safetyBlocked
      ? (language === 'vi' ? 'Điều cần bảo đảm' : 'What must be secured')
      : (language === 'vi' ? 'Điều Kael đang kiểm tra' : 'What Kael is checking'),
    phase: 'kael_estimating',
    status: safetyBlocked
      ? (language === 'vi' ? 'Đang giữ an toàn' : 'Safety hold')
      : (language === 'vi' ? 'Đang rà soát' : 'Under review'),
    title: safetyBlocked
      ? (language === 'vi' ? 'Cần xử lý an toàn trước' : 'Safety review required')
      : (language === 'vi' ? 'Báo giá cần rà soát' : 'Quote requires review'),
  }

  return (
    <CaseWorkResponse
      model={model}
      reduceMotion={reduceMotion}
      testID="customer-v21-quote-readiness-review"
      tokens={tokens}
    />
  )
}
