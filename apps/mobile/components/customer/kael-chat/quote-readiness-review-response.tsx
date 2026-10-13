import type { AppLanguage } from '@/lib/app-language'
import { KaelButton } from '@/components/ui/kael-primitives'

import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWorkResponse } from './case-work-response'
import { KaelActionDock, kaelActionPrimaryStyle } from './kael-next-action-chips'
import type { CaseWorkResponseModel } from './case-work-response-model'
import { localizedQuoteReviewReason } from './case-work-localization'

const EMPTY_SAFETY_MESSAGES: string[] = []

// A request the customer can send while no price exists: a worker quotes it, or inspects first.
export type QuoteReviewRequest = {
  busy: boolean
  kind: 'rfq_request' | 'inspection_request'
  onSend: () => void
}

// A worker-quote or inspection request has no price, so the estimate card never shows; the review
// card carries its send button instead, only while the server says the request may be confirmed.
export function unpricedQuoteRequestKind(input: {
  canConfirm: boolean
  confirmationKind: string | null | undefined
  confirmed: boolean
  hasEstimate: boolean
  processing: boolean
}): QuoteReviewRequest['kind'] | null {
  if (!input.canConfirm || input.hasEstimate || input.confirmed || input.processing) return null
  return input.confirmationKind === 'rfq_request' || input.confirmationKind === 'inspection_request'
    ? input.confirmationKind
    : null
}

const REQUEST_COPY = {
  en: {
    inspection_request: {
      action: 'Send inspection request',
      note: 'A suitable worker inspects before quoting. You approve the price before any work starts. No price is set at this step.',
    },
    rfq_request: {
      action: 'Send quote request to workers',
      note: 'A suitable worker reviews the photos and description, then quotes. You approve the price before any work starts. No price is set at this step.',
    },
    status: 'Ready to send',
    title: 'Next step',
    heading: { inspection_request: 'Inspection request ready', rfq_request: 'Quote request ready' },
  },
  vi: {
    inspection_request: {
      action: 'Gửi yêu cầu khảo sát',
      note: 'Thợ phù hợp sẽ khảo sát trước rồi báo giá. Bạn duyệt giá trước khi thợ làm. Chưa có giá ở bước này.',
    },
    rfq_request: {
      action: 'Gửi yêu cầu báo giá cho thợ',
      note: 'Thợ phù hợp sẽ xem ảnh và mô tả rồi báo giá. Bạn duyệt giá trước khi thợ làm. Chưa có giá ở bước này.',
    },
    status: 'Sẵn sàng gửi',
    title: 'Bước tiếp theo',
    heading: { inspection_request: 'Yêu cầu khảo sát sẵn sàng', rfq_request: 'Yêu cầu báo giá sẵn sàng' },
  },
} as const

export function QuoteReadinessReviewResponse({
  language,
  reason,
  reduceMotion,
  request,
  safetyMessages = EMPTY_SAFETY_MESSAGES,
  tokens,
}: {
  language: AppLanguage
  reason?: string
  reduceMotion: boolean
  request?: QuoteReviewRequest
  safetyMessages?: string[]
  tokens: CustomerThemeTokens
}) {
  const safetyBlocked = safetyMessages.length > 0
  const requestCopy = request && !safetyBlocked ? REQUEST_COPY[language] : null
  const model: CaseWorkResponseModel = {
    actionKind: 'none',
    noteCopy: safetyBlocked
      ? safetyMessages.join(' ')
      : requestCopy && request
        ? requestCopy[request.kind].note
        : localizedQuoteReviewReason(reason, language),
    noteTitle: safetyBlocked
      ? (language === 'vi' ? 'Điều cần bảo đảm' : 'What must be secured')
      : requestCopy
        ? requestCopy.title
        : (language === 'vi' ? 'Điều Kael đang kiểm tra' : 'What Kael is checking'),
    phase: 'kael_estimating',
    status: safetyBlocked
      ? (language === 'vi' ? 'Đang giữ an toàn' : 'Safety hold')
      : requestCopy
        ? requestCopy.status
        : (language === 'vi' ? 'Đang rà soát' : 'Under review'),
    title: safetyBlocked
      ? (language === 'vi' ? 'Cần xử lý an toàn trước' : 'Safety review required')
      : requestCopy && request
        ? requestCopy.heading[request.kind]
        : (language === 'vi' ? 'Báo giá cần rà soát' : 'Quote requires review'),
  }

  return (
    <>
      <CaseWorkResponse
        model={model}
        reduceMotion={reduceMotion}
        testID="customer-v21-quote-readiness-review"
        tokens={tokens}
      />
      {requestCopy && request ? (
        <KaelActionDock>
          <KaelButton
            accessibilityState={{ busy: request.busy, disabled: request.busy }}
            disabled={request.busy}
            label={requestCopy[request.kind].action}
            loading={request.busy}
            onPress={request.onSend}
            style={kaelActionPrimaryStyle}
            testID="customer-v21-quote-review-send-request"
          />
        </KaelActionDock>
      ) : null}
    </>
  )
}
