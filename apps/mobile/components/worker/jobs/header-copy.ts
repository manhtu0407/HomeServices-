import { type LocalDeal } from '@nestscout/shared'
import { type AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import { workerV5DisplayCode } from '../ui/screen-labels'

export function workerV5OfferHeaderSubtitle(deal: LocalDeal | null, language: AppLanguage) {
  const code = workerV5DisplayCode(deal, language)
  if (code) return textByLanguage(language, `Mã việc ${code}`, `Work ${code}`)
  return textByLanguage(language, 'Đề nghị từ dữ liệu thật', 'Offer from real data')
}

export function workerV5CaseHeaderSubtitle(deal: LocalDeal | null, language: AppLanguage) {
  const code = workerV5DisplayCode(deal, language)
  if (code) return textByLanguage(language, `Case ${code}`, `Case ${code}`)
  return textByLanguage(language, 'Case chờ khách phê duyệt', 'Case waiting for customer approval')
}

export function workerV5TravelHeaderSubtitle(deal: LocalDeal | null, language: AppLanguage) {
  const code = workerV5DisplayCode(deal, language)
  if (code) return textByLanguage(language, `Mã việc ${code}`, `Work ${code}`)
  return null
}
