import type { LocalDeal } from '@nestscout/shared'

import {
  localizedStatusLabel,
  type AppLanguage,
} from '@/lib/app-language'

import { textByLanguage } from '../ui/format'

type WorkerV5WorkBoardItem = {
  meta: string
  state: 'active' | 'done' | 'todo'
  title: string
}

export function buildWorkerV5WorkBoardItems(
  deal: LocalDeal | null,
  language: AppLanguage,
  fieldEvidenceCount: number,
): WorkerV5WorkBoardItem[] {
  if (!deal) return []

  const customerEvidenceCount = deal.customerEvidencePhotoUrls?.length ?? 0
  const problemSummary = deal.broadcast?.problemSummary?.trim()
    || deal.draft.description.trim()
    || textByLanguage(language, 'Chưa có mô tả công việc', 'No work description')

  return [
    {
      meta: textByLanguage(language, 'Phạm vi Kael đã đồng bộ', 'Scope synced by Kael'),
      state: 'done',
      title: problemSummary,
    },
    {
      meta: customerEvidenceCount > 0
        ? textByLanguage(language, `${customerEvidenceCount} ảnh đã nhận`, `${customerEvidenceCount} customer photos received`)
        : textByLanguage(language, 'Chưa có ảnh từ khách', 'No customer photos'),
      state: customerEvidenceCount > 0 ? 'done' : 'todo',
      title: textByLanguage(language, 'Bằng chứng từ khách', 'Customer evidence'),
    },
    {
      meta: fieldEvidenceCount > 0
        ? textByLanguage(language, `${fieldEvidenceCount} ảnh đã ghi nhận`, `${fieldEvidenceCount} on-site photos recorded`)
        : textByLanguage(language, 'Chưa có ảnh hiện trường', 'No on-site photos'),
      state: fieldEvidenceCount > 0 ? 'done' : 'active',
      title: textByLanguage(language, 'Bằng chứng hiện trường', 'On-site evidence'),
    },
    {
      meta: textByLanguage(language, 'Trạng thái đã đồng bộ', 'Workflow status synced'),
      state: 'active',
      title: localizedStatusLabel(deal.status, language),
    },
  ]
}
