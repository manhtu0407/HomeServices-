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
        meta: textByLanguage(language, 'NestScout chưa gửi khách hàng nào tới thợ.', 'NestScout has not sent any customer to the worker.'),
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
        'Liên hệ và thanh toán được giữ trong workflow NestScout.',
        'Contact and payment stay inside the NestScout workflow.',
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
        meta: textByLanguage(language, 'Yêu cầu sẽ hiện khi backend đồng bộ cơ hội.', 'Request appears after the backend syncs an opportunity.'),
        status: textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Chưa có yêu cầu', 'No request yet'),
      },
    ]
  }

  const service = localizedServiceLabel(deal.draft.serviceType, language)
  const problem = deal.broadcast?.problemSummary || deal.draft.inferredProblemLabel || deal.draft.problemChips[0] || service
  const description = deal.draft.description || localizedWorkerBriefLines(deal.broadcast?.prebrief, language)[0] || textByLanguage(language, 'Chưa có mô tả chi tiết.', 'No detailed description yet.')
  const sourceCode = deal.displayCode || deal.broadcast?.broadcastId || deal.broadcast?.jobId || deal.id
  return [
    {
      icon: 'document',
      meta: description,
      status: textByLanguage(language, 'Scope hiện tại', 'Current scope'),
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
