import type { LocalDeal } from '@nestscout/shared'

import { localizedServiceLabel, localizedStatusLabel, type AppLanguage } from '@/lib/app-language'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { canShowWorkerAddress, localizedWorkerBriefLines, routeDestinationLabel, workerV5TimeChoiceLabel } from '../ui/labels'

export type WorkerV5OfferDetailRow = {
  icon: WorkerV5IconName
  meta: string
  status: string
  title: string
}

export function buildWorkerV5OfferAddressRows(deal: LocalDeal | null, language: AppLanguage): WorkerV5OfferDetailRow[] {
  if (!deal) {
    return [
      {
        icon: 'map',
        meta: textByLanguage(language, 'Chỉ hiện khi có cơ hội thật từ khách.', 'Shown only when there is a real customer opportunity.'),
        status: textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Chưa có điểm hẹn', 'No appointment point'),
      },
      {
        icon: 'profile',
        meta: textByLanguage(language, 'Chưa có khách hàng nào được gửi tới thợ.', 'No customer has been assigned to the worker yet.'),
        status: textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Khách hàng trong ứng dụng', 'In-app customer'),
      },
    ]
  }

  const addressOpen = canShowWorkerAddress(deal)
  const destination = routeDestinationLabel(deal, language)
  return [
    {
      icon: addressOpen ? 'map' : 'shield',
      meta: addressOpen
        ? destination
        : textByLanguage(language, `${destination}. Địa chỉ chi tiết mở sau khi nhận việc.`, `${destination}. Exact address opens after accepting.`),
      status: addressOpen ? textByLanguage(language, 'Đã mở', 'Open') : textByLanguage(language, 'Bảo vệ', 'Protected'),
      title: addressOpen
        ? textByLanguage(language, 'Địa chỉ việc', 'Work address')
        : textByLanguage(language, 'Khu vực việc', 'Work area'),
    },
    {
      icon: 'profile',
      meta: textByLanguage(
        language,
        'Liên hệ và thanh toán được xử lý trong ứng dụng.',
        'Contact and payment are handled in the app.',
      ),
      status: textByLanguage(language, 'Trong app', 'In app'),
      title: textByLanguage(language, 'Khách hàng trong ứng dụng', 'In-app customer'),
    },
  ]
}

export function buildWorkerV5OfferRequestRows(deal: LocalDeal | null, language: AppLanguage): WorkerV5OfferDetailRow[] {
  if (!deal) {
    return [
      {
        icon: 'document',
        meta: textByLanguage(language, 'Yêu cầu sẽ hiện khi có cơ hội phù hợp.', 'Request details appear when a suitable opportunity is ready.'),
        status: textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Chưa có yêu cầu', 'No request yet'),
      },
    ]
  }

  const service = localizedServiceLabel(deal.draft.serviceType, language)
  const problem = deal.broadcast?.problemSummary || deal.draft.inferredProblemLabel || deal.draft.problemChips[0] || service
  const description = deal.draft.description || localizedWorkerBriefLines(deal.broadcast?.prebrief, language)[0] || textByLanguage(language, 'Chưa có mô tả chi tiết.', 'No detailed description yet.')
  const sourceCode = deal.displayCode || deal.broadcast?.broadcastId || deal.broadcast?.jobId || deal.id
  const mediaCount = deal.draft.mediaCount
  return [
    {
      icon: 'document',
      meta: description,
      status: textByLanguage(language, 'Phạm vi hiện tại', 'Current scope'),
      title: problem,
    },
    {
      icon: 'jobs',
      meta: sourceCode
        ? textByLanguage(language, `Nguồn ${sourceCode}`, `Source ${sourceCode}`)
        : textByLanguage(language, 'Nguồn việc chưa có mã hiển thị.', 'Work source has no display code yet.'),
      status: deal.broadcast ? textByLanguage(language, 'Đã gửi', 'Sent') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: service,
    },
    {
      icon: 'evidence',
      meta: mediaCount > 0
        ? textByLanguage(
            language,
            'Ảnh riêng tư chỉ mở sau khi khách xác nhận thợ.',
            'Private photos open only after the customer confirms the worker.',
          )
        : textByLanguage(language, 'Khách chưa gửi ảnh hiện trạng.', 'The customer has not sent condition photos.'),
      status: mediaCount > 0
        ? textByLanguage(language, `${mediaCount} ảnh`, `${mediaCount} photo${mediaCount === 1 ? '' : 's'}`)
        : textByLanguage(language, 'Không có', 'None'),
      title: textByLanguage(language, 'Ảnh hiện trạng từ khách', 'Customer condition photos'),
    },
  ]
}

export function buildWorkerV5OfferSummaryChips(deal: LocalDeal, language: AppLanguage) {
  const destination = routeDestinationLabel(deal, language)
  const timing = deal.broadcast?.secondsRemaining != null
    ? textByLanguage(language, `${deal.broadcast.secondsRemaining} giây còn lại`, `${deal.broadcast.secondsRemaining}s left`)
    : workerV5TimeChoiceLabel(deal.draft.timeChoice, language, deal.scheduledAt)
  const source = deal.broadcast?.status === 'sent'
    ? textByLanguage(language, 'Đã gửi tới bạn', 'Sent to you')
    : localizedStatusLabel(deal.status, language)
  const privacy = canShowWorkerAddress(deal)
    ? textByLanguage(language, 'Địa chỉ đã mở', 'Address open')
    : textByLanguage(language, 'Địa chỉ bảo vệ', 'Address protected')
  return [destination, timing, deal.broadcast ? source : privacy]
}
