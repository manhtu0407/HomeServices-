import { buildLocalJobDisplayCode, type LocalDeal } from '@nestscout/shared'
import { type AppLanguage } from '@/lib/app-language'

export function workerV5DisplayCode(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return null
  if (deal.displayCode) return deal.displayCode
  if (!deal.id.startsWith('local-')) {
    return buildLocalJobDisplayCode({
      createdAt: deal.createdAt,
      jobId: deal.id,
    })
  }
  return language === 'vi' ? 'Nháp dịch vụ' : 'Service draft'
}
