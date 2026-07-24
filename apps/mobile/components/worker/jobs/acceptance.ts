import type { LocalDeal } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import { routeDestinationLabel } from '../ui/labels'

type WorkerV5ProfileForAcceptance = {
  is_approved: boolean
  is_suspended: boolean
  service_types: readonly string[]
  active_service_types?: readonly string[]
  selected_service_types?: readonly string[]
} | null | undefined

export type WorkerV5AcceptCheckState = 'blocked' | 'done' | 'pending'

export type WorkerV5AcceptCheck = {
  label: string
  meta: string
  state: WorkerV5AcceptCheckState
}

export function buildWorkerV5AcceptReviewChecks(
  deal: LocalDeal | null,
  profile: WorkerV5ProfileForAcceptance,
  language: AppLanguage,
): WorkerV5AcceptCheck[] {
  const offerOpen = workerV5CanAcceptOpenOffer(deal, 'remote_backend')
  const profileReady = Boolean(profile?.is_approved && !profile?.is_suspended)
  const activeServices = profile?.active_service_types
    ?? profile?.selected_service_types
    ?? profile?.service_types
  const serviceMatched = Boolean(deal?.draft.serviceType && activeServices?.includes(deal.draft.serviceType))
  const area = deal ? routeDestinationLabel(deal, language) : textByLanguage(language, 'Chưa có khu vực', 'No area')

  return [
    {
      label: textByLanguage(language, 'Đề nghị còn mở', 'Offer is still open'),
      meta: offerOpen ? textByLanguage(language, 'Đạt', 'Met') : textByLanguage(language, 'Chờ', 'Waiting'),
      state: offerOpen ? 'done' : 'pending',
    },
    {
      label: textByLanguage(language, 'Kỹ năng & giấy tờ phù hợp', 'Skills and documents match'),
      meta: serviceMatched && profileReady
        ? textByLanguage(language, 'Đạt', 'Met')
        : profileReady
          ? textByLanguage(language, 'Chờ khớp', 'Waiting match')
          : textByLanguage(language, 'Cần hồ sơ', 'Profile needed'),
      state: serviceMatched && profileReady ? 'done' : profileReady ? 'pending' : 'blocked',
    },
    {
      label: textByLanguage(language, 'Địa chỉ & thanh toán bảo vệ', 'Protected address and payment'),
      meta: deal?.broadcast ? area : textByLanguage(language, 'Chờ', 'Waiting'),
      state: deal?.broadcast ? 'done' : 'pending',
    },
  ]
}

export function workerV5CanAcceptOpenOffer(deal: LocalDeal | null, workerGate: string | null | undefined) {
  return Boolean(
    workerGate !== 'backend_pending'
    && deal?.broadcast?.status === 'sent'
    && deal.broadcast.jobId,
  )
}
